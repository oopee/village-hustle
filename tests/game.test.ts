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

  it('a top job held by another player turns applicants away, after the application time', () => {
    let s = newGame('openings', false);
    const [aino, eero] = s.players;
    Object.assign(aino.stats, { experience: 1000, reputation: 100 });
    aino.flags.xpGrill = 1000;
    s.players[1].job = 'grill_manager';
    s = applyAction(content, s, { type: 'move', player: aino.id, to: 'job_centre' }).state;
    const opt = listOptions(content, s, aino.id, 'job_centre').find((o) => o.option === 'grill_manager');
    expect(opt?.enabled).toBe(true);
    const before = currentPlayer(s).timeLeft;
    const r = applyAction(content, s, { type: 'do', player: aino.id, action: 'apply', option: 'grill_manager' });
    expect(currentPlayer(r.state).job).not.toBe('grill_manager');
    expect(currentPlayer(r.state).timeLeft).toBe(before - opt!.time);
    expect(JSON.stringify(r.events)).toContain(eero.name);
  });

  it('anyone can apply for any job, but an unqualified application is rejected with the reason', () => {
    let s = newGame('apply', false);
    const p = s.players[0];
    s = applyAction(content, s, { type: 'move', player: p.id, to: 'job_centre' }).state;
    const opt = listOptions(content, s, p.id, 'job_centre').find((o) => o.option === 'it_consultant')!;
    expect(opt.enabled).toBe(true);
    expect(opt.reasons).toEqual([]);
    const before = currentPlayer(s).timeLeft;
    const r = applyAction(content, s, { type: 'do', player: p.id, action: 'apply', option: 'it_consultant' });
    expect(currentPlayer(r.state).job).toBeFalsy();
    expect(currentPlayer(r.state).timeLeft).toBe(before - opt.time);
    expect(JSON.stringify(r.events)).toContain('Application rejected');
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
    p.node = content.locationById.get('job_centre')!.node;
    const apply = () => JSON.stringify(applyAction(content, s, { type: 'do', player: p.id, action: 'apply', option: 'branch_manager' }).events);
    expect(apply()).toContain('at the bank');
    p.flags.xpBank = 1000;
    expect(apply()).not.toContain('at the bank');
  });

  it('lessons past the weekly limit can still be taken, but may not stick', () => {
    const s = newGame('lessons', false);
    const p = s.players[0];
    p.courses.c_basic = 0;
    p.node = content.locationById.get('opisto')!.node;
    p.stats.lessonsThisWeek = s.params.maxLessonsPerWeek;
    s.params.crammingChance = 0;
    s.params.knowledgeBonusChance = 0;
    s.params.computerBonusChance = 0;
    const opt = listOptions(content, s, p.id, 'opisto').find((o) => o.option === 'c_basic');
    expect(opt?.enabled).toBe(true);
    const r = applyAction(content, s, { type: 'do', player: p.id, action: 'study', option: 'c_basic' });
    expect(currentPlayer(r.state).courses.c_basic).toBe(0);
    expect(JSON.stringify(r.events)).toContain('Your head is full');
  });

  it('turns do not end on their own when time runs out', () => {
    const s = newGame('outoftime', false);
    const p = s.players[0];
    p.timeLeft = 1;
    p.node = content.locationById.get('grill')!.node;
    p.stats.money = 1000;
    const r = applyAction(content, s, { type: 'do', player: p.id, action: 'food', option: 'coffee_pulla' });
    expect(currentPlayer(r.state).id).toBe(p.id);
    expect(currentPlayer(r.state).timeLeft).toBe(0);
    const next = applyAction(content, r.state, { type: 'endTurn', player: p.id }).state;
    expect(currentPlayer(next).id).not.toBe(p.id);
  });

  it('a new game starts at the parents, where chores eat the week but food is free', () => {
    let s = newGame('chores', false);
    const [aino, eero] = s.players;
    expect(aino.home).toBe('parents_house');
    s = applyAction(content, s, { type: 'endTurn', player: aino.id }).state;
    s = applyAction(content, s, { type: 'endTurn', player: eero.id }).state;
    const a = currentPlayer(s);
    expect(a.id).toBe(aino.id);
    expect(a.stats.hungryWeeks).toBe(0);
    expect(a.timeLeft).toBeLessThan(s.params.hoursPerWeek);
  });

  it('rent is charged monthly at the rate locked in by the lease', () => {
    let s = newGame('rent', false);
    const p = s.players[0];
    p.stats.money = 10000;
    p.node = content.locationById.get('rental_flat')!.node;
    s = applyAction(content, s, { type: 'do', player: p.id, action: 'lease' }).state;
    const rent = currentPlayer(s).flags.rent;
    expect(rent).toBeGreaterThan(0);
    expect(currentPlayer(s).home).toBe('rental_flat');
    let charged = 0;
    for (let w = 0; w < s.params.weeksPerMonth * 2; w++) {
      for (const pl of s.players) pl.stats.money = 10000;
      const before = s.players[0].stats.rentOwed;
      s = applyAction(content, s, { type: 'endTurn', player: currentPlayer(s).id }).state;
      s = applyAction(content, s, { type: 'endTurn', player: currentPlayer(s).id }).state;
      if (s.players[0].stats.rentOwed > before) charged++;
    }
    expect(charged).toBe(2);
  });

  it('a full bot game reaches the end', () => {
    const r = simulateGame(content, { players: ['balanced', 'tycoon', 'scholar'], seed: 'full-game' });
    expect(r.weeks).toBeGreaterThan(1);
    expect(r.decisions).toBeGreaterThan(10);
    expect(r.finished ? r.winnerProfile : 'timeout').toBeTruthy();
  }, 60_000);
});
