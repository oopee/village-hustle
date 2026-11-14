/**
 * Song format: a song is JSON data (see docs/AUDIO-GUIDE.md). This module parses the note,
 * step and chord notations and compiles a song into timed note events per track.
 *
 *   notes:  "E4:1/2 F#4 G4:1 | A4:2 r:1 _ |"   pitch:duration in beats, sticky durations,
 *           r . -  rest,  _  tie,  C4+E4+G4  chord,  !  accent,  ?  ghost,  @0.6 velocity,
 *           | bar check,  [ ... ]*3  repeat
 *   steps:  "x...x...x.x.x..." one char per step (res steps per beat): x hit, X accent,
 *           o soft, 1-9 velocity, . - rest
 *   chords: "Am:2 E7:2 | Am:4 | F % | r:4"  symbols with sticky durations (default one bar),
 *           % repeats the previous chord, r is no chord; realized by a comp `style`.
 */
import { INSTRUMENTS } from './instruments';
import type { AmbienceSpec } from './ambience';

export type Part = string | Record<string, string>;

export interface TrackDef {
  name?: string;
  inst: string;
  /** Linear gain (1 = default). */
  vol?: number;
  /** -1..1 */
  pan?: number;
  /** Reverb send 0..1 */
  rev?: number;
  /** Delay send 0..1 */
  dly?: number;
  /** Stereo chorus amount 0..1 */
  chorus?: number;
  /** Instrument parameter overrides. */
  opts?: Record<string, number>;
  transpose?: number;
  octave?: number;
  notes?: Part;
  steps?: Part;
  chords?: Part;
  /** A drum kit: { kick: steps, snare: steps, ... } (expands into one track per piece). */
  kit?: Record<string, Part>;
  /** Per-piece gains for a kit. */
  mix?: Record<string, number>;
  /** Steps per beat (default 4 = sixteenths). */
  res?: number;
  /** Comp style for `chords`. */
  style?: string;
  /** Range for chord voicings / bass lines, e.g. "G3-E5". */
  range?: string;
  /** Pitch for `steps` (note name or MIDI number). */
  pitch?: string | number;
  /** Timing randomness in milliseconds. */
  humanize?: number;
  /** Velocity multiplier. */
  vel?: number;
  /** Note length multiplier for `notes` (default 0.95). */
  gate?: number;
  /** Seconds between chord notes (strummed/rolled chords). */
  roll?: number;
  /** Overrides the song swing for this track. */
  swing?: number;
  mute?: boolean;
  /** Track low-pass / high-pass cutoffs in Hz (mix cleanup). */
  lp?: number;
  hp?: number;
}

export interface SongDef {
  id?: string;
  title?: string;
  bpm: number;
  meter?: number;
  /** 0 straight .. 1 full triplet swing. */
  swing?: number;
  /** Which subdivision swings: 8 (default) or 16. */
  swingRes?: number;
  transpose?: number;
  loop?: boolean;
  /** Length in bars when there are no sections. */
  bars?: number;
  sections?: Record<string, number>;
  form?: string[];
  reverb?: { size?: number; damp?: number; predelay?: number; wet?: number; width?: number };
  /** Delay: time in beats. */
  delay?: { time?: number; feedback?: number; wet?: number; tone?: number };
  master?: { loudness?: number; lofi?: number; tail?: number; warmth?: number; air?: number; width?: number };
  ambience?: AmbienceSpec[];
  tracks: TrackDef[];
}

export interface NoteEv {
  /** Start and length in beats from the song start (after swing). */
  t: number;
  dur: number;
  midi: number;
  vel: number;
  /** Position within a chord as played (0 first); used for rolled/strummed chords. */
  ord: number;
}

export interface CompiledTrack {
  def: TrackDef;
  name: string;
  inst: string;
  events: NoteEv[];
}

export interface Compiled {
  song: SongDef;
  meter: number;
  beats: number;
  /** Seconds per beat. */
  spb: number;
  tracks: CompiledTrack[];
  warnings: string[];
}

// ---------------------------------------------------------------- pitches & durations

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const ACC: Record<string, number> = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const noteName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/** "C4" → 60, "F#3" → 54, "Bb5" → 82. Numbers pass through. */
export function parsePitch(s: string | number): number | null {
  if (typeof s === 'number') return s;
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^([A-Ga-g])(##|#|bb|b)?(-?\d+)$/.exec(s);
  if (!m) return null;
  return (Number(m[3]) + 1) * 12 + PC[m[1].toLowerCase()] + ACC[m[2] ?? ''];
}

export function parseRange(s: string | undefined): [number, number] | null {
  if (!s) return null;
  const [a, b] = s.split('-').map((x) => parsePitch(x.trim()));
  return a != null && b != null && a < b ? [a, b] : null;
}

function parseDur(s: string): number | null {
  const m = /^(\d*\.?\d+)(?:\/(\d*\.?\d+))?$/.exec(s);
  if (!m) return null;
  const v = Number(m[1]) / (m[2] ? Number(m[2]) : 1);
  return v > 0 && isFinite(v) ? v : null;
}

/** Expands "[ ... ]*N" repeats (innermost first). */
function expand(s: string): string {
  let prev = '';
  let cur = s;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/\[([^[\]]*)\]\s*\*\s*(\d+)/g, (_, body: string, n: string) => Array(Number(n)).fill(body).join(' '));
  }
  return cur;
}

const EPS = 1e-6;

// ---------------------------------------------------------------- notes notation

interface RawNote {
  t: number;
  dur: number;
  midis: number[];
  vel: number;
}

interface ParsedPart<T> {
  items: T[];
  length: number;
}

function parseNotes(src: string, meter: number, where: string, warn: (m: string) => void): ParsedPart<RawNote> {
  const items: RawNote[] = [];
  let t = 0;
  let dur = 1;
  let barStart = 0;
  let bar = 1;
  let last: RawNote | null = null;
  const tokens = expand(src).split(/\s+/).filter(Boolean);
  for (const raw of tokens) {
    if (/^\|+$/.test(raw)) {
      if (Math.abs(t - barStart - meter) > EPS) warn(`${where}: bar ${bar} has ${+(t - barStart).toFixed(3)} beats, expected ${meter}`);
      barStart = t;
      bar++;
      continue;
    }
    let tok = raw;
    let vel = 0.75;
    if (tok.includes('!')) vel = 1;
    if (tok.includes('?')) vel = 0.45;
    tok = tok.replace(/[!?]/g, '');
    const at = /@(\d*\.?\d+)$/.exec(tok);
    if (at) {
      vel = Math.min(1, Number(at[1]));
      tok = tok.slice(0, at.index);
    }
    const colon = tok.indexOf(':');
    if (colon >= 0) {
      const d = parseDur(tok.slice(colon + 1));
      if (d == null) warn(`${where}: bad duration in '${raw}'`);
      else dur = d;
      tok = tok.slice(0, colon);
    }
    if (tok === 'r' || tok === '.' || tok === '-' || tok === '') {
      last = null;
    } else if (tok === '_') {
      if (last) last.dur += dur;
      else warn(`${where}: tie '_' with nothing to tie to`);
    } else {
      const midis = tok.split('+').map((p) => parsePitch(p));
      if (midis.some((m) => m == null)) {
        warn(`${where}: can't read note '${raw}'`);
        last = null;
      } else {
        last = { t, dur, midis: midis as number[], vel };
        items.push(last);
      }
    }
    t += dur;
  }
  if (t - barStart > EPS && barStart > 0 && Math.abs(t - barStart - meter) > EPS) warn(`${where}: last bar has ${+(t - barStart).toFixed(3)} beats, expected ${meter}`);
  return { items, length: t };
}

// ---------------------------------------------------------------- steps notation

function parseSteps(src: string, res: number): ParsedPart<{ t: number; vel: number }> {
  const chars = expand(src).replace(/[\s|]/g, '');
  const items: { t: number; vel: number }[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    let vel = 0;
    if (ch === 'x') vel = 0.75;
    else if (ch === 'X') vel = 1;
    else if (ch === 'o') vel = 0.45;
    else if (ch >= '1' && ch <= '9') vel = Number(ch) / 9;
    if (vel > 0) items.push({ t: i / res, vel });
  }
  return { items, length: chars.length / res };
}

// ---------------------------------------------------------------- chords

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  o: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  o7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  '+': [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  sus: [0, 5, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '9': [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '7sus4': [0, 5, 7, 10],
  '7b9': [0, 4, 7, 10, 13],
  mmaj7: [0, 3, 7, 11],
  '5': [0, 7],
};

export interface Chord {
  symbol: string;
  root: number;
  bass: number;
  intervals: number[];
}

export function parseChord(sym: string): Chord | null {
  const m = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/.exec(sym);
  if (!m) return null;
  const q = QUALITIES[m[3]];
  if (!q) return null;
  const root = (PC[m[1].toLowerCase()] + ACC[m[2] ?? ''] + 12) % 12;
  const bass = m[4] ? (PC[m[4].toLowerCase()] + ACC[m[5] ?? ''] + 12) % 12 : root;
  return { symbol: sym, root, bass, intervals: q };
}

interface ChordSeg {
  t: number;
  dur: number;
  chord: Chord;
}

function parseChords(src: string, meter: number, where: string, warn: (m: string) => void): ParsedPart<ChordSeg> {
  const items: ChordSeg[] = [];
  let t = 0;
  let dur = meter;
  let barStart = 0;
  let bar = 1;
  let prev: Chord | null = null;
  for (const raw of expand(src).split(/\s+/).filter(Boolean)) {
    if (/^\|+$/.test(raw)) {
      if (Math.abs(t - barStart - meter) > EPS) warn(`${where}: bar ${bar} has ${+(t - barStart).toFixed(3)} beats, expected ${meter}`);
      barStart = t;
      bar++;
      continue;
    }
    let tok = raw;
    const colon = tok.indexOf(':');
    if (colon >= 0) {
      const d = parseDur(tok.slice(colon + 1));
      if (d == null) warn(`${where}: bad duration in '${raw}'`);
      else dur = d;
      tok = tok.slice(0, colon);
    }
    if (tok === 'r' || tok === '.' || tok === '-') {
      prev = null;
    } else {
      const c: Chord | null = tok === '%' ? prev : parseChord(tok);
      if (!c) warn(`${where}: can't read chord '${raw}'`);
      else {
        items.push({ t, dur, chord: c });
        prev = c;
      }
    }
    t += dur;
  }
  if (t - barStart > EPS && barStart > 0 && Math.abs(t - barStart - meter) > EPS) warn(`${where}: last bar has ${+(t - barStart).toFixed(3)} beats, expected ${meter}`);
  return { items, length: t };
}

// ---------------------------------------------------------------- voicing

/** Upper-structure pitch classes for voicing (5+ note chords drop the fifth). */
function voicingPcs(c: Chord): number[] {
  let iv = c.intervals.map((i) => i % 12);
  if (c.intervals.length >= 5) iv = iv.filter((i) => i !== 7);
  const pcs = [...new Set(iv.map((i) => (c.root + i) % 12))];
  return pcs;
}

/** Chooses the inversion and octave that moves the least from the previous voicing. */
export function voiceChord(c: Chord, range: [number, number], prev: number[] | null): number[] {
  const pcs = voicingPcs(c);
  const [lo, hi] = range;
  const cands: number[][] = [];
  for (let r = 0; r < pcs.length; r++) {
    const order = [...pcs.slice(r), ...pcs.slice(0, r)];
    let bottom = lo + ((order[0] - lo) % 12 + 12) % 12;
    for (; bottom <= hi; bottom += 12) {
      const v = [bottom];
      for (let i = 1; i < order.length; i++) {
        let m = v[i - 1] + 1;
        while (m % 12 !== order[i]) m++;
        v.push(m);
      }
      if (v[v.length - 1] <= hi) cands.push(v);
    }
  }
  if (!cands.length) {
    // range too narrow: stack from the bottom anyway
    const v = [lo + ((pcs[0] - lo) % 12 + 12) % 12];
    for (let i = 1; i < pcs.length; i++) {
      let m = v[i - 1] + 1;
      while (m % 12 !== pcs[i]) m++;
      v.push(m);
    }
    return v;
  }
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const cost = (v: number[]) => {
    if (!prev) return Math.abs(mean(v) - (lo + hi) / 2);
    if (prev.length === v.length) return v.reduce((s, x, i) => s + Math.abs(x - prev[i]), 0);
    return Math.abs(mean(v) - mean(prev)) * v.length + 0.5;
  };
  cands.sort((a, b) => cost(a) - cost(b) || a[0] - b[0]);
  return cands[0];
}

/** The pitch of pitch class pc in range closest to `near`. */
function nearestPc(pc: number, near: number, range: [number, number]): number {
  let best = -1;
  for (let m = range[0]; m <= range[1]; m++) {
    if (((m % 12) + 12) % 12 !== pc) continue;
    if (best < 0 || Math.abs(m - near) < Math.abs(best - near)) best = m;
  }
  return best >= 0 ? best : range[0] + ((pc - range[0]) % 12 + 12) % 12;
}

// ---------------------------------------------------------------- comp styles

interface Hit {
  /** Beat within the section. */
  t: number;
  len: number;
  vel: number;
  /** Which voices: 'all', an index list, or bass roles. */
  what: 'all' | 'up' | 'down' | number | 'root' | 'fifth' | 'walk' | 'oct';
}

type Pattern = { t: number; len: number; vel: number; what: Hit['what'] }[];

const P = (meter: number, list: [number, number, number, Hit['what']][]): Pattern => list.filter(([t]) => t < meter - EPS).map(([t, len, vel, what]) => ({ t, len, vel, what }));

/** One bar of a style (bar = index within the section, for 2-bar patterns). */
function stylePattern(style: string, meter: number, bar: number): Pattern | 'pad' | 'pedal' {
  const beats = Array.from({ length: meter }, (_, i) => i);
  switch (style) {
    case 'pad':
      return 'pad';
    case 'pedal':
      return 'pedal';
    case 'block':
      return P(meter, beats.map((b) => [b, 0.85, b === 0 ? 0.85 : 0.7, 'all']));
    case 'backbeat':
    case 'waltz':
      return P(meter, (meter === 3 ? [1, 2] : meter === 4 ? [1, 3] : beats.slice(1)).map((b) => [b, 0.55, 0.7, 'all']));
    case 'offbeat':
    case 'skank':
      return P(meter, beats.map((b) => [b + 0.5, 0.3, 0.7, 'all']));
    case 'tango':
      return P(meter, beats.map((b) => [b, 0.45, [0.95, 0.65, 0.85, 0.65][b % 4], 'all']));
    case 'arp':
      return P(meter, Array.from({ length: meter * 2 }, (_, i) => [i / 2, 0.5, i % 2 ? 0.6 : 0.72, i] as [number, number, number, number]));
    case 'arp16':
      return P(meter, Array.from({ length: meter * 4 }, (_, i) => [i / 4, 0.25, i % 4 ? 0.55 : 0.72, i] as [number, number, number, number]));
    case 'arpud':
      return P(meter, Array.from({ length: meter * 2 }, (_, i) => [i / 2, 0.5, i % 2 ? 0.6 : 0.72, -(i + 1)] as [number, number, number, number]));
    case 'broken':
      return P(meter, Array.from({ length: meter * 2 }, (_, i) => [i / 2, 0.5, i % 2 ? 0.58 : 0.7, [0, 2, 1, 2][i % 4] + 100] as [number, number, number, number]));
    case 'strum':
      return meter === 3
        ? P(meter, [[0, 1, 0.85, 'down'], [1, 0.5, 0.7, 'down'], [1.5, 0.5, 0.5, 'up'], [2, 0.5, 0.7, 'down'], [2.5, 0.5, 0.5, 'up']])
        : P(meter, [[0, 1, 0.85, 'down'], [1, 0.5, 0.7, 'down'], [1.5, 1, 0.5, 'up'], [2.5, 0.5, 0.5, 'up'], [3, 0.5, 0.75, 'down'], [3.5, 0.5, 0.5, 'up']]);
    case 'bossa':
      return bar % 2 === 0 ? P(meter, [[0, 0.75, 0.75, 'all'], [1.5, 0.75, 0.65, 'all'], [3, 0.75, 0.7, 'all']]) : P(meter, [[1, 0.75, 0.65, 'all'], [2.5, 0.75, 0.7, 'all']]);
    // bass styles
    case 'root':
      return P(meter, [[0, meter * 0.95, 0.8, 'root']]);
    case 'pulse':
      return P(meter, beats.map((b) => [b, 0.8, b === 0 ? 0.8 : 0.68, 'root']));
    case 'root8':
      return P(meter, Array.from({ length: meter * 2 }, (_, i) => [i / 2, 0.42, i % 2 ? 0.6 : 0.75, 'root'] as [number, number, number, 'root']));
    case 'rootfifth':
    case 'oompah':
      return meter === 4
        ? P(meter, [[0, 0.9, 0.85, 'root'], [2, 0.9, 0.72, 'fifth']])
        : meter === 3
          ? P(meter, [[0, 0.9, 0.85, bar % 2 ? 'fifth' : 'root']])
          : P(meter, [[0, 0.9, 0.85, 'root']]);
    case 'waltzbass':
      return P(meter, [[0, Math.min(meter, 2) * 0.9, 0.85, bar % 2 ? 'fifth' : 'root']]);
    case 'walk':
      return P(meter, beats.map((b) => [b, 0.9, b === 0 ? 0.8 : 0.68, 'walk']));
    case 'habanera':
      return meter === 4
        ? P(meter, [[0, 1.4, 0.85, 'root'], [1.5, 0.45, 0.65, 'fifth'], [2, 0.9, 0.75, 'root'], [3, 0.9, 0.7, 'fifth']])
        : P(meter, [[0, 0.9, 0.85, 'root']]);
    case 'tango332':
      return P(meter, [[0, 1.2, 0.85, 'root'], [1.5, 1.2, 0.72, 'oct'], [3, 0.9, 0.75, 'fifth']]);
    default:
      return 'pad';
  }
}

export const CHORD_STYLES = ['pad', 'block', 'backbeat', 'waltz', 'offbeat', 'skank', 'tango', 'arp', 'arp16', 'arpud', 'broken', 'strum', 'bossa'];
export const BASS_STYLES = ['root', 'pedal', 'pulse', 'root8', 'rootfifth', 'oompah', 'waltzbass', 'walk', 'habanera', 'tango332'];

/** Realizes a chord timeline (one section) into notes. */
function comp(
  segs: ChordSeg[],
  sectionBeats: number,
  meter: number,
  style: string,
  range: [number, number],
  state: { voicing: number[] | null; bass: number; root?: number },
): RawNote[] {
  // Roots follow the previous root, pulled toward a low home register (not the last note,
  // which is often a fifth above; following it would make the bass creep upward).
  const home = range[0] + (range[1] - range[0]) * 0.3;
  const rootOf = (s: ChordSeg) => {
    const r = nearestPc(s.chord.bass, ((state.root ?? state.bass) + home) / 2, range);
    state.root = r;
    return r;
  };
  const isBass = BASS_STYLES.includes(style);
  const out: RawNote[] = [];
  const segAt = (t: number) => segs.find((s) => t >= s.t - EPS && t < s.t + s.dur - EPS);
  const voiced = new Map<ChordSeg, number[]>();
  const voicing = (s: ChordSeg) => {
    let v = voiced.get(s);
    if (!v) {
      v = voiceChord(s.chord, range, state.voicing);
      state.voicing = v;
      voiced.set(s, v);
    }
    return v;
  };
  const bassFor = (s: ChordSeg, role: Hit['what'], beatInSeg: number, t: number): number => {
    const root = role === 'root' || role === 'oct' || beatInSeg < EPS ? rootOf(s) : (state.root ?? rootOf(s));
    if (role === 'root') return root;
    if (role === 'oct') return root + 12 <= range[1] ? root + 12 : root;
    if (role === 'fifth') {
      const fifthIv = s.chord.intervals.includes(6) && !s.chord.intervals.includes(7) ? 6 : s.chord.intervals.includes(8) ? 8 : 7;
      const pc = (s.chord.root + fifthIv) % 12;
      return nearestPc(pc, root + 2, range);
    }
    // walking: root, chord tones, then approach the next chord's root chromatically
    const next = segAt(s.t + s.dur + EPS) ?? segs[0];
    const remaining = s.t + s.dur - t;
    if (beatInSeg < EPS) return root;
    if (remaining <= 1 + EPS && next) {
      const target = nearestPc(next.chord.bass, ((state.root ?? state.bass) + home) / 2, range);
      const below = target - 1;
      const above = target + 1;
      const cand = Math.abs(below - state.bass) <= Math.abs(above - state.bass) ? below : above;
      return cand >= range[0] && cand <= range[1] ? cand : target;
    }
    const tones = s.chord.intervals.filter((i) => i < 12).map((i) => (s.chord.root + i) % 12);
    const opts = tones.map((pc) => nearestPc(pc, state.bass, range)).filter((m) => m !== state.bass);
    opts.sort((a, b) => Math.abs(a - state.bass) - Math.abs(b - state.bass));
    return opts[Math.min(opts.length - 1, Math.floor(beatInSeg) % 2)] ?? root;
  };

  const bars = Math.round(sectionBeats / meter);
  for (let bar = 0; bar < bars; bar++) {
    let pat = stylePattern(style, meter, bar);
    if (pat === 'pad' || pat === 'pedal') continue;
    if (isBass) {
      // A chord that changes mid-bar where the pattern has no hit still gets its root.
      const extra: Pattern = [];
      for (const s of segs) {
        const off = s.t - bar * meter;
        if (off < EPS || off >= meter - EPS) continue;
        if (pat.some((h) => h.t >= off - EPS && h.t < off + 0.5)) continue;
        const nextHit = Math.min(meter, ...pat.filter((h) => h.t > off).map((h) => h.t));
        extra.push({ t: off, len: (nextHit - off) * 0.95, vel: 0.78, what: 'root' });
      }
      if (extra.length) pat = [...pat, ...extra].sort((a, b) => a.t - b.t);
    }
    for (const h of pat) {
      const t = bar * meter + h.t;
      const s = segAt(t);
      if (!s) continue;
      const len = Math.min(h.len, s.t + s.dur - t);
      if (isBass) {
        const m = bassFor(s, h.what, t - s.t, t);
        state.bass = m;
        out.push({ t, dur: len, midis: [m], vel: h.vel });
        continue;
      }
      const v = voicing(s);
      let midis: number[];
      if (h.what === 'all' || h.what === 'down') midis = v;
      else if (h.what === 'up') midis = [...v].reverse();
      else if (typeof h.what === 'number') {
        const ext = [...v, v[0] + 12];
        if (h.what >= 100) midis = [ext[Math.min(ext.length - 1, h.what - 100)]];
        else if (h.what < 0) {
          // up-down: 0 1 2 3 2 1 0 1...
          const cyc = ext.length * 2 - 2;
          const i = (-h.what - 1) % cyc;
          midis = [ext[i < ext.length ? i : cyc - i]];
        } else midis = [ext[h.what % ext.length]];
      } else midis = v;
      out.push({ t, dur: len, midis, vel: h.vel * (h.what === 'up' ? 0.85 : 1) });
    }
  }
  // pad / pedal: one note per chord segment
  const pat0 = stylePattern(style, meter, 0);
  if (pat0 === 'pad' || pat0 === 'pedal') {
    for (const s of segs) {
      if (pat0 === 'pedal' || isBass) {
        const m = rootOf(s);
        state.bass = m;
        out.push({ t: s.t, dur: s.dur * 0.98, midis: [m], vel: 0.75 });
      } else out.push({ t: s.t, dur: s.dur * 0.98, midis: voicing(s), vel: 0.7 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- compile

const partFor = (p: Part | undefined, section: string): string | null => {
  if (p == null) return null;
  if (typeof p === 'string') return p;
  return p[section] ?? p['*'] ?? null;
};

function swingMap(swing: number, res: number): (t: number) => number {
  if (!swing) return (t) => t;
  const cell = res === 16 ? 0.5 : 1;
  const d = (swing * cell) / 6;
  return (t) => {
    const base = Math.floor(t / cell + EPS) * cell;
    const f = t - base;
    const half = cell / 2;
    const g = f <= half ? (f / half) * (half + d) : half + d + ((f - half) / half) * (half - d);
    return base + g;
  };
}

export function compileSong(song: SongDef): Compiled {
  const warnings: string[] = [];
  const meter = song.meter ?? 4;
  const sections: Record<string, number> = song.sections ?? { A: song.bars ?? 8 };
  const form = song.form ?? Object.keys(sections);
  for (const s of form) if (!(s in sections)) warnings.push(`form uses unknown section '${s}'`);
  const order = form.filter((s) => s in sections);
  const spb = 60 / song.bpm;
  if (!(song.bpm > 20 && song.bpm < 400)) warnings.push(`bpm ${song.bpm} looks wrong`);

  // expand kits
  const defs: TrackDef[] = [];
  for (const tr of song.tracks) {
    if (tr.mute) continue;
    if (tr.kit) {
      for (const [piece, steps] of Object.entries(tr.kit)) {
        defs.push({ ...tr, kit: undefined, name: `${tr.name ?? 'kit'}.${piece}`, inst: piece, steps, vol: (tr.vol ?? 1) * (tr.mix?.[piece] ?? 1) });
      }
    } else defs.push(tr);
  }

  // harmony timeline (from the first chord track in each section) for linting
  const harmony: { t: number; dur: number; chord: Chord }[] = [];

  const tracks: CompiledTrack[] = defs.map((def, ti) => {
    const name = def.name ?? `${def.inst}#${ti}`;
    const inst = INSTRUMENTS[def.inst];
    if (!inst) warnings.push(`${name}: unknown instrument '${def.inst}'`);
    const shift = (def.transpose ?? 0) + (def.octave ?? 0) * 12 + (inst?.kind === 'tonal' ? (song.transpose ?? 0) : 0);
    const swing = swingMap(def.swing ?? song.swing ?? 0, song.swingRes ?? 8);
    const range = parseRange(def.range) ?? (inst?.range ? ([Math.max(inst.range[0], 55), Math.min(inst.range[1], 77)] as [number, number]) : ([55, 76] as [number, number]));
    const bassRange = parseRange(def.range) ?? inst?.range ?? [28, 55];
    const style = def.style ?? 'pad';
    const isBass = BASS_STYLES.includes(style);
    const state = { voicing: null as number[] | null, bass: Math.round((bassRange[0] + bassRange[1]) / 2) - 3 };
    if (def.chords && !CHORD_STYLES.includes(style) && !isBass) warnings.push(`${name}: unknown style '${style}' (known: ${[...CHORD_STYLES, ...BASS_STYLES].join(', ')})`);
    const res = def.res ?? 4;
    const pitch = def.pitch != null ? parsePitch(def.pitch) : 60;
    const events: NoteEv[] = [];
    let offset = 0;
    const seenRange = new Set<string>();
    for (const sec of order) {
      const L = sections[sec] * meter;
      const where = `${name} [${sec}]`;
      const warn = (m: string) => warnings.push(m);
      let raw: RawNote[] = [];
      let partLen = 0;
      const n = partFor(def.notes, sec);
      const st = partFor(def.steps, sec);
      const ch = partFor(def.chords, sec);
      if (n != null) {
        const p = parseNotes(n, meter, where, warn);
        raw = p.items.map((x) => ({ ...x, dur: x.dur * (def.gate ?? 0.95) }));
        partLen = p.length;
      } else if (st != null) {
        const p = parseSteps(st, res);
        raw = p.items.map((x) => ({ t: x.t, dur: 1 / res, midis: [pitch ?? 60], vel: x.vel }));
        partLen = p.length;
      } else if (ch != null) {
        const p = parseChords(ch, meter, where, warn);
        partLen = p.length;
        // repeat the chord timeline to fill the section before comping
        const segs: ChordSeg[] = [];
        if (partLen > EPS) for (let o = 0; o < L - EPS; o += partLen) for (const s of p.items) if (s.t + o < L - EPS) segs.push({ ...s, t: s.t + o, dur: Math.min(s.dur, L - s.t - o) });
        if (!harmony.some((h) => h.t >= offset - EPS && h.t < offset + L - EPS)) for (const s of segs) harmony.push({ t: s.t + offset, dur: s.dur, chord: s.chord });
        raw = comp(segs, L, meter, style, isBass ? bassRange : range, state);
        partLen = L; // already filled
      } else {
        offset += L;
        continue;
      }
      if (partLen > L + EPS) warnings.push(`${where}: part is ${+partLen.toFixed(3)} beats but the section is ${L}; extra cut`);
      else if (partLen > EPS && Math.abs(L / partLen - Math.round(L / partLen)) > EPS) warnings.push(`${where}: part length ${+partLen.toFixed(3)} beats doesn't divide the section (${L} beats)`);
      const reps = partLen > EPS ? Math.max(1, Math.ceil(L / partLen - EPS)) : 0;
      for (let r = 0; r < reps; r++) {
        for (const x of raw) {
          const t = x.t + r * partLen;
          if (t >= L - EPS) continue;
          for (let j = 0; j < x.midis.length; j++) {
            const midi = x.midis[j] + shift;
            if (inst?.range && inst.kind === 'tonal' && (midi < inst.range[0] - 2 || midi > inst.range[1] + 2)) {
              const key = `${sec}:${midi}`;
              if (!seenRange.has(key)) {
                seenRange.add(key);
                warnings.push(`${where}: ${noteName(midi)} is outside ${def.inst}'s range (${noteName(inst.range[0])}-${noteName(inst.range[1])})`);
              }
            }
            const a = swing(offset + t);
            const b = swing(offset + t + x.dur);
            events.push({ t: a, dur: Math.max(0.01, b - a), midi, vel: Math.min(1, x.vel * (def.vel ?? 1)), ord: j });
          }
        }
      }
      offset += L;
    }
    events.sort((a, b) => a.t - b.t || a.ord - b.ord);
    return { def, name, inst: def.inst, events };
  });

  const beats = order.reduce((s, sec) => s + sections[sec] * meter, 0);
  if (!beats) warnings.push('song is empty');

  // lint: long melody notes on strong beats that rub a semitone against the chord
  if (harmony.length) {
    // Compound meters written in eighths (6, 9, 12) have their strong beats every three.
    const unit = meter >= 6 && meter % 3 === 0 ? 3 : 1;
    const minDur = unit === 3 ? 1.4 : 0.9;
    // Chord symbols are not transposed; melody events are.
    const songShift = song.transpose ?? 0;
    for (const tr of tracks) {
      if (tr.def.chords || !tr.def.notes || INSTRUMENTS[tr.inst]?.kind !== 'tonal') continue;
      let reported = 0;
      for (const e of tr.events) {
        if (e.dur < minDur || Math.abs(e.t / unit - Math.round(e.t / unit)) > 0.02 / unit) continue;
        const h = harmony.find((x) => e.t >= x.t - EPS && e.t < x.t + x.dur - EPS);
        if (!h) continue;
        const iv = h.chord.intervals;
        if (iv.includes(10) && iv.includes(4)) continue; // dominants welcome tension
        const tones = iv.map((i) => (h.chord.root + i) % 12);
        const pc = ((((e.midi - songShift) % 12) + 12) % 12);
        if (tones.includes(pc)) continue;
        if (tones.some((tn) => (pc - tn + 12) % 12 === 1 || (tn - pc + 12) % 12 === 1)) {
          if (reported++ < 4) warnings.push(`${tr.name}: ${noteName(e.midi)} at beat ${+e.t.toFixed(2)} rubs against ${h.chord.symbol}`);
        }
      }
    }
  }

  return { song, meter, beats, spb, tracks, warnings };
}
