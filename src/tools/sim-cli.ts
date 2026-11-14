/**
 * npm run sim -- [--games 60] [--players 4] [--profiles balanced,tycoon,...] [--seed x]
 *                [--no-randomize] [--threads N] [--verbose]
 *
 * Plays bot-only games in parallel and prints balance metrics (never parameter values).
 */
import { aggregate } from '../sim/simulate';
import { SimPool, standardJobs } from '../sim/pool';
import { checkTargets, loadTargets, printReport } from '../sim/report';
import { loadNodeContent } from './node-content';

const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name: string) => args.includes(`--${name}`);

const content = await loadNodeContent();
const targets = loadTargets();
const games = Number(opt('games', String(targets.games)));
const players = Number(opt('players', String(targets.players)));
const profiles = (opt('profiles') ?? content.ai.profiles.map((p) => p.id).join(',')).split(',');
const seed = opt('seed', 'sim')!;
const randomize = flag('no-randomize') ? false : flag('randomize') || targets.randomizeBalance;
const threads = opt('threads') ? Number(opt('threads')) : undefined;

const t0 = Date.now();
const pool = new SimPool(threads);
const jobs = standardJobs({ games, players, profiles, seed, randomize, goals: targets.goals });
const results = await pool.runAll(jobs, (done) => {
  if (process.stdout.isTTY) process.stdout.write(`\rSimulating ${done}/${games} on ${pool.size} threads...`);
});
await pool.close();
if (process.stdout.isTTY) process.stdout.write('\n');
if (flag('verbose')) results.forEach((r, g) => console.log(`game ${g + 1}: ${r.weeks} weeks, winner ${r.winnerProfile ?? '-'}${r.finished ? '' : ' (time limit)'}`));

const report = aggregate(content, results);
printReport(report, profiles.length, players);
const check = checkTargets(report, targets, profiles.length, players);
console.log(`\nTarget check: ${check.violations.length ? check.violations.length + ' miss(es)' : 'all targets met'}  (loss ${check.loss.toFixed(3)})`);
for (const v of check.violations) console.log(`  - ${v}`);
console.log(`\n${games} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
