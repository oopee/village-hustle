/**
 * npm run diag -- [--games 4] [--seed x] [--at 40]
 * Plays bot games and prints each player's situation at a given week and at the end
 * (goal scores, job, home, degrees). Useful for finding where bots get stuck.
 * Prints game state only, never balance parameter values.
 */
import { applyAction, createGame, goalScores, type Content, type GameState } from '../engine';
import { chooseAction, rankActions } from '../ai/bot';
import { loadTargets } from '../sim/report';
import { loadNodeContent } from './node-content';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const content = await loadNodeContent();
const targets = loadTargets();
const games = Number(opt('games', '4'));
const at = Number(opt('at', '40'));
const seed = opt('seed', 'sim');
const profiles = content.ai.profiles.map((p) => p.id);

function describe(c: Content, s: GameState) {
  for (const p of s.players) {
    const g = goalScores(c, s, p);
    const goals = c.goals.goals.map((x) => `${x.id.slice(0, 4)} ${Math.round(g[x.id])}/${s.settings.goals[x.id]}`).join('  ');
    console.log(
      `  ${p.aiProfile!.padEnd(9)} ${goals} | job ${p.job ?? '-'} | home ${p.home} | deg ${p.degrees.length} | courses ${Object.keys(p.courses).join(',') || '-'}`,
    );
  }
}

for (let g = 0; g < games; g++) {
  let rs = g * 7919 + 1;
  const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  const seats = Array.from({ length: targets.players }, (_, i) => profiles[(g + i) % profiles.length]);
  let { state } = createGame(content, {
    players: seats.map((p, i) => ({ name: `P${i + 1}`, color: i, controller: 'ai', aiProfile: p })),
    seed: `${seed}-${g}`,
    randomizeBalance: targets.randomizeBalance,
    goals: targets.goals,
  });
  let shown = false;
  while (state.phase === 'playing') {
    state = applyAction(content, state, chooseAction(content, state, rnd).action, { mutate: true }).state;
    if (!shown && state.week >= at) {
      console.log(`game ${g + 1}, week ${state.week}:`);
      describe(content, state);
      const cur = state.players[state.current];
      console.log(`  ${cur.aiProfile} (degrees ${cur.degrees.join(',')}) top options at turn start:`);
      for (const c of rankActions(content, state).slice(0, 12)) console.log(`    ${c.score.toFixed(2).padStart(7)}  ${c.intent}`);
      shown = true;
    }
  }
  console.log(`game ${g + 1} ended week ${state.week} (${state.endReason}), winner ${state.players.find((p) => p.id === state.winner)?.aiProfile}`);
  describe(content, state);
}
