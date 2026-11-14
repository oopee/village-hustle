/** Balance targets (content/balance-targets.json), target checking and report printing. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SimReport } from './simulate';

export interface Range {
  min?: number;
  max?: number;
}

export interface BalanceTargets {
  games: number;
  players: number;
  randomizeBalance: boolean;
  goals?: Record<string, number>;
  medianWeeks: Range;
  unfinishedRate: Range;
  /** Highest win share of a single profile, relative to a fair share (1.0 = perfectly fair). */
  maxProfileWinRatio: Range;
  comebackRate: Range;
  hungryWeeksPerPlayerWeek: Range;
  evictionsPerGame: Range;
  unusedLocations: Range;
}

export function loadTargets(): BalanceTargets {
  const file = resolve(import.meta.dirname, '../../content/balance-targets.json');
  return JSON.parse(readFileSync(file, 'utf8')) as BalanceTargets;
}

export function checkTargets(r: SimReport, t: BalanceTargets, profileCount: number, players: number) {
  const violations: string[] = [];
  let loss = 0;
  const fairShare = Math.min(1, players / profileCount) / Math.min(players, profileCount);
  const metrics: [string, number, Range][] = [
    ['median game length (weeks)', r.medianWeeks, t.medianWeeks],
    ['games hitting the time limit', r.unfinishedRate, t.unfinishedRate],
    ['strongest strategy win ratio vs fair', r.maxProfileWinShare / Math.max(1e-9, fairShare), t.maxProfileWinRatio],
    ['comeback wins', r.comebackRate, t.comebackRate],
    ['hungry weeks per player-week', r.hungryWeeksPerPlayerWeek, t.hungryWeeksPerPlayerWeek],
    ['evictions per game', r.evictionsPerGame, t.evictionsPerGame],
    ['unused locations', r.unusedLocations.length, t.unusedLocations],
  ];
  for (const [name, value, range] of metrics) {
    const scale = Math.max(Math.abs(range.max ?? range.min ?? 1), 1);
    if (range.min !== undefined && value < range.min) {
      violations.push(`${name}: ${fmt(value)} is below ${fmt(range.min)}`);
      loss += (range.min - value) / scale;
    }
    if (range.max !== undefined && value > range.max) {
      violations.push(`${name}: ${fmt(value)} is above ${fmt(range.max)}`);
      loss += (value - range.max) / scale;
    }
  }
  return { violations, loss };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function printReport(r: SimReport, profileCount: number, players: number) {
  const fairShare = Math.min(1, players / profileCount) / Math.min(players, profileCount);
  console.log(`\n=== Balance report (${r.games} games) ===`);
  console.log(`Game length: median ${r.medianWeeks} weeks (10%: ${r.p10Weeks}, 90%: ${r.p90Weeks})`);
  console.log(`Hit time limit: ${pct(r.unfinishedRate)}`);
  console.log(`Comeback wins (winner was not leading at week 8): ${pct(r.comebackRate)}`);
  console.log(`Hungry weeks: ${pct(r.hungryWeeksPerPlayerWeek)} of player-weeks;  evictions per game: ${r.evictionsPerGame.toFixed(2)}`);
  console.log(`\nWins by strategy (fair share ≈ ${pct(fairShare)}):`);
  for (const [k, v] of Object.entries(r.winRateByProfile).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${pct(v)}`);
  console.log(`\nAverage final goal scores (0-100):`);
  for (const [k, v] of Object.entries(r.finalGoalAvg)) console.log(`  ${k.padEnd(12)} ${v.toFixed(0)}`);
  console.log(`\nLocation visits:`);
  for (const [k, v] of Object.entries(r.locationShare).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(18)} ${pct(v)}`);
  if (r.unusedLocations.length) console.log(`Unused locations: ${r.unusedLocations.join(', ')}`);
  if (r.rareActions.length) console.log(`Rarely used actions (<0.05 per game): ${r.rareActions.join(', ')}`);
  console.log(`Bot decisions per game: ${r.avgDecisionsPerGame.toFixed(0)}`);
}
