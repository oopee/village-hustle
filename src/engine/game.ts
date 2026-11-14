/**
 * The game engine: pure functions over (content, state, action).
 *
 *   createGame(content, setup)          -> { state, events }
 *   applyAction(content, state, action) -> { state, events }   (throws ActionError if illegal)
 *   listOptions(content, state, playerId, locationId?)          (what can be done here, and why not)
 *
 * The engine never touches the DOM, timers or Math.random, so the same code can run
 * in the browser, in the simulator, or on a server for network play.
 */
import { mapPath, type Content } from './content';
import { runEffects, giveItem, takeItem } from './effects';
import { hashString, nextRandom, randomSeedString } from './rng';
import type { ActionDef, LocationDef } from './schema';
import type { Ctx } from './rules-api';
import { failedRequirements, makeCtx, setStat, withLocals } from './scope';
import {
  ActionError,
  cloneState,
  type Action,
  type GameEvent,
  type GameSetup,
  type GameState,
  type PlayerState,
} from './state';

export interface ActionOption {
  location: string;
  action: string;
  option?: string;
  kind: ActionDef['kind'];
  /** Group heading (the action's label) and the option's own label. */
  group: string;
  label: string;
  detail?: string;
  description?: string;
  time: number;
  cost: number;
  enabled: boolean;
  reasons: string[];
}

interface OptionImpl {
  option?: string;
  label: string;
  detail?: string;
  description?: string;
  time: number;
  cost: number;
  reasons: string[];
  locals?: Record<string, unknown>;
  run(ctx: Ctx): void;
}

// ---------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------

export function rollParams(content: Content, randomize: boolean, random: () => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, p] of Object.entries(content.params)) {
    let v = p.value;
    if (randomize && p.vary > 0) v = v * (1 + (random() * 2 - 1) * p.vary);
    out[k] = p.round ? Math.round(v) : Math.round(v * 10000) / 10000;
  }
  return out;
}

export function createGame(content: Content, setup: GameSetup): { state: GameState; events: GameEvent[] } {
  const { min, max } = content.game.players;
  if (setup.players.length < min || setup.players.length > max) {
    throw new ActionError(`This game needs ${min}-${max} players.`);
  }
  const seed = setup.seed?.trim() || randomSeedString();
  const goals: Record<string, number> = {};
  for (const g of content.goals.goals) goals[g.id] = setup.goals?.[g.id] ?? g.defaultTarget;

  const state: GameState = {
    version: 1,
    contentHash: content.hash,
    seed,
    rng: hashString(seed),
    week: 1,
    current: 0,
    phase: 'playing',
    params: {},
    world: { ...content.game.world },
    settings: { goals, randomizeBalance: !!setup.randomizeBalance },
    players: [],
    winner: null,
  };
  state.params = rollParams(content, state.settings.randomizeBalance, () => nextRandom(state));

  const homeLoc = content.locationById.get(content.game.startHome)!;
  setup.players.forEach((ps, i) => {
    const stats: Record<string, number> = {};
    for (const s of content.stats) stats[s.id] = s.default;
    const player: PlayerState = {
      id: `p${i + 1}`,
      name: ps.name.trim() || `Player ${i + 1}`,
      color: ps.color,
      controller: ps.controller,
      aiProfile: ps.controller === 'ai' ? (ps.aiProfile ?? content.ai.profiles[0].id) : undefined,
      node: homeLoc.node,
      home: homeLoc.id,
      timeLeft: 0,
      stats,
      items: {},
      job: null,
      jobSince: 1,
      degrees: [],
      courses: {},
      flags: {},
      turnsTaken: 0,
    };
    state.players.push(player);
    const ctx = makeCtx(content, state, player, []);
    for (const [k, v] of Object.entries(content.game.startStats)) setStat(ctx, k, ctx.num(v));
    for (const [k, q] of Object.entries(content.game.startItems)) giveItem(ctx, k, q);
  });

  const events: GameEvent[] = [];
  startTurn(content, state, events);
  return { state, events };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.current];
}

export function locationAt(content: Content, node: string): LocationDef | undefined {
  return content.locationByNode.get(node);
}

export function travelTime(content: Content, state: GameState, player: PlayerState, to: string): number {
  if (player.node === to) return 0;
  const distance = content.map.dist[player.node]?.[to];
  if (distance === undefined || distance === Infinity) return Infinity;
  const ctx = makeCtx(content, state, player, [], { distance });
  return Math.max(0, ctx.num(content.game.travelTime));
}

export function goalScores(content: Content, state: GameState, player: PlayerState): Record<string, number> {
  const ctx = makeCtx(content, state, player, []);
  const out: Record<string, number> = {};
  for (const g of content.goals.goals) out[g.id] = Math.max(0, Math.min(100, ctx.num(g.score)));
  return out;
}

export function isLocationOpen(content: Content, state: GameState, player: PlayerState, loc: LocationDef): boolean {
  if (loc.openIf === undefined) return true;
  return makeCtx(content, state, player, []).bool(loc.openIf);
}

/**
 * Lists everything the player could do at a location (default: where they stand).
 * `assumeTimeLeft` lets AI planners ask "what if I walked there first".
 */
export function listOptions(
  content: Content,
  state: GameState,
  playerId: string,
  locationId?: string,
  assumeTimeLeft?: number,
): ActionOption[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const loc = locationId ? content.locationById.get(locationId) : locationAt(content, player.node);
  if (!loc) return [];
  const timeLeft = assumeTimeLeft ?? player.timeLeft;
  const ctx = makeCtx(content, state, player, []);
  if (loc.openIf !== undefined && !ctx.bool(loc.openIf)) return [];
  const out: ActionOption[] = [];
  for (const a of loc.actions) {
    for (const o of optionImpls(ctx, loc, a)) {
      const reasons = [...o.reasons];
      if (o.time > timeLeft) reasons.push('Not enough time left this week.');
      if (o.cost > (player.stats.money ?? 0)) reasons.push('Not enough money.');
      out.push({
        location: loc.id,
        action: a.id,
        option: o.option,
        kind: a.kind,
        group: a.label ?? defaultGroupLabel(a.kind),
        label: o.label,
        detail: o.detail,
        description: o.description,
        time: o.time,
        cost: o.cost,
        enabled: reasons.length === 0,
        reasons,
      });
    }
  }
  return out;
}

function defaultGroupLabel(kind: ActionDef['kind']): string {
  switch (kind) {
    case 'shop':
      return 'Buy';
    case 'jobs':
      return 'Job vacancies';
    case 'work':
      return 'Work';
    case 'courses':
      return 'Courses';
    case 'transfer':
      return 'Transfer';
    case 'sell':
      return 'Sell';
    default:
      return 'Actions';
  }
}

// ---------------------------------------------------------------------------
// Action option builders (one per action kind)
// ---------------------------------------------------------------------------

function optionImpls(ctx: Ctx, loc: LocationDef, a: ActionDef): OptionImpl[] {
  if (a.visible !== undefined && !ctx.bool(a.visible)) return [];
  const c = ctx.content;
  const p = ctx.player;
  const baseTime = a.time === undefined ? 0 : ctx.num(a.time);
  const baseCost = a.cost === undefined ? 0 : ctx.num(a.cost);
  const baseReasons = failedRequirements(ctx, a.requires);
  const cur = c.game.currency;
  const unit = c.game.timeUnit;

  switch (a.kind) {
    case 'basic':
      return [
        {
          label: a.label ?? a.id,
          description: a.description,
          time: baseTime,
          cost: baseCost,
          reasons: baseReasons,
          locals: { cost: baseCost },
          run: () => {},
        },
      ];

    case 'shop':
      return a.items.flatMap((id) => {
        const it = c.itemById.get(id)!;
        return withLocals(ctx, { item: id }, () => {
          const price = Math.round(ctx.num(it.price));
          const time = it.time === undefined ? baseTime : ctx.num(it.time);
          const reasons = [...baseReasons, ...failedRequirements(ctx, it.requires)];
          if (!it.consumable) {
            const max = it.max === undefined ? 1 : ctx.num(it.max);
            if ((p.items[id]?.qty ?? 0) >= max) reasons.push(max === 1 ? 'You already own one.' : 'You cannot carry more.');
          }
          return [
            {
              option: id,
              label: it.name,
              description: it.description,
              time,
              cost: price + baseCost,
              reasons,
              locals: { item: id, price },
              run: (rc: Ctx) => {
                if (!it.consumable) giveItem(rc, id, 1);
                const before = rc.events.length;
                runEffects(rc, it.onBuy);
                if (!rc.events.slice(before).some((e) => e.type === 'message')) rc.message(`You bought: ${it.name}.`);
              },
            },
          ];
        });
      });

    case 'jobs': {
      const jobs = a.jobs ? a.jobs.map((id) => c.jobById.get(id)!) : c.jobs;
      return jobs.map((job) =>
        withLocals(ctx, { jobId: job.id }, () => {
          const wage = ctx.num(job.wage);
          const where = c.locationById.get(job.location)?.name ?? job.location;
          const reasons = [...baseReasons];
          if (p.job === job.id) reasons.push('This is already your job.');
          else {
            reasons.push(...failedRequirements(ctx, job.requires));
            const holders = jobHolders(ctx, job.id);
            if (holders) reasons.push(`The position is taken (${holders}).`);
          }
          return {
            option: job.id,
            label: `${job.title} — ${where}`,
            detail: `${cur}${wage.toFixed(wage < 10 ? 1 : 0)}/${unit}`,
            description: job.description,
            time: baseTime,
            cost: baseCost,
            reasons,
            locals: { jobId: job.id, wage },
            run: (rc: Ctx) => {
              if (rc.random() < rc.num(job.hireChance)) {
                rc.player.job = job.id;
                rc.player.jobSince = rc.state.week;
                rc.message(`You got the job: ${job.title}!`, 'good');
              } else {
                rc.message(job.rejectText ?? 'They hired someone else this time. Try again later.', 'bad');
              }
            },
          };
        }),
      );
    }

    case 'work': {
      if (!p.job) return [];
      const job = c.jobById.get(p.job);
      if (!job || job.location !== loc.id) return [];
      return [
        withLocals(ctx, { jobId: job.id }, () => {
          const shift = ctx.num(job.shift);
          const hours = Math.min(shift, p.timeLeft);
          const wage = ctx.num(job.wage);
          const reasons = [...baseReasons];
          if (hours < 1) reasons.push('Not enough time left for a shift.');
          return {
            label: `Work as ${job.title}`,
            time: Math.max(hours, 1),
            cost: baseCost,
            reasons,
            locals: { jobId: job.id, hours, wage },
            run: (rc: Ctx) => {
              const pay = Math.round(hours * wage);
              rc.locals.pay = pay;
              setStat(rc, 'money', (rc.player.stats.money ?? 0) + pay);
              runEffects(rc, job.onWork);
              runEffects(rc, rc.content.rules.afterWork);
              rc.message(`You worked ${Math.round(hours)}${unit} as ${job.title} and earned ${cur}${pay}.`, 'good');
            },
          };
        }),
      ];
    }

    case 'courses': {
      const courses = a.courses ? a.courses.map((id) => c.courseById.get(id)!) : c.courses.filter((co) => co.location === loc.id);
      const out: OptionImpl[] = [];
      for (const co of courses) {
        if (p.degrees.includes(co.degree)) continue;
        out.push(
          withLocals(ctx, { course: co.id }, () => {
            const lessons = Math.max(1, Math.round(ctx.num(co.lessons)));
            if (co.id in p.courses) {
              const done = p.courses[co.id];
              const time = ctx.num(co.lessonTime);
              return {
                option: co.id,
                label: `Attend: ${co.name}`,
                detail: `${done}/${lessons}`,
                description: co.description,
                time,
                cost: baseCost,
                reasons: [...baseReasons, ...failedRequirements(ctx, c.rules.lessonRequires)],
                locals: { course: co.id, lessons, lessonsDone: done },
                run: (rc: Ctx) => {
                  rc.locals.gain = 1;
                  runEffects(rc, co.onLesson);
                  runEffects(rc, rc.content.rules.afterLesson);
                  const gain = Math.max(0, Math.round(Number(rc.locals.gain) || 0));
                  const now = (rc.player.courses[co.id] ?? 0) + gain;
                  if (now >= lessons) {
                    delete rc.player.courses[co.id];
                    if (!rc.player.degrees.includes(co.degree)) rc.player.degrees.push(co.degree);
                    const deg = rc.content.degreeById.get(co.degree)!;
                    rc.message(`Congratulations! You completed ${co.name} and earned: ${deg.name}.`, 'good');
                    runEffects(rc, co.onComplete);
                  } else {
                    rc.player.courses[co.id] = now;
                    rc.message(gain > 1 ? `A very productive lesson! (${now}/${lessons})` : `You attended a lesson of ${co.name}. (${now}/${lessons})`);
                  }
                },
              };
            }
            const fee = Math.round(ctx.num(co.fee));
            const reasons = [...baseReasons, ...failedRequirements(ctx, co.requires)];
            const maxEnroll = ctx.num(c.game.maxEnrollments);
            if (Object.keys(p.courses).length >= maxEnroll) reasons.push('You are already enrolled in as many courses as you can handle.');
            return {
              option: co.id,
              label: `Enroll: ${co.name}`,
              detail: `${lessons} lessons × ${Math.round(ctx.num(co.lessonTime))}${unit}`,
              description: co.description,
              time: baseTime,
              cost: fee + baseCost,
              reasons,
              locals: { course: co.id, fee, lessons },
              run: (rc: Ctx) => {
                rc.player.courses[co.id] = 0;
                rc.message(`You enrolled in ${co.name}. Lessons: ${lessons}.`, 'good');
              },
            };
          }),
        );
      }
      return out;
    }

    case 'transfer': {
      const fromLabel = c.statById.get(a.from)?.label ?? a.from;
      const have = p.stats[a.from] ?? 0;
      const opts: OptionImpl[] = a.amounts.map((amount) => ({
        option: String(amount),
        label: `${a.label ?? 'Transfer'} ${cur}${amount}`,
        time: baseTime,
        cost: 0,
        reasons: have >= amount ? [...baseReasons] : [...baseReasons, `Not enough ${fromLabel.toLowerCase()}.`],
        locals: { amount },
        run: (rc: Ctx) => transfer(rc, a.from, a.to, amount),
      }));
      if (a.allowAll) {
        const amount = Math.floor(have);
        opts.push({
          option: 'all',
          label: `${a.label ?? 'Transfer'} all (${cur}${amount})`,
          time: baseTime,
          cost: 0,
          reasons: amount > 0 ? [...baseReasons] : [...baseReasons, `You have no ${fromLabel.toLowerCase()}.`],
          locals: { amount },
          run: (rc: Ctx) => transfer(rc, a.from, a.to, amount),
        });
      }
      return opts;
    }

    case 'sell': {
      const out: OptionImpl[] = [];
      for (const id of Object.keys(p.items)) {
        const it = c.itemById.get(id);
        if (!it || !a.categories.includes(it.category) || !it.sellValue) continue;
        out.push(
          withLocals(ctx, { item: id, age: p.items[id].age }, () => {
            const price = Math.max(0, Math.round(ctx.num(it.sellValue!)));
            return {
              option: id,
              label: `Sell ${it.name}`,
              detail: `${cur}${price}`,
              time: baseTime,
              cost: 0,
              reasons: [...baseReasons],
              locals: { item: id, price },
              run: (rc: Ctx) => {
                takeItem(rc, id, 1);
                setStat(rc, 'money', (rc.player.stats.money ?? 0) + price);
                rc.message(`You sold ${it.name} for ${cur}${price}.`);
              },
            };
          }),
        );
      }
      return out;
    }
  }
}

/** Names of the other players filling every opening of a job, or '' when there is room. */
export function jobHolders(ctx: Ctx, jobId: string): string {
  const job = ctx.content.jobById.get(jobId);
  if (!job || job.openings === undefined) return '';
  const others = ctx.state.players.filter((q) => q.id !== ctx.player.id && q.job === jobId);
  return others.length >= ctx.num(job.openings) ? others.map((q) => q.name).join(', ') : '';
}

function transfer(ctx: Ctx, from: string, to: string, amount: number) {
  const p = ctx.player;
  const moved = Math.min(amount, p.stats[from] ?? 0);
  setStat(ctx, from, (p.stats[from] ?? 0) - moved);
  setStat(ctx, to, (p.stats[to] ?? 0) + moved);
}

// ---------------------------------------------------------------------------
// Applying actions
// ---------------------------------------------------------------------------

export interface ApplyOptions {
  /** Mutate the given state instead of cloning it (used by simulators for speed). */
  mutate?: boolean;
}

export function applyAction(
  content: Content,
  state: GameState,
  action: Action,
  opts: ApplyOptions = {},
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'playing') throw new ActionError('The game is over.');
  const s = opts.mutate ? state : cloneState(state);
  const p = s.players[s.current];
  if (action.player !== p.id) throw new ActionError('It is not your turn.');
  const events: GameEvent[] = [];
  const ctx = makeCtx(content, s, p, events);

  switch (action.type) {
    case 'move':
      doMove(ctx, action.to);
      break;
    case 'do':
      doLocationAction(ctx, action.action, action.option);
      break;
    case 'endTurn':
      endTurn(content, s, events);
      return { state: s, events };
  }

  if (s.phase === 'playing') {
    if (content.game.winCheck === 'immediate') checkWin(ctx);
    else noticeGoalsMet(ctx);
    if (s.phase === 'playing' && (ctx.endTurn || p.timeLeft <= 0)) {
      if (p.timeLeft <= 0) events.push({ type: 'message', player: p.id, text: 'Your time is up for this week.', tone: 'info' });
      endTurn(content, s, events);
    }
  }
  return { state: s, events };
}

function doMove(ctx: Ctx, to: string) {
  const { content: c, player: p, state: s } = ctx;
  if (!(to in c.map.dist)) throw new ActionError(`Unknown place '${to}'.`);
  if (p.node === to) throw new ActionError('You are already there.');
  const time = travelTime(c, s, p, to);
  if (time > p.timeLeft) throw new ActionError('Not enough time left to walk there.');
  const path = mapPath(c.map, p.node, to);
  p.timeLeft = Math.max(0, p.timeLeft - time);
  p.node = to;
  ctx.events.push({ type: 'moved', player: p.id, path, time });
  withLocals(ctx, { distance: c.map.dist[path[0]][to] }, () => runEffects(ctx, c.rules.afterMove));
  const loc = locationAt(c, to);
  if (loc && isLocationOpen(c, s, p, loc)) runEffects(ctx, loc.onArrive);
}

function doLocationAction(ctx: Ctx, actionId: string, option: string | undefined) {
  const { content: c, player: p } = ctx;
  const loc = locationAt(c, p.node);
  if (!loc) throw new ActionError('There is nothing to do here.');
  if (!isLocationOpen(c, ctx.state, p, loc)) throw new ActionError(`${loc.name} is closed.`);
  const a = loc.actions.find((x) => x.id === actionId);
  if (!a) throw new ActionError(`Unknown action '${actionId}'.`);
  const impl = optionImpls(ctx, loc, a).find((o) => o.option === option);
  if (!impl) throw new ActionError('That option is not available.');
  if (impl.reasons.length) throw new ActionError(impl.reasons[0]);
  if (impl.time > p.timeLeft) throw new ActionError('Not enough time left this week.');
  if (impl.cost > (p.stats.money ?? 0)) throw new ActionError('Not enough money.');

  p.timeLeft = Math.max(0, p.timeLeft - impl.time);
  setStat(ctx, 'money', (p.stats.money ?? 0) - impl.cost);
  ctx.events.push({ type: 'did', player: p.id, location: loc.id, action: a.id, option, label: impl.label });
  withLocals(ctx, { ...impl.locals, cost: impl.cost }, () => {
    impl.run(ctx);
    runEffects(ctx, a.effects);
  });
  for (const m of c.modules) m.afterAction?.(ctx, { location: loc.id, action: a.id, option });
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function homeNode(content: Content, p: PlayerState): string {
  return content.locationById.get(p.home)?.node ?? content.locationById.get(content.game.startHome)!.node;
}

function endTurn(content: Content, s: GameState, events: GameEvent[]) {
  const p = s.players[s.current];
  const ctx = makeCtx(content, s, p, events);
  for (const m of content.modules) m.onTurnEnd?.(ctx);
  p.timeLeft = 0;
  p.node = homeNode(content, p);
  events.push({ type: 'turnEnded', player: p.id });
  if (s.phase !== 'playing') return;

  s.current++;
  if (s.current >= s.players.length) {
    if (s.qualified?.length) {
      finishRound(content, s, events);
      return;
    }
    s.current = 0;
    const wctx = makeCtx(content, s, s.players[0], events);
    runEffects(wctx, content.rules.weekEnd);
    for (const m of content.modules) m.onWeekEnd?.(wctx);
    events.push({ type: 'weekEnded', week: s.week });
    s.week++;
    if (s.week > content.game.maxWeeks) {
      endByProgress(content, s, events);
      return;
    }
  }
  startTurn(content, s, events);
}

function startTurn(content: Content, s: GameState, events: GameEvent[]) {
  const p = s.players[s.current];
  const ctx = makeCtx(content, s, p, events);
  p.node = homeNode(content, p);
  p.timeLeft = Math.max(0, Math.round(ctx.num(content.game.turnTime)));
  events.push({ type: 'turnStarted', player: p.id, week: s.week });

  if (p.turnsTaken > 0) {
    // Items age and wear out.
    for (const id of Object.keys(p.items)) {
      const it = content.itemById.get(id);
      const owned = p.items[id];
      owned.age++;
      if (!it) continue;
      withLocals(ctx, { item: id, age: owned.age }, () => {
        runEffects(ctx, it.weekly);
        if (it.wearWeeks !== undefined && owned.age >= ctx.num(it.wearWeeks)) {
          takeItem(ctx, id, 1);
          if (p.items[id]) p.items[id].age = 0;
          ctx.message(it.wornOutText ?? `Your ${it.name} wore out.`, 'bad');
        }
      });
    }
    runEffects(ctx, content.rules.turnStart);
    for (const m of content.modules) m.onTurnStart?.(ctx);
    rollEvent(ctx);
    p.timeLeft = Math.max(0, p.timeLeft);
  }
  p.turnsTaken++;
  checkWin(ctx);
}

function rollEvent(ctx: Ctx) {
  const c = ctx.content;
  if (!c.events.length) return;
  if (ctx.random() >= ctx.num(c.game.eventChance)) return;
  const eligible = c.events.filter((e) => e.requires === undefined || ctx.bool(e.requires));
  const weights = eligible.map((e) => Math.max(0, ctx.num(e.weight)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return;
  let r = ctx.random() * total;
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i];
    if (r < 0) {
      runEffects(ctx, eligible[i].effects);
      return;
    }
  }
}

function allGoalsMet(c: Content, s: GameState, p: PlayerState): boolean {
  const scores = goalScores(c, s, p);
  return c.goals.goals.every((g) => scores[g.id] >= s.settings.goals[g.id]);
}

/** Called at the start of a player's turn (both win modes) and after every action (immediate mode). */
function checkWin(ctx: Ctx) {
  const { content: c, state: s, player: p } = ctx;
  if (s.phase !== 'playing' || !allGoalsMet(c, s, p)) return;
  if (c.game.winCheck === 'immediate') {
    s.phase = 'ended';
    s.winner = p.id;
    s.endReason = 'goals';
    ctx.events.push({ type: 'gameOver', winner: p.id, reason: 'goals' });
    return;
  }
  if (s.qualified?.includes(p.id)) return;
  s.qualified = [...(s.qualified ?? []), p.id];
  const last = s.current === s.players.length - 1;
  ctx.message(
    last || s.players.length === 1
      ? `${p.name} kept every goal through the weekend! This is the last week: the game ends when ${p.name}'s week is over.`
      : `${p.name} kept every goal through the weekend! This is the last week: the game ends when everyone has played it. Anyone else who kept every goal this weekend is in the running too, and the one furthest past their goals wins.`,
    'good',
  );
}

/** weekStart mode: tell the player once per turn that they only need to hold on now. */
function noticeGoalsMet(ctx: Ctx) {
  const { content: c, state: s, player: p } = ctx;
  if (p.flags.goalsNotice === s.week || !allGoalsMet(c, s, p)) return;
  p.flags.goalsNotice = s.week;
  ctx.message('Every goal is met! Keep them through the weekend and you win.', 'good');
}

/** End of a round in which someone qualified: the qualifier with the biggest margin wins. */
function finishRound(content: Content, s: GameState, events: GameEvent[]) {
  const margin = (p: PlayerState) => {
    const scores = goalScores(content, s, p);
    return content.goals.goals.reduce((sum, g) => sum + scores[g.id] / Math.max(1, s.settings.goals[g.id]), 0);
  };
  const qs = s.players.filter((p) => s.qualified!.includes(p.id));
  qs.sort((a, b) => margin(b) - margin(a));
  s.current = s.players.length - 1;
  s.phase = 'ended';
  s.winner = qs[0].id;
  s.endReason = 'goals';
  events.push({ type: 'gameOver', winner: s.winner, reason: 'goals' });
}

/** Warnings for a player about to end their week early (rules.json turnEndChecks). */
export function turnEndWarnings(content: Content, state: GameState, playerId: string): string[] {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return [];
  const ctx = makeCtx(content, state, p, []);
  return failedRequirements(ctx, content.rules.turnEndChecks);
}

/** Overall progress 0..1: average of goal completion (each capped at 1). */
export function overallProgress(content: Content, state: GameState, player: PlayerState): number {
  const scores = goalScores(content, state, player);
  const gs = content.goals.goals;
  return gs.reduce((sum, g) => sum + Math.min(1, scores[g.id] / Math.max(1, state.settings.goals[g.id])), 0) / gs.length;
}

function endByProgress(content: Content, s: GameState, events: GameEvent[]) {
  let best: PlayerState | null = null;
  let bestScore = -1;
  for (const p of s.players) {
    const v = overallProgress(content, s, p);
    if (v > bestScore) {
      bestScore = v;
      best = p;
    }
  }
  s.phase = 'ended';
  s.winner = best?.id ?? null;
  s.endReason = 'maxWeeks';
  events.push({ type: 'gameOver', winner: s.winner, reason: 'maxWeeks' });
}
