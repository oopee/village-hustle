/**
 * Builds the evaluation context (Ctx) for expressions and effects, and implements
 * the built-in expression functions listed in builtins-list.ts.
 */
import type { Content } from './content';
import { ExprError, evalBool, evalNum, interpolate, type Expr, type ExprEnv } from './expr';
import type { Requirement } from './schema';
import { nextRandom } from './rng';
import type { Ctx } from './rules-api';
import type { GameEvent, GameState, PlayerState, Tone } from './state';

interface InternalCtx extends Ctx {
  env: ExprEnv;
}

export function makeCtx(
  content: Content,
  state: GameState,
  player: PlayerState,
  events: GameEvent[],
  locals: Record<string, unknown> = {},
): Ctx {
  const ctx = {
    content,
    state,
    player,
    locals,
    events,
    endTurn: false,
  } as InternalCtx;
  ctx.env = {
    resolve: (path) => resolvePath(ctx, path),
    call: (name, args) => callFunction(ctx, name, args),
  };
  ctx.random = () => nextRandom(state);
  ctx.num = (e: Expr) => evalNum(e, ctx.env);
  ctx.bool = (e: Expr) => evalBool(e, ctx.env);
  ctx.message = (text: string, tone: Tone = 'info', speaker?: 'host') => {
    const ev: GameEvent = { type: 'message', player: player.id, text: interpolate(text, ctx.env), tone };
    if (speaker) ev.speaker = speaker;
    events.push(ev);
  };
  return ctx;
}

/** Runs fn with extra local variables, restoring the previous locals afterwards. */
export function withLocals<T>(ctx: Ctx, extra: Record<string, unknown>, fn: () => T): T {
  const saved = ctx.locals;
  ctx.locals = { ...saved, ...extra };
  try {
    return fn();
  } finally {
    ctx.locals = saved;
  }
}

export function interp(ctx: Ctx, text: string): string {
  return interpolate(text, (ctx as InternalCtx).env);
}

function playerField(ctx: Ctx, p: PlayerState, name: string): unknown {
  if (name in p.stats) return p.stats[name];
  switch (name) {
    case 'job':
      return p.job ?? '';
    case 'home':
      return p.home;
    case 'node':
      return p.node;
    case 'location':
      return ctx.content.locationByNode.get(p.node)?.id ?? '';
    case 'timeLeft':
      return p.timeLeft;
    case 'name':
      return p.name;
    case 'week':
      return ctx.state.week;
    case 'turnsTaken':
      return p.turnsTaken;
  }
  if (ctx.content.statById.has(name)) return 0;
  throw new ExprError(`Unknown name '${name}'`);
}

function resolvePath(ctx: Ctx, path: string[]): unknown {
  const [head, field] = path;
  if (path.length === 1) {
    if (head in ctx.locals) return ctx.locals[head];
    return playerField(ctx, ctx.player, head);
  }
  if (path.length === 2) {
    switch (head) {
      case 'player':
        return playerField(ctx, ctx.player, field);
      case 'params': {
        const v = ctx.state.params[field];
        if (v === undefined) throw new ExprError(`Unknown parameter 'params.${field}'`);
        return v;
      }
      case 'world':
        if (field === 'week') return ctx.state.week;
        return ctx.state.world[field] ?? 0;
    }
    const obj = ctx.locals[head];
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[field];
  }
  throw new ExprError(`Unknown name '${path.join('.')}'`);
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v));
const str = (v: unknown) => String(v);

function callFunction(ctx: Ctx, name: string, args: unknown[]): unknown {
  const p = ctx.player;
  const c = ctx.content;
  switch (name) {
    case 'min':
      return Math.min(...args.map(num));
    case 'max':
      return Math.max(...args.map(num));
    case 'clamp':
      return Math.min(Math.max(num(args[0]), num(args[1])), num(args[2]));
    case 'round':
      return Math.round(num(args[0]));
    case 'floor':
      return Math.floor(num(args[0]));
    case 'ceil':
      return Math.ceil(num(args[0]));
    case 'abs':
      return Math.abs(num(args[0]));
    case 'rnd':
      return ctx.random();
    case 'randInt': {
      const lo = num(args[0]);
      const hi = num(args[1]);
      return lo + Math.floor(ctx.random() * (hi - lo + 1));
    }
    case 'has':
      return (p.items[str(args[0])]?.qty ?? 0) > 0;
    case 'qty':
      return p.items[str(args[0])]?.qty ?? 0;
    case 'itemAge':
      return p.items[str(args[0])]?.age ?? 0;
    case 'best': {
      const tag = str(args[0]);
      let best = 0;
      for (const id in p.items) {
        if (p.items[id].qty <= 0) continue;
        const v = c.itemById.get(id)?.tags[tag] ?? 0;
        if (v > best) best = v;
      }
      return best;
    }
    case 'degree':
      return p.degrees.includes(str(args[0]));
    case 'degreeCount':
      return p.degrees.length;
    case 'degreePoints':
      return p.degrees.reduce((s, d) => s + (c.degreeById.get(d)?.points ?? 0), 0);
    case 'enrolled':
      return args.length ? str(args[0]) in p.courses : Object.keys(p.courses).length > 0;
    case 'progress':
      return p.courses[str(args[0])] ?? 0;
    case 'jobIs':
      return p.job === str(args[0]);
    case 'jobLevel':
    case 'jobCareer': {
      const id = args.length ? str(args[0]) : p.job;
      const job = id ? c.jobById.get(id) : undefined;
      return job ? ctx.num(job.career) : 0;
    }
    case 'jobWage': {
      const id = args.length ? str(args[0]) : p.job;
      const job = id ? c.jobById.get(id) : undefined;
      return job ? withLocals(ctx, { jobId: job.id }, () => ctx.num(job.wage)) : 0;
    }
    case 'jobLocation':
      return p.job ? (c.jobById.get(p.job)?.location ?? '') : '';
    case 'weeksInJob':
      return p.job ? ctx.state.week - p.jobSince : 0;
    case 'canWork': {
      const job = c.jobById.get(str(args[0]));
      if (!job || failedRequirements(ctx, job.requires).length) return false;
      if (job.openings === undefined) return true;
      const others = ctx.state.players.filter((q) => q.id !== p.id && q.job === job.id).length;
      return others < ctx.num(job.openings);
    }
    case 'statMax':
      return statMax(ctx, str(args[0]));
    case 'itemsValue': {
      let total = 0;
      for (const id in p.items) {
        const it = c.itemById.get(id);
        if (!it?.value || p.items[id].qty <= 0) continue;
        total += p.items[id].qty * withLocals(ctx, { item: id, age: p.items[id].age }, () => ctx.num(it.value!));
      }
      return total;
    }
    case 'homeIs':
      return p.home === str(args[0]);
    case 'ownedBy': {
      // Names of the other players who own the item ('' if nobody), e.g. for one-of-a-kind property.
      const id = str(args[0]);
      return ctx.state.players
        .filter((q) => q.id !== p.id && (q.items[id]?.qty ?? 0) > 0)
        .map((q) => q.name)
        .join(', ');
    }
    case 'flag':
      return p.flags[str(args[0])] ?? 0;
    case 'turns':
      return p.turnsTaken;
    case 'hint': {
      const hints = c.rules.hints;
      return hints.length ? hints[Math.floor(ctx.random() * hints.length)] : '';
    }
  }
  const fn = c.functions[name];
  if (fn) return fn(ctx, ...args);
  throw new ExprError(`Unknown function '${name}()'`);
}

export function statMax(ctx: Ctx, id: string): number {
  const def = ctx.content.statById.get(id);
  return def?.max === undefined ? Infinity : ctx.num(def.max);
}

export function statMin(ctx: Ctx, id: string): number {
  const def = ctx.content.statById.get(id);
  return def ? ctx.num(def.min) : 0;
}

export function setStat(ctx: Ctx, id: string, value: number) {
  const v = Math.min(Math.max(value, statMin(ctx, id)), statMax(ctx, id));
  ctx.player.stats[id] = Math.round(v * 1000) / 1000;
}

/** Returns the failure messages of requirements that are not met. */
export function failedRequirements(ctx: Ctx, reqs: Requirement[] | undefined): string[] {
  const out: string[] = [];
  for (const r of reqs ?? []) {
    const test = typeof r === 'string' ? r : r.test;
    if (!ctx.bool(test)) out.push(typeof r === 'string' ? 'Requirements not met.' : interp(ctx, r.message));
  }
  return out;
}
