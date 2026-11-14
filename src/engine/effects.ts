/** Executes effect lists from content files. See docs/CONTENT-GUIDE.md for the effect reference. */
import { evalExpr } from './expr';
import type { EffectDef } from './schema';
import type { Ctx } from './rules-api';
import { setStat } from './scope';

export function runEffects(ctx: Ctx, effects: EffectDef[] | undefined): void {
  if (!effects) return;
  for (const e of effects) runEffect(ctx, e);
}

export function giveItem(ctx: Ctx, id: string, qty = 1) {
  const p = ctx.player;
  const cur = p.items[id];
  if (cur) cur.qty += qty;
  else p.items[id] = { qty, age: 0 };
}

export function takeItem(ctx: Ctx, id: string, qty = 1) {
  const p = ctx.player;
  const cur = p.items[id];
  if (!cur) return;
  cur.qty -= qty;
  if (cur.qty <= 0) delete p.items[id];
}

function runEffect(ctx: Ctx, e: EffectDef): void {
  const p = ctx.player;
  if ('add' in e) {
    for (const [k, v] of Object.entries(e.add)) setStat(ctx, k, (p.stats[k] ?? 0) + ctx.num(v));
  } else if ('set' in e) {
    for (const [k, v] of Object.entries(e.set)) setStat(ctx, k, ctx.num(v));
  } else if ('let' in e) {
    for (const [k, v] of Object.entries(e.let)) ctx.locals[k] = evalExpr(v, envOf(ctx));
  } else if ('setWorld' in e) {
    for (const [k, v] of Object.entries(e.setWorld)) ctx.state.world[k] = ctx.num(v);
  } else if ('setFlag' in e) {
    for (const [k, v] of Object.entries(e.setFlag)) p.flags[k] = evalExpr(v, envOf(ctx)) as string | number | boolean;
  } else if ('give' in e) {
    giveItem(ctx, e.give, e.qty === undefined ? 1 : ctx.num(e.qty));
  } else if ('take' in e) {
    takeItem(ctx, e.take, e.qty === undefined ? 1 : ctx.num(e.qty));
  } else if ('message' in e) {
    ctx.message(e.message, e.tone);
  } else if ('say' in e) {
    ctx.message(e.say, e.tone, 'host');
  } else if ('if' in e) {
    runEffects(ctx, ctx.bool(e.if) ? e.then : e.else);
  } else if ('chance' in e) {
    runEffects(ctx, ctx.random() < ctx.num(e.chance) ? e.then : e.else);
  } else if ('pick' in e) {
    const weights = e.pick.map((o) => Math.max(0, ctx.num(o.weight)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    let r = ctx.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) {
        runEffects(ctx, e.pick[i].do);
        break;
      }
    }
  } else if ('time' in e) {
    p.timeLeft = Math.max(0, p.timeLeft + ctx.num(e.time));
  } else if ('setJob' in e) {
    p.job = e.setJob;
    p.jobSince = ctx.state.week;
  } else if ('setHome' in e) {
    p.home = e.setHome;
  } else if ('grantDegree' in e) {
    if (!p.degrees.includes(e.grantDegree)) p.degrees.push(e.grantDegree);
  } else if ('moveTo' in e) {
    p.node = e.moveTo;
  } else if ('call' in e) {
    const fn = ctx.content.effects[e.call];
    const args: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e.args ?? {})) args[k] = evalExpr(v, envOf(ctx));
    fn(ctx, args);
  } else if ('endTurn' in e) {
    ctx.endTurn = true;
  }
}

function envOf(ctx: Ctx) {
  return (ctx as unknown as { env: import('./expr').ExprEnv }).env;
}
