/**
 * The different routes to the goals: raises and promotions from working, experience in place
 * of a diploma, skills tests, self-taught knowledge, shares, the beach kiosk, the dance band
 * and letting the cottage.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { applyAction, createGame, currentPlayer, goalScores, listOptions, type Content, type GameState } from '../src/engine';
import { makeCtx } from '../src/engine/scope';
import { loadNodeContent } from '../src/tools/node-content';

let content: Content;
beforeAll(async () => {
  content = await loadNodeContent();
});

const newGame = (seed: string) =>
  createGame(content, {
    players: [
      { name: 'Aino', color: 0, controller: 'human' },
      { name: 'Eero', color: 1, controller: 'human' },
    ],
    seed,
    randomizeBalance: false,
  }).state;

const at = (s: GameState, loc: string) => {
  currentPlayer(s).node = content.locationById.get(loc)!.node;
};
const text = (events: unknown[]) => JSON.stringify(events);
const num = (s: GameState, expr: string) => makeCtx(content, s, currentPlayer(s), []).num(expr);
/** Ends both players' turns, so the first player starts a new week. */
const nextWeek = (s: GameState) => {
  for (let i = 0; i < s.players.length; i++) {
    currentPlayer(s).timeLeft = 0;
    s = applyAction(content, s, { type: 'endTurn', player: currentPlayer(s).id }, { mutate: true }).state;
  }
  return s;
};

describe('routes to the goals', () => {
  it('working the same job earns raises: higher pay and a career bonus', () => {
    const s = newGame('raise');
    const p = currentPlayer(s);
    p.job = 'cleaner';
    p.jobSince = s.week;
    at(s, 'health_centre');
    const wage0 = num(s, 'jobWage()');
    const career0 = goalScores(content, s, p).career;
    let raised = false;
    for (let i = 0; i < s.params.raiseShifts; i++) {
      p.timeLeft = 60;
      const r = applyAction(content, s, { type: 'do', player: p.id, action: 'work' }, { mutate: true });
      if (text(r.events).includes('raise')) raised = true;
    }
    expect(raised).toBe(true);
    expect(num(s, 'raises()')).toBe(1);
    expect(num(s, 'jobWage()')).toBeGreaterThan(wage0);
    expect(goalScores(content, s, p).career).toBeGreaterThan(career0);
    // A new job starts from the bottom of its pay scale.
    p.job = 'laborer';
    p.jobSince = s.week + 1;
    expect(num(s, 'raises()')).toBe(0);
  });

  it('enough shifts lead to a promotion, or to the boss naming what is missing', () => {
    let s = newGame('promo');
    const p = s.players[0];
    p.job = 'grill_cook';
    p.jobSince = 1;
    Object.assign(p.flags, { shiftsJob: 'grill_cook', shiftsSince: 1, shifts: s.params.promotionShifts, xpGrill: s.params.exp_grill_manager });
    s.params.promotionChance = 1;
    s = nextWeek(s);
    expect(s.players[0].job).toBe('grill_cook');
    expect(s.players[0].flags.promoHint).toBeTruthy();
    // Long enough at the grill stands in for the diploma.
    s.players[0].flags.xpGrill = s.params.exp_grill_manager * s.params.veteranXp;
    s = nextWeek(s);
    expect(s.players[0].job).toBe('grill_manager');
  });

  it('a skills test turns workplace experience into a diploma and drops the matching course', () => {
    const s = newGame('demo');
    const p = currentPlayer(s);
    p.stats.money = 10000;
    p.degrees.push('basic_skills');
    p.courses.c_trade = 2;
    at(s, 'opisto');
    const opt = () => listOptions(content, s, p.id, 'opisto').find((o) => o.action === 'demo_trade');
    expect(opt()?.enabled).toBe(false);
    p.flags.xpShop = s.params.demoTradeXp;
    expect(opt()?.enabled).toBe(true);
    applyAction(content, s, { type: 'do', player: p.id, action: 'demo_trade' }, { mutate: true });
    expect(p.degrees).toContain('vocational_trade');
    expect(p.courses.c_trade).toBeUndefined();
    expect(opt()).toBeUndefined();
  });

  it('self-taught knowledge counts towards education', () => {
    const s = newGame('knowledge');
    const p = currentPlayer(s);
    const before = goalScores(content, s, p).education;
    p.stats.knowledge = 80;
    expect(goalScores(content, s, p).education).toBeGreaterThan(before);
  });

  it('shares count as wealth and move with the market', () => {
    let s = newGame('shares');
    const p = s.players[0];
    p.stats.money = 1000;
    at(s, 'bank');
    const w0 = goalScores(content, s, p).wealth;
    applyAction(content, s, { type: 'do', player: p.id, action: 'buy_shares', option: '1000' }, { mutate: true });
    expect(p.stats.money).toBe(0);
    expect(p.stats.shares).toBeGreaterThan(900);
    expect(goalScores(content, s, p).wealth).toBeGreaterThan(w0 * 0.9);
    const held = p.stats.shares;
    s.params.marketShockChance = 1;
    s.params.marketShock = 0.4;
    s = nextWeek(s);
    expect(s.players[0].stats.shares).not.toBe(held);
  });

  it('leasing the beach kiosk makes you its owner-operator', () => {
    const s = newGame('kiosk');
    const [aino, eero] = s.players;
    aino.stats.money = 1e5;
    aino.job = 'cleaner';
    at(s, 'sauna');
    applyAction(content, s, { type: 'do', player: aino.id, action: 'kiosk', option: 'beach_kiosk' }, { mutate: true });
    expect(aino.job).toBe('kiosk_keeper');
    expect(listOptions(content, s, aino.id, 'sauna').some((o) => o.action === 'work' && o.enabled)).toBe(true);
    // Only one kiosk on the beach.
    s.current = 1;
    eero.stats.money = 1e5;
    eero.node = aino.node;
    expect(listOptions(content, s, eero.id, 'sauna').find((o) => o.option === 'beach_kiosk')?.enabled).toBe(false);
  });

  it('karaoke nights and a name in the village get you into the dance band', () => {
    const s = newGame('band');
    const p = currentPlayer(s);
    p.stats.money = 1000;
    p.items.clothes_smart = { qty: 1, age: 0 };
    p.stats.reputation = 100;
    at(s, 'job_centre');
    const apply = () => text(applyAction(content, s, { type: 'do', player: p.id, action: 'apply', option: 'band_singer' }).events);
    expect(apply()).toContain('Karaoke night');
    p.flags.karaokeNights = s.params.gigKaraoke;
    expect(apply()).toContain('You got the job');
  });

  it('a cottage you own but do not live in earns rent', () => {
    let s = newGame('let');
    const p = s.players[0];
    p.items.cottage_deed = { qty: 1, age: 0 };
    s = nextWeek(s);
    expect(s.players[0].stats.savings).toBeGreaterThan(0);
  });
});
