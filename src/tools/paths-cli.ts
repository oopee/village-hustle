/**
 * npm run paths -- [--games 24] [--seed x]
 * Plays bot games and counts which routes players took to their goals: final jobs, raises,
 * promotions, skills tests, shares, the kiosk, the band, a let cottage, self-taught knowledge.
 * Prints counts only, never balance parameter values.
 */
import { applyAction, createGame, type GameState } from '../engine';
import { chooseAction } from '../ai/bot';
import { loadTargets } from '../sim/report';
import { loadNodeContent } from './node-content';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const content = await loadNodeContent();
const targets = loadTargets();
const games = Number(opt('games', '24'));
const seed = opt('seed', 'paths');
const profiles = content.ai.profiles.map((p) => p.id);

const count = new Map<string, number>();
const bump = (k: string, n = 1) => count.set(k, (count.get(k) ?? 0) + n);
const winners = new Map<string, number>();

for (let g = 0; g < games; g++) {
  let rs = g * 7919 + 1;
  const rnd = () => (rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296;
  const seats = Array.from({ length: targets.players }, (_, i) => profiles[(g + i) % profiles.length]);
  let { state } = createGame(content, {
    players: seats.map((p, i) => ({ name: `P${i + 1}`, color: i, controller: 'ai', aiProfile: p })),
    seed: `${seed}-${g}`,
    randomizeBalance: targets.randomizeBalance,
    goals: targets.goals,
  });
  const seen = new Set<string>();
  const once = (k: string) => {
    if (!seen.has(k)) {
      seen.add(k);
      bump(k.replace(/^[^:]+:/, ''));
    }
  };
  while (state.phase === 'playing') {
    const res = applyAction(content, state, chooseAction(content, state, rnd).action, { mutate: true });
    state = res.state as GameState;
    for (const e of res.events) {
      if (e.type === 'did') once(`${e.player}:did ${e.location}.${e.action}`);
      if (e.type === 'message' && /promoted to/.test(e.text)) bump('event: promotion');
      if (e.type === 'message' && /raise/i.test(e.text) && e.tone === 'good') bump('event: raise');
    }
  }
  const win = state.players.find((p) => p.id === state.winner);
  if (win) {
    winners.set(`winner job: ${win.job ?? '-'}`, (winners.get(`winner job: ${win.job ?? '-'}`) ?? 0) + 1);
    if ((win.stats.shares ?? 0) >= 1) bump('winner held shares');
    if (win.items.beach_kiosk) bump('winner ran the kiosk');
  }
  for (const p of state.players) {
    bump(`final job: ${p.job ?? '-'}`);
    if ((p.stats.shares ?? 0) >= 1) bump('ended with shares');
    if (p.items.cottage_deed && p.home !== 'cottage') bump('let the cottage');
    if ((p.stats.knowledge ?? 0) >= 50) bump('knowledge >= half');
  }
}

const show = (m: Map<string, number>) =>
  [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, v]) => console.log(`  ${k.padEnd(44)} ${v}`));
console.log(`${games} games, ${games * targets.players} players`);
show(count);
show(winners);
