/**
 * Computer player. Used both as in-game opponents and by the balancing simulator.
 *
 * Strategy: for every reachable location option, simulate "walk there + do it" on a
 * cloned state, score the resulting position, divide by the time it took, and pick
 * the best (with some profile-dependent randomness). Everything it values comes from
 * content: goals (goals.json), needs (ai.json) and optional "ai" hints on actions.
 */
import type { Content } from '../engine/content';
import { applyAction, currentPlayer, goalScores, listOptions, travelTime } from '../engine/game';
import { makeCtx } from '../engine/scope';
import type { AiProfile } from '../engine/schema';
import { cloneState, type Action, type GameState, type PlayerState } from '../engine/state';

export interface BotChoice {
  action: Action;
  /** What the bot intends to do (for UI display/debugging). */
  intent: string;
  score: number;
}

/**
 * Concave progress curve: early progress on a lagging goal is worth more than late
 * progress, but the slope never reaches zero before the target (a flat tail made bots
 * idle just short of winning).
 */
const shaped = (x: number) => (x - 0.35 * x * x) / 0.65;
/** Extra value for having a goal fully met (all goals must be met to win). */
const GOAL_MET_BONUS = 15;
const OVER_TARGET_SLOPE = 0.25;
const OVER_TARGET_CAP = 0.5;
/** How much a job the player could apply for (but has not) is worth compared to having it. */
const APPLY_DISCOUNT = 0.7;

export function profileFor(content: Content, player: PlayerState): AiProfile {
  return content.ai.profiles.find((p) => p.id === player.aiProfile) ?? content.ai.profiles[0];
}

function goalValue(content: Content, state: GameState, profile: AiProfile, scores: Record<string, number>): number {
  let v = 0;
  for (const g of content.goals.goals) {
    const w = profile.goals[g.id] ?? 1;
    const target = Math.max(1, state.settings.goals[g.id]);
    const raw = scores[g.id] / target;
    const x = Math.min(1, raw);
    // A little value beyond the target: a buffer makes spending on the other goals affordable.
    const over = Math.min(OVER_TARGET_CAP, Math.max(0, raw - 1)) * OVER_TARGET_SLOPE;
    v += 100 * w * (shaped(x) + over) + (x >= 1 ? GOAL_MET_BONUS * w : 0);
  }
  return v;
}

/** Scores how good a position is for a player (higher is better). */
export function evaluatePosition(content: Content, state: GameState, player: PlayerState, profile: AiProfile): number {
  const scores = goalScores(content, state, player);
  const baseGoals = goalValue(content, state, profile, scores);
  const basePotential = careerPotential(content, state, player, profile, scores);
  let v = baseGoals + basePotential;

  // Courses in progress are worth part of the degree they lead to (and the jobs it unlocks).
  for (const courseId of Object.keys(player.courses)) {
    const course = content.courseById.get(courseId);
    if (!course) continue;
    const ctx = makeCtx(content, state, player, [], { course: courseId });
    const lessons = Math.max(1, ctx.num(course.lessons));
    player.degrees.push(course.degree);
    const withScores = goalScores(content, state, player);
    const withDegree = goalValue(content, state, profile, withScores);
    const unlock = careerPotential(content, state, player, profile, withScores);
    player.degrees.pop();
    const frac = 0.5 + 0.5 * Math.min(1, (player.courses[courseId] ?? 0) / lessons);
    v += (withDegree - baseGoals + Math.max(0, unlock - basePotential)) * frac;
  }

  // Needs from ai.json.
  const ctx = makeCtx(content, state, player, []);
  for (const n of content.ai.needs) v += n.weight * profile.caution * ctx.num(n.value);
  return v;
}

/**
 * Goal value the player can still expect from their career, on top of the current score:
 * the current job's full-tenure value (guaranteed by staying) plus, discounted, the best
 * other job they qualify for right now. Assumes the "career" goal scores jobCareer() with tenure.
 */
function careerPotential(content: Content, state: GameState, player: PlayerState, profile: AiProfile, scores: Record<string, number>): number {
  if (scores.career === undefined) return 0;
  const ctx = makeCtx(content, state, player, []);
  const eventual = Math.max(scores.career, ctx.num('jobCareer()'));
  let best = eventual;
  for (const j of content.jobs) {
    if (j.id === player.job) continue;
    const career = ctx.num(j.career);
    if (career <= best) continue;
    if (ctx.bool(`canWork('${j.id}')`)) best = career;
  }
  const valueAt = (career: number) => goalValue(content, state, profile, { ...scores, career });
  const now = valueAt(scores.career);
  const stay = valueAt(eventual);
  return stay - now + APPLY_DISCOUNT * (valueAt(best) - stay);
}

/** Chooses the next action for the current player. `random` must return [0,1). */
export function chooseAction(content: Content, state: GameState, random: () => number = Math.random): BotChoice {
  const p = currentPlayer(state);
  const end: BotChoice = { action: { type: 'endTurn', player: p.id }, intent: 'End turn', score: 0 };
  if (state.phase !== 'playing') return end;
  const profile = profileFor(content, p);
  const candidates = rankActions(content, state);
  const positive = candidates.filter((c) => c.score > 0.05);
  if (!positive.length) return end;
  if (random() < profile.randomness) {
    const pool = positive.slice(0, Math.min(4, positive.length));
    return pool[Math.floor(random() * pool.length)];
  }
  return positive[0];
}

/** All options the current player could take now, best first (score = value gained per hour). */
export function rankActions(content: Content, state: GameState): BotChoice[] {
  const p = currentPlayer(state);
  const profile = profileFor(content, p);
  const base = evaluatePosition(content, state, p, profile);
  const candidates: BotChoice[] = [];
  let salt = 0;

  for (const loc of content.locations) {
    const here = loc.node === p.node;
    const travel = here ? 0 : travelTime(content, state, p, loc.node);
    if (travel > p.timeLeft) continue;
    const opts = listOptions(content, state, p.id, loc.id, p.timeLeft - travel);
    for (const o of opts) {
      if (!o.enabled) continue;
      const s2 = cloneState(state);
      // Scramble the RNG so the bot cannot "see" the real outcome of random actions.
      s2.rng = (state.rng ^ Math.imul(0x9e3779b1, ++salt)) | 0;
      try {
        if (!here) {
          applyAction(content, s2, { type: 'move', player: p.id, to: loc.node }, { mutate: true });
          if (s2.current !== state.current || s2.phase !== 'playing') continue;
        }
        applyAction(content, s2, { type: 'do', player: p.id, action: o.action, option: o.option }, { mutate: true });
      } catch {
        continue;
      }
      const p2 = s2.players.find((x) => x.id === p.id)!;
      let value = evaluatePosition(content, s2, p2, profile) - base;
      if (s2.winner === p.id) value += 1e6;
      const def = loc.actions.find((a) => a.id === o.action);
      if (def?.ai !== undefined) value += makeCtx(content, state, p, [], { item: o.option }).num(def.ai);
      const score = value / Math.max(1, travel + o.time);
      candidates.push({
        action: here ? { type: 'do', player: p.id, action: o.action, option: o.option } : { type: 'move', player: p.id, to: loc.node },
        intent: `${o.label} @ ${loc.name}`,
        score,
      });
    }
  }

  candidates.push(...fundedCandidates(content, state, profile, base, () => ++salt));
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Two-step plans for options blocked only by cash on hand: walk to a place that turns
 * savings (or any other stat) into money, take out enough, then do the option.
 * Found from content: every "transfer" action whose target stat is money.
 */
function fundedCandidates(content: Content, state: GameState, profile: AiProfile, base: number, nextSalt: () => number): BotChoice[] {
  const p = currentPlayer(state);
  const money = p.stats.money ?? 0;
  const sources = content.locations.flatMap((loc) =>
    loc.actions.flatMap((a) =>
      a.kind === 'transfer' && a.to === 'money' ? [{ loc, action: a.id, from: a.from, all: a.allowAll, amounts: [...a.amounts].sort((x, y) => x - y) }] : [],
    ),
  );
  if (!sources.length) return [];
  const out: BotChoice[] = [];
  for (const loc of content.locations) {
    const travel = loc.node === p.node ? 0 : travelTime(content, state, p, loc.node);
    if (travel > p.timeLeft) continue;
    for (const o of listOptions(content, state, p.id, loc.id, p.timeLeft - travel)) {
      if (o.enabled || o.reasons.length !== 1 || o.reasons[0] !== 'Not enough money.') continue;
      for (const src of sources) {
        const have = p.stats[src.from] ?? 0;
        const fixed = src.amounts.find((a) => money + a >= o.cost && a <= have);
        const amount = fixed !== undefined ? String(fixed) : src.all && money + Math.floor(have) >= o.cost ? 'all' : undefined;
        if (amount === undefined) continue;
        const s2 = cloneState(state);
        s2.rng = (state.rng ^ Math.imul(0x9e3779b1, nextSalt())) | 0;
        const atSource = src.loc.node === p.node;
        try {
          if (!atSource) applyAction(content, s2, { type: 'move', player: p.id, to: src.loc.node }, { mutate: true });
          applyAction(content, s2, { type: 'do', player: p.id, action: src.action, option: amount }, { mutate: true });
          if (src.loc.node !== loc.node) applyAction(content, s2, { type: 'move', player: p.id, to: loc.node }, { mutate: true });
          applyAction(content, s2, { type: 'do', player: p.id, action: o.action, option: o.option }, { mutate: true });
        } catch {
          continue;
        }
        if (s2.current !== state.current || s2.phase !== 'playing') continue;
        const p2 = s2.players.find((x) => x.id === p.id)!;
        let value = evaluatePosition(content, s2, p2, profile) - base;
        const def = loc.actions.find((a) => a.id === o.action);
        if (def?.ai !== undefined) value += makeCtx(content, state, p, [], { item: o.option }).num(def.ai);
        const spent = Math.max(1, p.timeLeft - p2.timeLeft);
        out.push({
          action: atSource
            ? { type: 'do', player: p.id, action: src.action, option: amount }
            : { type: 'move', player: p.id, to: src.loc.node },
          intent: `${o.label} @ ${loc.name} (withdraw first)`,
          score: value / spent,
        });
        break;
      }
    }
  }
  return out;
}
