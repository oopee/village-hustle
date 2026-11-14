/**
 * Headless game simulation with bots, and aggregate balance metrics.
 * Prints/returns only metrics, never parameter values, so the rules stay a black box.
 */
import { chooseAction } from '../ai/bot';
import type { Content } from '../engine/content';
import { applyAction, createGame, goalScores, overallProgress } from '../engine/game';
import { nextRandom } from '../engine/rng';
import type { GameState } from '../engine/state';

export interface SimGameResult {
  weeks: number;
  finished: boolean;
  winnerProfile: string | null;
  winnerSeat: number;
  /** Was the eventual winner behind (lowest-but-one or worse) at week 8? */
  comeback: boolean;
  locationVisits: Record<string, number>;
  actionUses: Record<string, number>;
  hungryWeeks: number;
  evictions: number;
  playerWeeks: number;
  finalGoalAvg: Record<string, number>;
  decisions: number;
}

export interface SimOptions {
  players: string[]; // ai profile ids per seat
  seed: string;
  goals?: Record<string, number>;
  randomizeBalance?: boolean;
  maxDecisionsPerTurn?: number;
}

export function simulateGame(content: Content, opts: SimOptions): SimGameResult {
  let { state } = createGame(content, {
    players: opts.players.map((id, i) => ({ name: `${id}#${i + 1}`, color: i, controller: 'ai', aiProfile: id })),
    goals: opts.goals,
    randomizeBalance: opts.randomizeBalance,
    seed: opts.seed,
  });
  const botRng = { rng: (state.rng ^ 0x5bd1e995) | 0 };
  const random = () => nextRandom(botRng);
  const locationVisits: Record<string, number> = {};
  const actionUses: Record<string, number> = {};
  let hungryWeeks = 0;
  let evictions = 0;
  let decisions = 0;
  let turnDecisions = 0;
  let progressAt8: number[] | null = null;
  const maxPerTurn = opts.maxDecisionsPerTurn ?? 40;

  while (state.phase === 'playing') {
    const pid = state.players[state.current].id;
    let action = chooseAction(content, state, random).action;
    if (++turnDecisions > maxPerTurn) action = { type: 'endTurn', player: pid };
    decisions++;
    const r = applyAction(content, state, action, { mutate: true });
    state = r.state;
    for (const e of r.events) {
      if (e.type === 'moved') {
        const loc = content.locationByNode.get(e.path[e.path.length - 1]);
        if (loc) locationVisits[loc.id] = (locationVisits[loc.id] ?? 0) + 1;
      } else if (e.type === 'did') {
        const key = `${e.location}.${e.action}`;
        actionUses[key] = (actionUses[key] ?? 0) + 1;
      } else if (e.type === 'turnStarted') {
        turnDecisions = 0;
      } else if (e.type === 'message') {
        if (e.text.startsWith('There was no food')) hungryWeeks++;
        if (e.text.startsWith('You were evicted')) evictions++;
      } else if (e.type === 'weekEnded' && e.week === 8) {
        progressAt8 = state.players.map((p) => overallProgress(content, state, p));
      }
    }
  }
  return summarize(content, state, opts, { locationVisits, actionUses, hungryWeeks, evictions, decisions, progressAt8 });
}

function summarize(
  content: Content,
  state: GameState,
  opts: SimOptions,
  acc: {
    locationVisits: Record<string, number>;
    actionUses: Record<string, number>;
    hungryWeeks: number;
    evictions: number;
    decisions: number;
    progressAt8: number[] | null;
  },
): SimGameResult {
  const seat = state.players.findIndex((p) => p.id === state.winner);
  let comeback = false;
  if (acc.progressAt8 && seat >= 0) {
    const sorted = [...acc.progressAt8].sort((a, b) => b - a);
    comeback = acc.progressAt8[seat] < sorted[0] - 1e-9;
  }
  const finalGoalAvg: Record<string, number> = {};
  for (const g of content.goals.goals) {
    finalGoalAvg[g.id] = state.players.reduce((s, p) => s + goalScores(content, state, p)[g.id], 0) / state.players.length;
  }
  return {
    weeks: state.week,
    finished: state.endReason === 'goals',
    winnerProfile: seat >= 0 ? opts.players[seat] : null,
    winnerSeat: seat,
    comeback,
    locationVisits: acc.locationVisits,
    actionUses: acc.actionUses,
    hungryWeeks: acc.hungryWeeks,
    evictions: acc.evictions,
    playerWeeks: state.week * state.players.length,
    finalGoalAvg,
    decisions: acc.decisions,
  };
}

export interface SimReport {
  games: number;
  medianWeeks: number;
  p10Weeks: number;
  p90Weeks: number;
  unfinishedRate: number;
  winRateByProfile: Record<string, number>;
  maxProfileWinShare: number;
  comebackRate: number;
  hungryWeeksPerPlayerWeek: number;
  evictionsPerGame: number;
  locationShare: Record<string, number>;
  unusedLocations: string[];
  rareActions: string[];
  finalGoalAvg: Record<string, number>;
  avgDecisionsPerGame: number;
}

export function aggregate(content: Content, results: SimGameResult[]): SimReport {
  const weeks = results.map((r) => r.weeks).sort((a, b) => a - b);
  const q = (f: number) => weeks[Math.min(weeks.length - 1, Math.floor(f * weeks.length))];
  const wins: Record<string, number> = {};
  const visits: Record<string, number> = {};
  const uses: Record<string, number> = {};
  let hungry = 0;
  let pw = 0;
  let evictions = 0;
  const goalAvg: Record<string, number> = {};
  for (const r of results) {
    if (r.winnerProfile) wins[r.winnerProfile] = (wins[r.winnerProfile] ?? 0) + 1;
    for (const [k, v] of Object.entries(r.locationVisits)) visits[k] = (visits[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.actionUses)) uses[k] = (uses[k] ?? 0) + v;
    hungry += r.hungryWeeks;
    pw += r.playerWeeks;
    evictions += r.evictions;
    for (const [k, v] of Object.entries(r.finalGoalAvg)) goalAvg[k] = (goalAvg[k] ?? 0) + v / results.length;
  }
  const totalVisits = Object.values(visits).reduce((a, b) => a + b, 0) || 1;
  const locationShare: Record<string, number> = {};
  for (const l of content.locations) locationShare[l.id] = (visits[l.id] ?? 0) / totalVisits;
  const unused = content.locations.filter((l) => locationShare[l.id] < 0.005).map((l) => l.id);
  const allActions = content.locations.flatMap((l) => l.actions.map((a) => `${l.id}.${a.id}`));
  const rare = allActions.filter((k) => (uses[k] ?? 0) / results.length < 0.05);
  return {
    games: results.length,
    medianWeeks: q(0.5),
    p10Weeks: q(0.1),
    p90Weeks: q(0.9),
    unfinishedRate: results.filter((r) => !r.finished).length / results.length,
    winRateByProfile: Object.fromEntries(Object.entries(wins).map(([k, v]) => [k, v / results.length])),
    maxProfileWinShare: Math.max(0, ...Object.values(wins)) / results.length,
    comebackRate: results.filter((r) => r.comeback).length / Math.max(1, results.filter((r) => r.winnerProfile).length),
    hungryWeeksPerPlayerWeek: hungry / Math.max(1, pw),
    evictionsPerGame: evictions / results.length,
    locationShare,
    unusedLocations: unused,
    rareActions: rare,
    finalGoalAvg: goalAvg,
    avgDecisionsPerGame: results.reduce((s, r) => s + r.decisions, 0) / results.length,
  };
}
