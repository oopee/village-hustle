/**
 * npm run tune -- [--iterations 30] [--games 60] [--only a,b,c] [--seed x] [--threads N] [--dry]
 *
 * Auto-tuner for the game master. Searches the balance parameters that have a
 * "tune" range in content/balance.json, using bot simulations scored against
 * content/balance-targets.json (stochastic hill climbing with common random
 * numbers: every candidate is played on the same seeds).
 *
 * It prints metrics and which parameters moved (up/down), never their values.
 * Unless --dry is given, improved values are written back to balance.json and the
 * previous file is kept in .sim-cache/.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { aggregate } from '../sim/simulate';
import { SimPool, standardJobs } from '../sim/pool';
import { checkTargets, loadTargets } from '../sim/report';
import { CONTENT_DIR, loadNodeContent } from './node-content';

const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name: string) => args.includes(`--${name}`);

const content = await loadNodeContent();
const targets = loadTargets();
const iterations = Number(opt('iterations', '30'));
const games = Number(opt('games', String(targets.games)));
const players = targets.players;
const profiles = content.ai.profiles.map((p) => p.id);
const seed = opt('seed', `tune-${Date.now() % 100000}`)!;
const only = opt('only')?.split(',');

const tunable = Object.entries(content.params)
  .filter(([k, p]) => p.tune && (!only || only.includes(k)))
  .map(([k, p]) => ({ key: k, min: p.tune![0], max: p.tune![1], round: p.round }));
if (!tunable.length) {
  console.log('No tunable parameters (add "tune": [min, max] to parameters in balance.json).');
  process.exit(0);
}

const base: Record<string, number> = Object.fromEntries(Object.entries(content.params).map(([k, p]) => [k, p.value]));
const pool = new SimPool(opt('threads') ? Number(opt('threads')) : undefined);
console.log(`Tuning ${tunable.length} parameters, ${iterations} iterations x ${games} games on ${pool.size} threads.`);

let rngState = 12345;
const rand = () => {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 4294967296;
};
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

async function evaluate(values: Record<string, number>, label: string) {
  const jobs = standardJobs({ games, players, profiles, seed, randomize: targets.randomizeBalance, goals: targets.goals, overrides: values });
  const results = await pool.runAll(jobs, (d) => {
    if (process.stdout.isTTY) process.stdout.write(`\r  ${label}: ${d}/${games}   `);
  });
  if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(40) + '\r');
  const report = aggregate(content, results);
  return { report, ...checkTargets(report, targets, profiles.length, players) };
}

const t0 = Date.now();
let best = { values: { ...base }, ...(await evaluate(base, 'baseline')) };
const startLoss = best.loss;
console.log(`baseline: loss ${best.loss.toFixed(3)}, ${best.violations.length} target miss(es)`);
for (const v of best.violations) console.log(`  - ${v}`);

for (let it = 1; it <= iterations && best.loss > 0; it++) {
  const temperature = 1 - (it - 1) / iterations;
  const cand = { ...best.values };
  const n = 1 + Math.floor(rand() * Math.min(3, tunable.length));
  const picked = new Set<number>();
  while (picked.size < n) picked.add(Math.floor(rand() * tunable.length));
  for (const i of picked) {
    const t = tunable[i];
    const step = gauss() * (t.max - t.min) * 0.2 * (0.3 + 0.7 * temperature);
    let v = Math.min(t.max, Math.max(t.min, cand[t.key] + step));
    v = t.round ? Math.round(v) : Math.round(v * 1000) / 1000;
    cand[t.key] = v;
  }
  const r = await evaluate(cand, `iteration ${it}/${iterations}`);
  const accepted = r.loss < best.loss;
  console.log(`iteration ${it}: loss ${r.loss.toFixed(3)} ${accepted ? '✓ improved' : ''}`);
  if (accepted) best = { values: cand, ...r };
}
await pool.close();

const changed = tunable.filter((t) => best.values[t.key] !== base[t.key]);
console.log(`\nLoss ${startLoss.toFixed(3)} -> ${best.loss.toFixed(3)} in ${((Date.now() - t0) / 60000).toFixed(1)} min.`);
console.log(best.violations.length ? `Remaining target misses:\n  - ${best.violations.join('\n  - ')}` : 'All targets met.');
if (changed.length) {
  console.log(`Changed parameters: ${changed.map((t) => `${t.key} ${best.values[t.key] > base[t.key] ? '↑' : '↓'}`).join(', ')}`);
}

if (!flag('dry') && changed.length) {
  const file = join(CONTENT_DIR, 'balance.json');
  const cache = resolve(CONTENT_DIR, '../.sim-cache');
  mkdirSync(cache, { recursive: true });
  const backup = join(cache, `balance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  copyFileSync(file, backup);
  let text = readFileSync(file, 'utf8');
  for (const t of changed) text = replaceParamValue(text, t.key, best.values[t.key]);
  writeFileSync(file, text);
  console.log(`balance.json updated (previous version saved in .sim-cache/).`);
} else if (changed.length) console.log('Dry run: balance.json not changed.');

/** Replaces a parameter's value in balance.json text, keeping the file's formatting. */
function replaceParamValue(text: string, key: string, value: number): string {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const num = '-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?';
  const obj = new RegExp(`("${k}"\\s*:\\s*\\{[^}]*?"value"\\s*:\\s*)(${num})`);
  if (obj.test(text)) return text.replace(obj, `$1${value}`);
  const plain = new RegExp(`("${k}"\\s*:\\s*)(${num})`);
  if (plain.test(text)) return text.replace(plain, `$1${value}`);
  throw new Error(`Could not find parameter ${key} in balance.json`);
}
