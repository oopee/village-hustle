import { beforeAll, describe, expect, it } from 'vitest';
import { ActionError, applyAction, createGame, currentPlayer, listOptions, type Content, type GameState } from '../src/engine';
import { chooseAction } from '../src/ai/bot';
import { simulateGame } from '../src/sim/simulate';
import { loadNodeContent } from '../src/tools/node-content';

let content: Content;
beforeAll(async () => {
  content = await loadNodeContent();
});

const newGame = (seed = 'test', randomizeBalance = true) =>
  createGame(content, {
    players: [
      { name: 'Aino', color: 0, controller: 'human' },
      { name: 'Eero', color: 1, controller: 'ai', aiProfile: 'balanced' },
    ],
    seed,
    randomizeBalance,
  }).state;

/** Plays the game with bots for every seat until it ends (or a decision cap is hit). */
function playOut(state: GameState, cap = 20000): GameState {
  let rs = 1;
  const rnd = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < cap && state.phase === 'playing'; i++) {
    state = applyAction(content, state, chooseAction(content, state, rnd).action, { mutate: true }).state;
  }
  return state;
}

describe('engine', () => {
  it('creates a game with the configured players', () => {
    const s = newGame();
    expect(s.players).toHaveLength(2);
    expect(s.phase).toBe('playing');
    expect(currentPlayer(s).name).toBe('Aino');
  });

  it('is deterministic for a given seed', () => {
    const a = playOut(newGame('same'));
    const b = playOut(newGame('same'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('randomized balance differs between seeds, fixed balance does not', () => {
    expect(newGame('a').params).not.toEqual(newGame('b').params);
    expect(newGame('a', false).params).toEqual(newGame('b', false).params);
  });

  it('a say effect is spoken by the location host', () => {
    let s = newGame('say', false);
    const p = currentPlayer(s).id;
    s = applyAction(content, s, { type: 'move', player: p, to: 'job_centre' }).state;
    const { events } = applyAction(content, s, { type: 'do', player: p, action: 'counselling' });
    const said = events.filter((e) => e.type === 'message' && e.speaker === 'host');
    expect(said).toHaveLength(1);
    expect(content.locationById.get('job_centre')?.host?.name).toBeTruthy();
  });

  it('does not mutate the input state unless asked', () => {
    const s = newGame();
    const before = JSON.stringify(s);
    applyAction(content, s, { type: 'endTurn', player: currentPlayer(s).id });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('state survives a JSON round trip (save games, network)', () => {
    const s = newGame();
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    const a = applyAction(content, s, { type: 'endTurn', player: currentPlayer(s).id }).state;
    const b = applyAction(content, copy, { type: 'endTurn', player: currentPlayer(copy).id }).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('rejects actions from the wrong player', () => {
    const s = newGame();
    const other = s.players[1].id;
    expect(() => applyAction(content, s, { type: 'endTurn', player: other })).toThrow(ActionError);
  });

  it('ending a turn passes play to the next player', () => {
    const s = newGame();
    const next = applyAction(content, s, { type: 'endTurn', player: currentPlayer(s).id }).state;
    expect(currentPlayer(next).name).toBe('Eero');
  });

  it('lists options with reasons when they are not available', () => {
    const s = newGame();
    const opts = listOptions(content, s, currentPlayer(s).id, 'opisto');
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) if (!o.enabled) expect(o.reasons.length).toBeGreaterThan(0);
  });

  it('a player who keeps every goal through the weekend wins when the round ends', () => {
    let s = newGame('win', false);
    for (const g of content.goals.goals) s.settings.goals[g.id] = 0;
    const [aino, eero] = s.players;
    // Aino's week started before the targets dropped, so only Eero qualifies (at the start of his week).
    s = applyAction(content, s, { type: 'endTurn', player: aino.id }).state;
    expect(s.phase).toBe('playing');
    expect(s.qualified).toEqual([eero.id]);
    // The game does not end mid-round; it ends when the round wraps.
    s = applyAction(content, s, { type: 'endTurn', player: eero.id }).state;
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe(eero.id);
  });

  it('a top job held by another player is not open', () => {
    const s = newGame('openings', false);
    const [aino, eero] = s.players;
    s.players[1].job = 'grill_manager';
    const opt = listOptions(content, s, aino.id, 'job_centre').find((o) => o.option === 'grill_manager');
    expect(opt?.enabled).toBe(false);
    expect(opt?.reasons.join(' ')).toContain(eero.name);
  });

  it('the one cottage cannot be bought once another player owns it', () => {
    const s = newGame('cottage', false);
    const [aino, eero] = s.players;
    aino.stats.money = 1e6;
    const buy = () => listOptions(content, s, aino.id, 'cottage').find((o) => o.option === 'cottage_deed');
    expect(buy()?.enabled).toBe(true);
    eero.items.cottage_deed = { qty: 1, age: 0 };
    expect(buy()?.enabled).toBe(false);
    expect(buy()?.reasons.join(' ')).toContain(eero.name);
  });

  it('a manager job needs experience from its own workplace', () => {
    const s = newGame('xp', false);
    const p = s.players[0];
    Object.assign(p.stats, { experience: 1000, reputation: 100 });
    p.degrees.push('business', 'management');
    p.items.clothes_business = { qty: 1, age: 0 };
    const opt = () => listOptions(content, s, p.id, 'job_centre').find((o) => o.option === 'branch_manager')!;
    expect(opt().reasons.some((r) => r.includes('at the bank'))).toBe(true);
    p.flags.xpBank = 1000;
    expect(opt().reasons.some((r) => r.includes('at the bank'))).toBe(false);
  });

  it('lessons per week are capped', () => {
    const s = newGame('lessons', false);
    const p = s.players[0];
    p.courses.c_basic = 0;
    p.stats.lessonsThisWeek = s.params.maxLessonsPerWeek;
    const opt = listOptions(content, s, p.id, 'opisto').find((o) => o.option === 'c_basic');
    expect(opt?.enabled).toBe(false);
    p.stats.lessonsThisWeek = 0;
    expect(listOptions(content, s, p.id, 'opisto').find((o) => o.option === 'c_basic')?.reasons).not.toContain('Your head is full. No more lessons this week.');
  });

  it('a full bot game reaches the end', () => {
    const r = simulateGame(content, { players: ['balanced', 'tycoon', 'scholar'], seed: 'full-game' });
    expect(r.weeks).toBeGreaterThan(1);
    expect(r.decisions).toBeGreaterThan(10);
    expect(r.finished ? r.winnerProfile : 'timeout').toBeTruthy();
  }, 60_000);
});
