/**
 * Sample-level DSP building blocks.
 *
 * Everything in src/audio/synth is plain TypeScript with no Web Audio and no DOM, so the
 * same code renders music in the browser (in a worker) and in Node (previews, tests).
 */

export const TAU = Math.PI * 2;

/** Small, fast, seedable PRNG (mulberry32). Audio must not use Math.random so renders are repeatable. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Uniform in [-1, 1). */
  noise(): number {
    return this.next() * 2 - 1;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
}

/** FNV-1a string hash, for deriving seeds from names. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => (g <= 0 ? -Infinity : 20 * Math.log10(g));
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

// ---------------------------------------------------------------- oscillators

const TBL = 4096;
const SINE = new Float32Array(TBL + 1);
for (let i = 0; i <= TBL; i++) SINE[i] = Math.sin((i / TBL) * TAU);

/** sin(2π·p) from a table with linear interpolation (≈ -130 dB error). */
export function sin01(p: number): number {
  p -= Math.floor(p);
  const x = p * TBL;
  const i = x | 0;
  const a = SINE[i];
  return a + (SINE[i + 1] - a) * (x - i);
}

/** PolyBLEP residual for band-limited discontinuities. t = phase (0..1), dt = freq/sr. */
export function blep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** A phase accumulator with band-limited waveforms. Call one waveform per sample. */
export class Osc {
  constructor(public phase = 0) {}
  private step(dt: number) {
    this.phase += dt;
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);
  }
  sine(dt: number): number {
    const v = sin01(this.phase);
    this.step(dt);
    return v;
  }
  saw(dt: number): number {
    const t = this.phase;
    const v = 2 * t - 1 - blep(t, dt);
    this.step(dt);
    return v;
  }
  /** Pulse with width pw (0..1). */
  pulse(dt: number, pw = 0.5): number {
    const t = this.phase;
    let v = t < pw ? 1 : -1;
    v += blep(t, dt);
    let t2 = t + 1 - pw;
    if (t2 >= 1) t2 -= 1;
    v -= blep(t2, dt);
    this.step(dt);
    return v;
  }
  /** Triangle (naive; its harmonics fall fast enough). */
  tri(dt: number): number {
    const t = this.phase;
    const v = t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
    this.step(dt);
    return v;
  }
}

// ---------------------------------------------------------------- envelopes

/**
 * ADSR with a linear attack and exponential decay/release (times are roughly the time
 * to fall ~43 dB). Call release() at note-off; done becomes true when the release is inaudible.
 */
export class Env {
  v = 0;
  private stage = 0;
  private readonly aInc: number;
  private readonly dCoef: number;
  private readonly rCoef: number;
  constructor(sr: number, a: number, d: number, private s: number, r: number) {
    this.aInc = 1 / Math.max(1, a * sr);
    this.dCoef = Math.exp(-5 / Math.max(1, d * sr));
    this.rCoef = Math.exp(-5 / Math.max(1, r * sr));
  }
  release() {
    this.stage = 2;
  }
  get done(): boolean {
    return this.stage === 2 && this.v < 1e-4;
  }
  next(): number {
    if (this.stage === 0) {
      this.v += this.aInc;
      if (this.v >= 1) {
        this.v = 1;
        this.stage = 1;
      }
    } else if (this.stage === 1) this.v = this.s + (this.v - this.s) * this.dCoef;
    else this.v *= this.rCoef;
    return this.v;
  }
}

/** Per-sample multiplier for an exponential decay of `seconds` to about -60 dB. */
export const decayCoef = (sr: number, seconds: number) => Math.exp(-6.9 / Math.max(1, seconds * sr));

// ---------------------------------------------------------------- filters

/** Topology-preserving state-variable filter (Zavalishin). Stable under fast modulation. */
export class SVF {
  lp = 0;
  bp = 0;
  hp = 0;
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 1;
  constructor(private sr: number, fc = 1000, q = 0.707) {
    this.set(fc, q);
  }
  set(fc: number, q = 0.707) {
    const f = clamp(fc, 10, this.sr * 0.48);
    const g = Math.tan((Math.PI * f) / this.sr);
    this.k = 1 / Math.max(0.05, q);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  /** Processes one sample; returns the low-pass output (bp/hp are fields). */
  process(v0: number): number {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = v0 - this.k * v1 - v2;
    return v2;
  }
}

/** RBJ biquad (transposed direct form II) for fixed filters. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;
  private constructor() {}

  private static make(sr: number, type: string, f: number, q: number, gainDb = 0): Biquad {
    const bq = new Biquad();
    const w = (TAU * clamp(f, 10, sr * 0.48)) / sr;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const alpha = sw / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case 'lp':
        b1 = 1 - cw;
        b0 = b2 = b1 / 2;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'hp':
        b1 = -(1 + cw);
        b0 = b2 = (1 + cw) / 2;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'bp': // constant 0 dB peak gain
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        a0 = 1 + alpha;
        a1 = -2 * cw;
        a2 = 1 - alpha;
        break;
      case 'peak':
        b0 = 1 + alpha * A;
        b1 = -2 * cw;
        b2 = 1 - alpha * A;
        a0 = 1 + alpha / A;
        a1 = -2 * cw;
        a2 = 1 - alpha / A;
        break;
      case 'lowshelf':
      case 'highshelf': {
        const sq = 2 * Math.sqrt(A) * alpha;
        const s = type === 'lowshelf' ? 1 : -1;
        b0 = A * (A + 1 - s * (A - 1) * cw + sq);
        b1 = s * 2 * A * (A - 1 - s * (A + 1) * cw);
        b2 = A * (A + 1 - s * (A - 1) * cw - sq);
        a0 = A + 1 + s * (A - 1) * cw + sq;
        a1 = -s * 2 * (A - 1 + s * (A + 1) * cw);
        a2 = A + 1 + s * (A - 1) * cw - sq;
        break;
      }
      default:
        throw new Error(`Unknown filter type ${type}`);
    }
    bq.b0 = b0 / a0;
    bq.b1 = b1 / a0;
    bq.b2 = b2 / a0;
    bq.a1 = a1 / a0;
    bq.a2 = a2 / a0;
    return bq;
  }
  static lp(sr: number, f: number, q = 0.707) {
    return Biquad.make(sr, 'lp', f, q);
  }
  static hp(sr: number, f: number, q = 0.707) {
    return Biquad.make(sr, 'hp', f, q);
  }
  static bp(sr: number, f: number, q = 1) {
    return Biquad.make(sr, 'bp', f, q);
  }
  static peak(sr: number, f: number, q: number, db: number) {
    return Biquad.make(sr, 'peak', f, q, db);
  }
  static lowshelf(sr: number, f: number, db: number) {
    return Biquad.make(sr, 'lowshelf', f, 0.707, db);
  }
  static highshelf(sr: number, f: number, db: number) {
    return Biquad.make(sr, 'highshelf', f, 0.707, db);
  }
  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** One-pole low-pass smoother. */
export class OnePole {
  y = 0;
  private a: number;
  constructor(sr: number, fc: number) {
    this.a = Math.exp((-TAU * fc) / sr);
  }
  set(sr: number, fc: number) {
    this.a = Math.exp((-TAU * fc) / sr);
  }
  lp(x: number): number {
    this.y = x + this.a * (this.y - x);
    return this.y;
  }
}

/** Filters a buffer in place through a chain, optionally circularly (seamless for loops). */
export function filterBuffer(buf: Float32Array, make: () => { process(x: number): number }, circular = false, length = buf.length) {
  const f = make();
  if (circular && length > 0) {
    // Warm the filter up on the end of the loop so the state at index 0 continues seamlessly.
    const warm = Math.min(length, 8192);
    for (let i = length - warm; i < length; i++) f.process(buf[i]);
  }
  for (let i = 0; i < length; i++) buf[i] = f.process(buf[i]);
}

// ---------------------------------------------------------------- delays & reverb

/** Delay line with linear-interpolated fractional reads. */
export class DelayLine {
  private buf: Float32Array;
  private w = 0;
  constructor(maxSamples: number) {
    this.buf = new Float32Array(Math.max(4, Math.ceil(maxSamples) + 2));
  }
  write(x: number) {
    this.buf[this.w] = x;
    this.w = (this.w + 1) % this.buf.length;
  }
  /** Reads `d` samples behind the last written sample (d ≥ 1). */
  read(d: number): number {
    const n = this.buf.length;
    let p = this.w - 1 - d;
    while (p < 0) p += n;
    const i = Math.floor(p);
    const f = p - i;
    const a = this.buf[i % n];
    const b = this.buf[(i + 1) % n];
    return a + (b - a) * f;
  }
}

class Comb {
  private buf: Float32Array;
  private i = 0;
  private store = 0;
  constructor(size: number) {
    this.buf = new Float32Array(size);
  }
  process(x: number, fb: number, d1: number, d2: number): number {
    const out = this.buf[this.i];
    this.store = out * d2 + this.store * d1;
    this.buf[this.i] = x + this.store * fb;
    if (++this.i >= this.buf.length) this.i = 0;
    return out;
  }
}

class Allpass {
  private buf: Float32Array;
  private i = 0;
  constructor(size: number) {
    this.buf = new Float32Array(size);
  }
  process(x: number): number {
    const b = this.buf[this.i];
    this.buf[this.i] = x + b * 0.5;
    if (++this.i >= this.buf.length) this.i = 0;
    return b - x;
  }
}

export interface ReverbOptions {
  /** 0..1 room size (decay). */
  size?: number;
  /** 0..1 high-frequency damping. */
  damp?: number;
  /** Pre-delay in seconds. */
  predelay?: number;
  /** 0..1 stereo width. */
  width?: number;
}

/**
 * Freeverb-style stereo reverb (8 damped combs + 4 allpasses per side) with pre-delay and
 * input band-limiting so the tail stays clean and out of the bass.
 */
export class Reverb {
  outL = 0;
  outR = 0;
  private combsL: Comb[];
  private combsR: Comb[];
  private apL: Allpass[];
  private apR: Allpass[];
  private fb: number;
  private d1: number;
  private d2: number;
  private wet1: number;
  private wet2: number;
  private pre: DelayLine;
  private preD: number;
  private hp: Biquad;
  private lp: Biquad;
  constructor(sr: number, o: ReverbOptions = {}) {
    const k = sr / 44100;
    const spread = 23;
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const aps = [556, 441, 341, 225];
    this.combsL = combs.map((c) => new Comb(Math.round(c * k)));
    this.combsR = combs.map((c) => new Comb(Math.round((c + spread) * k)));
    this.apL = aps.map((a) => new Allpass(Math.round(a * k)));
    this.apR = aps.map((a) => new Allpass(Math.round((a + spread) * k)));
    this.fb = (o.size ?? 0.75) * 0.28 + 0.7;
    const damp = (o.damp ?? 0.4) * 0.4;
    this.d1 = damp;
    this.d2 = 1 - damp;
    const width = o.width ?? 1;
    this.wet1 = (width / 2 + 0.5) * 3;
    this.wet2 = ((1 - width) / 2) * 3;
    this.preD = Math.max(1, (o.predelay ?? 0.02) * sr);
    this.pre = new DelayLine(this.preD + 2);
    this.hp = Biquad.hp(sr, 220);
    this.lp = Biquad.lp(sr, 6500);
  }
  process(x: number) {
    this.pre.write(this.lp.process(this.hp.process(x)));
    const input = this.pre.read(this.preD) * 0.015;
    let l = 0;
    let r = 0;
    for (let i = 0; i < 8; i++) {
      l += this.combsL[i].process(input, this.fb, this.d1, this.d2);
      r += this.combsR[i].process(input, this.fb, this.d1, this.d2);
    }
    for (let i = 0; i < 4; i++) {
      l = this.apL[i].process(l);
      r = this.apR[i].process(r);
    }
    this.outL = l * this.wet1 + r * this.wet2;
    this.outR = r * this.wet1 + l * this.wet2;
  }
}

// ---------------------------------------------------------------- dynamics

/** Smooth saturation: linear below ~0.6, gently rounds the top, never exceeds 1. */
export function softClip(x: number): number {
  const a = Math.abs(x);
  if (a < 0.6) return x;
  const s = x < 0 ? -1 : 1;
  return s * (0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4));
}

/**
 * Look-ahead peak limiter over stereo buffers. With `circular`, the gain curve wraps around
 * so a looping buffer stays seamless.
 */
export function limit(L: Float32Array, R: Float32Array, sr: number, ceiling = 0.89, circular = false, length = L.length) {
  const n = length;
  if (!n) return;
  const look = Math.max(1, Math.round(0.004 * sr));
  // required gain per sample
  const need = new Float32Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    need[i] = p > ceiling ? ceiling / p : 1;
    if (need[i] < 1) any = true;
  }
  if (!any) return;
  // min over the look-ahead window [i, i + look] (monotonic deque, O(n))
  const winMin = new Float32Array(n);
  const at = (i: number) => (circular ? need[i % n] : i < n ? need[i] : 1);
  const dq = new Int32Array(n + look + 2);
  let head = 0;
  let tail = 0;
  for (let j = 0; j < n + look; j++) {
    const v = at(j);
    while (tail > head && at(dq[tail - 1]) >= v) tail--;
    dq[tail++] = j;
    const i = j - look;
    if (i >= 0) {
      while (dq[head] < i) head++;
      winMin[i] = at(dq[head]);
    }
  }
  const att = Math.exp(-1 / (look / 3));
  const rel = Math.exp(-1 / (0.12 * sr));
  let g = 1;
  const run = (apply: boolean) => {
    for (let i = 0; i < n; i++) {
      const t = winMin[i];
      g = t < g ? t + (g - t) * att : t + (g - t) * rel;
      if (apply) {
        L[i] *= g;
        R[i] *= g;
      }
    }
  };
  if (circular) run(false);
  run(true);
  // Anything the smoother let through gets rounded off.
  for (let i = 0; i < n; i++) {
    if (Math.abs(L[i]) > ceiling) L[i] = softClip(L[i] / ceiling) * ceiling;
    if (Math.abs(R[i]) > ceiling) R[i] = softClip(R[i] / ceiling) * ceiling;
  }
}

export function peakOf(...bufs: Float32Array[]): number {
  let p = 0;
  for (const b of bufs) for (let i = 0; i < b.length; i++) if (Math.abs(b[i]) > p) p = Math.abs(b[i]);
  return p;
}

/**
 * How much the loop point of a looping buffer stands out (about 1 = invisible).
 * The jump from the last sample to the first is compared with the average change across the
 * buffer and with the largest change just around the seam, so a note that starts on the loop
 * point counts as music, not as a click.
 */
export function seamRatio(b: Float32Array, win = 32): number {
  const n = b.length;
  if (n < 2 * win + 2) return 0;
  let s = 0;
  for (let i = 1; i < n; i++) s += Math.abs(b[i] - b[i - 1]);
  let local = 0;
  for (let i = 1; i <= win; i++) {
    local = Math.max(local, Math.abs(b[i] - b[i - 1]), Math.abs(b[n - i] - b[n - i - 1]));
  }
  return Math.abs(b[0] - b[n - 1]) / Math.max(s / (n - 1), local, 1e-9);
}

export function rmsOf(...bufs: Float32Array[]): number {
  let s = 0;
  let n = 0;
  for (const b of bufs) {
    for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    n += b.length;
  }
  return n ? Math.sqrt(s / n) : 0;
}
