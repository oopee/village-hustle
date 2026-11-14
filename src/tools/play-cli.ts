/**
 * Text-mode play, for playtesting by people or AI agents in a terminal.
 *
 *   npm run play -- new <game> --seats "Ada:player,Bo:player,Cid:bot:balanced" [--seed s] [--goals wealth=60,...] [--fixed]
 *   npm run play -- look <game> --as Ada              your situation, news, what you can do here, where you can go
 *   npm run play -- act  <game> --as Ada "<commands>"   one or more commands separated by ';'
 *   npm run play -- menu <game> --as Ada <place>      preview a place's choices (as if you were there)
 *   npm run play -- wait <game> --as Ada [--timeout 540]   block until it is your turn
 *   npm run play -- log  <game>                       the full history (for after the game)
 *
 * Commands for act:   go <place>   |   <number>   |   "part of a choice's name"   |   end   |   end! (skip warnings)
 *   e.g.  act g1 --as Ada "go grill; coffee; go job_centre; 2; end"
 *
 * A player sees exactly what the browser shows a human: visible stats, goal scores, prices,
 * times, owners' lines and messages. Hidden stats and balance parameters are never printed.
 * Computer players (bot seats) take their turns automatically.
 * Games are saved in playtest/<game>.json (git-ignored).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ActionError,
  applyAction,
  createGame,
  currentPlayer,
  goalScores,
  isLocationOpen,
  listOptions,
  locationAt,
  travelTime,
  turnEndWarnings,
  type Action,
  type ActionOption,
  type GameEvent,
  type GameState,
  type PlayerState,
} from '../engine';
import { chooseAction } from '../ai/bot';
import { hours, jobWage, money, statMaxFor } from '../ui/format';
import { loadNodeContent } from './node-content';

const DIR = resolve(import.meta.dirname, '../../playtest');

interface Seat {
  name: string;
  kind: 'player' | 'bot';
  profile?: string;
}
interface LogLine {
  week: number;
  who?: string;
  text: string;
  /** Visible to: undefined = everybody (village news). */
  to?: string;
  /** Id of the player this line happened to (for "you" messages about someone else). */
  about?: string;
}
interface Save {
  state: GameState;
  seats: Seat[];
  log: LogLine[];
  /** Per player: how many log lines they have seen. */
  seen: Record<string, number>;
  actions: { week: number; who: string; action: Action }[];
  botRng: number;
}

// ------------------------------------------------------------------ args

const argv = process.argv.slice(2);
const cmd = argv[0];
const gameName = argv[1];
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const rest = () => {
  const out: string[] = [];
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      i++;
      continue;
    }
    out.push(argv[i]);
  }
  return out.join(' ');
};

function die(msg: string): never {
  console.log(msg);
  process.exit(1);
}

// ------------------------------------------------------------------ storage

const file = (name: string) => join(DIR, `${name.replace(/[^\w-]/g, '_')}.json`);

function load(name: string): Save {
  if (!existsSync(file(name))) die(`No game called '${name}'. Start one with: npm run play -- new ${name} --seats "You:player,Bot:bot:balanced"`);
  return JSON.parse(readFileSync(file(name), 'utf8')) as Save;
}

function save(name: string, s: Save) {
  mkdirSync(DIR, { recursive: true });
  const tmp = `${file(name)}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s));
  // On Windows the rename fails while another process (e.g. a waiting player) is reading the file.
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, file(name));
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i >= 40 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

// Piping the output into e.g. `head` must not crash the game.
process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

// ------------------------------------------------------------------ helpers

const content = await loadNodeContent();
const pick = <T>(xs: T[] | undefined): T | undefined => (xs && xs.length ? xs[Math.floor(Math.random() * xs.length)] : undefined);
const locName = (id: string) => content.locationById.get(id)?.name ?? id;
const nodeName = (node: string) => locationAt(content, node)?.name ?? node;

function findSeat(s: Save, name: string | undefined): { seat: Seat; player: PlayerState } {
  if (!name) die('Say who you are: --as <name>');
  const i = s.seats.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
  if (i < 0) die(`No player '${name}'. Players: ${s.seats.map((x) => x.name).join(', ')}`);
  return { seat: s.seats[i], player: s.state.players[i] };
}

function nameOf(s: Save, playerId: string | undefined) {
  return s.state.players.find((p) => p.id === playerId)?.name;
}

interface HostOf {
  loc: string;
  mood: 'good' | 'bad' | 'info';
  action: string;
  option?: string;
  kind: string;
}

/**
 * Records engine events as readable lines (what the browser's news and captions show).
 * `week` is the week the events started in (the state may already be in the next one).
 */
function record(s: Save, events: GameEvent[], week: number, hostOf?: HostOf) {
  let hostName: string | undefined;
  for (const e of events) {
    switch (e.type) {
      case 'message': {
        if (e.speaker === 'host') {
          s.log.push({ week, who: hostName ?? 'Someone', text: `says: ${e.text}` });
          break;
        }
        const prefix = e.tone === 'good' ? '(+) ' : e.tone === 'bad' ? '(-) ' : '';
        s.log.push({ week, who: nameOf(s, e.player), text: `${prefix}${e.text}`, about: e.player });
        break;
      }
      case 'moved':
        s.log.push({ week, who: nameOf(s, e.player), text: `walked to ${nodeName(e.path[e.path.length - 1])} (${hours(content, e.time)})` });
        break;
      case 'did':
        hostName = content.locationById.get(e.location)?.host?.name;
        s.log.push({ week, who: nameOf(s, e.player), text: `chose: ${e.label}` });
        break;
      case 'weekEnded':
        s.log.push({ week: e.week, text: `--- week ${e.week} is over ---` });
        week = e.week + 1;
        break;
      case 'gameOver':
        s.log.push({ week, text: e.winner ? `GAME OVER: ${nameOf(s, e.winner)} wins (${e.reason === 'goals' ? 'reached every goal' : 'closest to their goals when time ran out'}).` : 'GAME OVER.' });
        break;
      default:
        break;
    }
  }
  // The owner's reaction (the browser shows it as a speech bubble).
  if (hostOf) {
    const host = content.locationById.get(hostOf.loc)?.host;
    if (host && !events.some((e) => e.type === 'message' && e.speaker === 'host')) {
      const cat =
        hostOf.kind === 'shop' ? 'buy' : hostOf.kind === 'work' ? 'work' : hostOf.kind === 'jobs' ? (hostOf.mood === 'bad' ? 'rejected' : 'hired') : hostOf.kind === 'sell' ? 'sell' : hostOf.kind === 'transfer' ? 'money' : undefined;
      const line =
        (hostOf.option ? pick(host.lines[hostOf.option]) : undefined) ?? pick(host.lines[hostOf.action]) ?? (cat ? pick(host.lines[cat]) : undefined);
      if (line) s.log.push({ week, who: host.name, text: `says: ${line}` });
    }
  }
}

function botTurns(s: Save) {
  let guard = 0;
  while (s.state.phase === 'playing' && s.seats[s.state.current].kind === 'bot' && guard++ < 5000) {
    let r = s.botRng;
    const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    const { action } = chooseAction(content, s.state, rnd);
    s.botRng = r;
    const before = s.state.players[s.state.current];
    const week = s.state.week;
    const res = applyAction(content, s.state, action);
    s.actions.push({ week, who: before.name, action });
    s.state = res.state;
    record(s, res.events, week);
  }
}

// ------------------------------------------------------------------ views

function bar(v: number, max: number) {
  const n = Math.round((Math.max(0, Math.min(max, v)) / max) * 10);
  return `[${'#'.repeat(n)}${'.'.repeat(10 - n)}]`;
}

function statusLines(s: Save, p: PlayerState): string[] {
  const st = s.state;
  const out: string[] = [];
  const stats = content.stats
    .filter((x) => x.display !== 'hidden')
    .map((x) => {
      const v = p.stats[x.id] ?? 0;
      const max = statMaxFor(content, st, p, x.id);
      if (x.display === 'money') return `${x.label} ${money(content, v)}`;
      if (x.display === 'bar') return `${x.label} ${bar(v, max ?? 100)} ${Math.round(v)}/${max ?? 100}`;
      return `${x.label} ${Math.floor(v * 10) / 10}${max !== undefined ? `/${max}` : ''}`;
    });
  out.push(stats.join(' | '));
  const job = p.job ? content.jobById.get(p.job) : null;
  out.push(`Home: ${locName(p.home)} | Job: ${job ? `${job.title} at ${locName(job.location)} (${money(content, jobWage(content, st, p))}/${content.game.timeUnit})` : 'unemployed'}`);
  const items = Object.entries(p.items)
    .filter(([, o]) => o.qty > 0)
    .map(([id, o]) => `${content.itemById.get(id)?.name ?? id}${o.qty > 1 ? ` x${o.qty}` : ''}`);
  out.push(`Belongings: ${items.join(', ') || 'nothing much'}`);
  const edu = [
    ...p.degrees.map((d) => content.degreeById.get(d)?.name ?? d),
    ...Object.entries(p.courses).map(([id, n]) => `${content.courseById.get(id)?.name ?? id} (${n} lessons done)`),
  ];
  out.push(`Education: ${edu.join(', ') || 'none yet'}`);
  return out;
}

function goalLines(s: Save): string[] {
  const st = s.state;
  const gs = content.goals.goals;
  const out = [`Life goals (score 0-100 / target): ${gs.map((g) => `${g.label} ${st.settings.goals[g.id]}`).join(', ')}`];
  for (const p of st.players) {
    const sc = goalScores(content, st, p);
    out.push(`  ${p.name.padEnd(8)} ${gs.map((g) => `${g.label} ${Math.round(sc[g.id])}${sc[g.id] >= st.settings.goals[g.id] ? '*' : ''}`).join('  ')}`);
  }
  return out;
}

function optionLine(o: ActionOption, i: number) {
  const meta: string[] = [];
  if (o.detail) meta.push(o.detail);
  if (o.time > 0) meta.push(hours(content, o.time));
  if (o.cost > 0) meta.push(money(content, o.cost));
  const head = o.kind === 'basic' ? '' : `[${o.group}] `;
  return `  ${String(i + 1).padStart(2)}. ${head}${o.label}${meta.length ? ` (${meta.join(', ')})` : ''}${o.enabled ? '' : `  -- not possible: ${o.reasons.join(' ')}`}${o.enabled && o.description ? `  - ${o.description}` : ''}`;
}

function placeLines(s: Save, p: PlayerState, locId?: string): string[] {
  const loc = locId ? content.locationById.get(locId) : locationAt(content, p.node);
  if (!loc) return ['You are on the road.'];
  const out: string[] = [];
  const host = loc.host ? ` Owner: ${loc.host.name}${loc.host.title ? `, ${loc.host.title}` : ''}.` : '';
  out.push(`${loc.name}: ${loc.description}${host}`);
  if (!isLocationOpen(content, s.state, p, loc)) {
    out.push(`  ${loc.closedText ?? `${loc.name} is closed.`}`);
    return out;
  }
  const opts = locId ? listOptions(content, s.state, p.id, loc.id, Math.max(0, p.timeLeft - travelTime(content, s.state, p, loc.node))) : listOptions(content, s.state, p.id);
  if (!opts.length) out.push('  Nothing to do here right now.');
  opts.forEach((o, i) => out.push(optionLine(o, i)));
  return out;
}

function mapLine(s: Save, p: PlayerState): string {
  const parts: string[] = [];
  for (const loc of content.locations) {
    if (loc.node === p.node) continue;
    const t = travelTime(content, s.state, p, loc.node);
    const closed = isLocationOpen(content, s.state, p, loc) ? '' : ' closed';
    parts.push(`${loc.id} ${hours(content, t)}${t > p.timeLeft ? ' (too far)' : ''}${closed}`);
  }
  return `Walk to: ${parts.join(', ')}`;
}

/** A log line as one player reads it: someone else's personal messages are marked as theirs. */
function lineText(l: LogLine, viewer?: string): string {
  if (l.about && l.about !== viewer && l.who) return `[news for ${l.who}, not you] ${l.text}`;
  return `${l.who ? `${l.who}: ` : ''}${l.text}`;
}

function newsLines(s: Save, p: PlayerState): string[] {
  const from = s.seen[p.id] ?? 0;
  const lines = s.log.slice(from).map((l) => `  W${l.week} ${lineText(l, p.id)}`);
  s.seen[p.id] = s.log.length;
  return lines;
}

function view(s: Save, p: PlayerState, full: boolean): string {
  const st = s.state;
  const out: string[] = [];
  const news = newsLines(s, p);
  if (news.length) out.push('News:', ...news.slice(-60), '');
  if (st.phase === 'ended') {
    out.push(...goalLines(s));
    out.push(`The game is over. Winner: ${nameOf(s, st.winner ?? undefined) ?? 'nobody'}.`);
    return out.join('\n');
  }
  const cur = currentPlayer(st);
  if (cur.id !== p.id) {
    out.push(`Week ${st.week}. It is ${cur.name}'s turn, not yours. Use: wait`);
    if (full) out.push(...statusLines(s, p), ...goalLines(s));
    return out.join('\n');
  }
  out.push(`== Week ${st.week} of max ${content.game.maxWeeks} | ${p.name} | ${hours(content, p.timeLeft)} left this week | at ${nodeName(p.node)} ==`);
  out.push(...statusLines(s, p));
  for (const w of turnEndWarnings(content, st, p.id)) out.push(`  WARNING before the weekend: ${w}`);
  if (full) out.push(...goalLines(s));
  out.push(...placeLines(s, p));
  out.push(mapLine(s, p));
  return out.join('\n');
}

// ------------------------------------------------------------------ commands

function resolvePlace(text: string, p: PlayerState): string {
  const q = text.trim().toLowerCase().replace(/^"|"$/g, '');
  if (q === 'home') return content.locationById.get(p.home)!.node;
  const id = q.replace(/[\s-]+/g, '_');
  const exact = content.locations.find((l) => l.id === id || l.name.toLowerCase() === q);
  if (exact) return exact.node;
  const part = content.locations.filter((l) => l.id.includes(id) || l.name.toLowerCase().includes(q));
  if (part.length === 1) return part[0].node;
  throw new ActionError(`Unknown place '${text}'. Places: ${content.locations.map((l) => l.id).join(', ')}`);
}

function runCommand(s: Save, p: PlayerState, raw: string): string[] {
  const c = raw.trim();
  if (!c) return [];
  const st = s.state;
  if (st.phase !== 'playing') throw new ActionError('The game is over.');
  if (currentPlayer(st).id !== p.id) throw new ActionError(`It is ${currentPlayer(st).name}'s turn, not yours.`);
  let action: Action;
  let hostOf: HostOf | undefined;
  const m = /^(go|walk)\s+(.+)$/i.exec(c);
  const end = /^(end|end week|end turn)(!?)$/i.exec(c);
  if (m) {
    action = { type: 'move', player: p.id, to: resolvePlace(m[2], p) };
  } else if (end) {
    const sure = end[2] === '!';
    const acted = s.actions.some((a) => a.who === p.name && a.week === st.week);
    if (!sure && !acted)
      throw new ActionError(`You haven't done anything yet in week ${st.week} (your previous week may have ended when time ran out). Use 'end!' to really skip this whole week.`);
    const warnings = turnEndWarnings(content, st, p.id);
    if (!sure && warnings.length) throw new ActionError(`${warnings.join(' ')} Use 'end!' to end the week anyway.`);
    action = { type: 'endTurn', player: p.id };
  } else {
    const opts = listOptions(content, st, p.id);
    const q = c.replace(/^(do|choose)\s+/i, '').replace(/^"|"$/g, '').trim();
    let o: ActionOption | undefined;
    if (/^\d+$/.test(q)) o = opts[Number(q) - 1];
    else {
      // Best match tier wins: exact label, then a word starting with the query, then anywhere.
      const ql = q.toLowerCase();
      const word = new RegExp(`(^|[^a-zà-ÿ])${ql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      const tiers = [
        opts.filter((x) => x.label.toLowerCase() === ql),
        opts.filter((x) => word.test(x.label) || word.test(x.group)),
        opts.filter((x) => `${x.group} ${x.label}`.toLowerCase().includes(ql)),
      ];
      const hits = tiers.find((t) => t.length) ?? [];
      const enabled = hits.filter((x) => x.enabled);
      if (hits.length > 1 && enabled.length !== 1) throw new ActionError(`'${q}' matches several choices: ${hits.map((x) => x.label).join(' / ')}`);
      o = enabled[0] ?? hits[0];
    }
    if (!o) throw new ActionError(`No choice '${q}' here (${nodeName(p.node)}). Use look to see the numbered choices.`);
    if (!o.enabled) {
      const host = content.locationById.get(o.location)?.host;
      const broke = o.reasons.some((r) => /money|afford|cash|€/i.test(r));
      const line = pick(broke ? (host?.lines.broke ?? host?.lines.refuse) : host?.lines.refuse);
      throw new ActionError(`Not possible: ${o.reasons.join(' ')}${line ? ` (${host!.name}: "${line}")` : ''}`);
    }
    action = { type: 'do', player: p.id, action: o.action, option: o.option };
    hostOf = { loc: o.location, action: o.action, option: o.option, kind: o.kind, mood: 'info' };
  }
  const before = s.log.length;
  const week = st.week;
  const res = applyAction(content, st, action);
  if (hostOf) {
    const msgs = res.events.filter((e): e is Extract<GameEvent, { type: 'message' }> => e.type === 'message');
    hostOf.mood = msgs.some((e) => e.tone === 'bad') ? 'bad' : msgs.some((e) => e.tone === 'good') ? 'good' : 'info';
  }
  s.actions.push({ week, who: p.name, action });
  s.state = res.state;
  record(s, res.events, week, hostOf);
  if (action.type === 'move') {
    const loc = locationAt(content, action.to);
    const hello = pick(loc?.host?.lines.hello) ?? pick(loc?.greeting);
    if (loc && hello) s.log.push({ week, who: loc.host?.name ?? loc.name, text: `says: ${hello}` });
  }
  return s.log.slice(before).map((l) => `  ${lineText(l, p.id)}`);
}

// ------------------------------------------------------------------ main

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

switch (cmd) {
  case 'new': {
    if (!gameName) die('Usage: new <game> --seats "Ada:player,Bo:bot:balanced"');
    if (existsSync(file(gameName)) && !argv.includes('--force')) die(`Game '${gameName}' exists (use --force to overwrite).`);
    const seats: Seat[] = (flag('seats') ?? 'You:player,Bot:bot:balanced').split(',').map((x) => {
      const [name, kind = 'player', profile] = x.split(':').map((y) => y.trim());
      if (kind !== 'player' && kind !== 'bot') die(`Seat kind must be player or bot: '${x}'`);
      return { name, kind, profile: kind === 'bot' ? (profile ?? 'balanced') : undefined };
    });
    const goals: Record<string, number> = {};
    for (const kv of (flag('goals') ?? '').split(',').filter(Boolean)) {
      const [k, v] = kv.split('=');
      goals[k] = Number(v);
    }
    const { state, events } = createGame(content, {
      players: seats.map((x, i) => ({ name: x.name, color: i, controller: x.kind === 'bot' ? 'ai' : 'human', aiProfile: x.profile })),
      seed: flag('seed'),
      randomizeBalance: !argv.includes('--fixed'),
      goals,
    });
    const s: Save = { state, seats, log: [], seen: {}, actions: [], botRng: 12345 };
    record(s, events, state.week);
    botTurns(s);
    save(gameName, s);
    console.log(`Game '${gameName}' created (seed ${state.seed}). Players: ${seats.map((x) => `${x.name} (${x.kind === 'bot' ? `computer, ${x.profile}` : 'player'})`).join(', ')}.`);
    console.log(...goalLines(s).map((l) => `\n${l}`));
    break;
  }
  case 'look': {
    const s = load(gameName);
    const { player } = findSeat(s, flag('as'));
    console.log(view(s, player, true));
    save(gameName, s);
    break;
  }
  case 'menu': {
    const s = load(gameName);
    const { player } = findSeat(s, flag('as'));
    const node = resolvePlace(rest(), player);
    const loc = locationAt(content, node)!;
    console.log(`(Preview, as if you walked there now. Walking takes ${hours(content, travelTime(content, s.state, player, node))}.)`);
    console.log(placeLines(s, player, loc.id).join('\n'));
    break;
  }
  case 'act': {
    const s = load(gameName);
    const { player } = findSeat(s, flag('as'));
    const out: string[] = [];
    const cmds = rest().split(/;|\n/).map((x) => x.trim()).filter(Boolean);
    if (!cmds.length) die('Usage: act <game> --as <name> "go grill; 2; end"');
    let error: string | null = null;
    for (let i = 0; i < cmds.length; i++) {
      const c = cmds[i];
      try {
        out.push(`> ${c}`, ...runCommand(s, s.state.players.find((x) => x.id === player.id)!, c));
      } catch (e) {
        if (!(e instanceof ActionError)) throw e;
        error = `> ${c}\n  ERROR: ${e.message} (remaining commands skipped)`;
        break;
      }
      if (s.state.phase !== 'playing' || currentPlayer(s.state).id !== player.id) {
        const left = cmds.slice(i + 1).filter((x) => !/^end/i.test(x));
        if (left.length && s.state.phase === 'playing') out.push(`  (Your week is over. Not run: ${left.join('; ')})`);
        break;
      }
    }
    s.seen[player.id] = s.log.length;
    botTurns(s);
    save(gameName, s);
    console.log(out.join('\n'));
    if (error) console.log(error);
    console.log('');
    console.log(view(s, s.state.players.find((x) => x.id === player.id)!, false));
    save(gameName, s);
    break;
  }
  case 'wait': {
    const limit = Number(flag('timeout') ?? 540) * 1000;
    const t0 = Date.now();
    for (;;) {
      const s = load(gameName);
      const { player } = findSeat(s, flag('as'));
      if (s.state.phase !== 'playing' || currentPlayer(s.state).id === player.id) {
        console.log(view(s, player, true));
        save(gameName, s);
        break;
      }
      if (Date.now() - t0 > limit) {
        console.log(`Still ${currentPlayer(s.state).name}'s turn (week ${s.state.week}). Run wait again.`);
        break;
      }
      await sleep(1500);
    }
    break;
  }
  case 'log': {
    const s = load(gameName);
    for (const l of s.log) console.log(`W${l.week} ${l.who ? `${l.who}: ` : ''}${l.text}`);
    // (the full log is for the debrief, so personal lines keep their speaker's name)
    console.log(goalLines(s).join('\n'));
    break;
  }
  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
}
