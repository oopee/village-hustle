/**
 * Instruments. Each renders one note by ADDING into a mono buffer, starting at note.start.
 * Songs pick instruments by name (see INSTRUMENTS at the bottom); `opts` in a song track
 * override an instrument's defaults, so presets can be tweaked without code.
 *
 * Levels: a single note at full velocity peaks around 0.2–0.35. Songs are normalized to a
 * loudness target after mixing, so only the balance between tracks matters.
 */
import { Biquad, decayCoef, Env, OnePole, Osc, Rng, SVF, sin01, TAU } from './dsp';

export interface Note {
  /** Start, in samples from the beginning of the buffer. */
  start: number;
  /** Gate length in samples (note-off happens here; releases ring on). */
  len: number;
  midi: number;
  freq: number;
  /** 0..1 */
  vel: number;
}

export interface VoiceCtx {
  sr: number;
  rng: Rng;
  o: Record<string, number>;
}

export interface Instrument {
  kind: 'tonal' | 'drum';
  /** Longest ring-out after note-off, in seconds (sizes buffer tails). */
  tail: number;
  /** Comfortable MIDI range (for the song linter). */
  range?: [number, number];
  defaults?: Record<string, number>;
  /** One line for the docs. */
  about: string;
  render(out: Float32Array, n: Note, c: VoiceCtx): void;
}

/** Perceptual velocity curve. */
export const velAmp = (v: number) => 0.15 + 0.85 * Math.pow(Math.max(0, Math.min(1, v)), 1.5);
const cents = (c: number) => Math.pow(2, c / 1200);

/** Loops k = 0.. over the note's samples; stops at the buffer end or when fn returns false. */
function each(out: Float32Array, start: number, maxLen: number, fn: (k: number) => number | false) {
  const end = Math.min(out.length, start + maxLen);
  for (let i = Math.max(0, start), k = i - start; i < end; i++, k++) {
    const v = fn(k);
    if (v === false) return;
    out[i] += v;
  }
}

// ---------------------------------------------------------------- plucked strings (Karplus–Strong)

interface PluckCfg {
  /** Seconds for the fundamental to decay 60 dB. */
  t60: number;
  /** 0..1 brightness of the string loss filter. */
  bright: number;
  /** Pluck position 0..0.5 (comb on the excitation; smaller = thinner). */
  pos: number;
  /** 0..1 softness of the excitation (finger vs. pick). */
  soft: number;
  /** Mix of a second, slightly detuned string (sympathetic shimmer). */
  shimmer: number;
  /** Damping time after note-off (0 = let it ring). */
  damp: number;
  /** Body resonances: [freq, q, dB][] */
  body: [number, number, number][];
  /** Sine sub-oscillator mix (adds weight to basses). */
  sub: number;
  gain: number;
}

class KString {
  private buf: Float32Array;
  private i = 0;
  private D: number;
  private S: number;
  private rho: number;
  private c: number;
  private x1 = 0;
  private ax1 = 0;
  private ay1 = 0;
  constructor(sr: number, freq: number, cfg: PluckCfg, vel: number, rng: Rng) {
    const N = sr / freq;
    this.S = 0.5 - 0.42 * cfg.bright;
    this.D = Math.max(2, Math.floor(N - this.S));
    const frac = N - this.S - this.D;
    this.c = (1 - frac) / (1 + frac);
    this.rho = Math.pow(0.001, 1 / (freq * cfg.t60));
    this.buf = new Float32Array(this.D);
    // Excitation: noise, softened (finger) and combed (pluck position), DC removed.
    const a = Math.min(0.97, cfg.soft * 0.9 + (1 - vel) * 0.25);
    let y = 0;
    for (let k = 0; k < this.D; k++) {
      y = (1 - a) * rng.noise() + a * y;
      this.buf[k] = y;
    }
    const P = Math.max(1, Math.round(this.D * cfg.pos));
    const ex = this.buf.slice();
    let mean = 0;
    for (let k = 0; k < this.D; k++) {
      this.buf[k] = ex[k] - ex[(k - P + this.D) % this.D];
      mean += this.buf[k];
    }
    mean /= this.D;
    let peak = 1e-9;
    for (let k = 0; k < this.D; k++) {
      this.buf[k] -= mean;
      peak = Math.max(peak, Math.abs(this.buf[k]));
    }
    for (let k = 0; k < this.D; k++) this.buf[k] /= peak;
  }
  next(): number {
    const x = this.buf[this.i];
    const lp = this.rho * ((1 - this.S) * x + this.S * this.x1);
    this.x1 = x;
    const ap = this.c * lp + this.ax1 - this.c * this.ay1;
    this.ax1 = lp;
    this.ay1 = ap;
    this.buf[this.i] = ap;
    if (++this.i >= this.D) this.i = 0;
    return x;
  }
}

function pluck(base: Omit<PluckCfg, 'gain'> & { gain?: number }, extra: Partial<Instrument> & { about: string }): Instrument {
  return {
    kind: 'tonal',
    tail: base.t60 + 0.2,
    defaults: { t60: base.t60, bright: base.bright, pos: base.pos, soft: base.soft, shimmer: base.shimmer, damp: base.damp, sub: base.sub },
    ...extra,
    render(out, n, { sr, rng, o }) {
      const cfg: PluckCfg = { ...base, gain: base.gain ?? 0.5, t60: o.t60, bright: o.bright, pos: o.pos, soft: o.soft, shimmer: o.shimmer, damp: o.damp, sub: o.sub };
      // Higher strings die sooner, as on real instruments.
      const t60 = cfg.t60 * Math.min(1.6, Math.max(0.35, Math.pow(220 / n.freq, 0.35)));
      const c2 = { ...cfg, t60 };
      const s1 = new KString(sr, n.freq, c2, n.vel, rng);
      const s2 = cfg.shimmer > 0 ? new KString(sr, n.freq * cents(rng.range(2, 4)), c2, n.vel * 0.8, rng) : null;
      const body = cfg.body.map(([f, q, db]) => Biquad.peak(sr, f, q, db));
      const sub = cfg.sub > 0 ? new Osc(0.25) : null;
      const subDecay = decayCoef(sr, t60 * 0.8);
      let subAmp = cfg.sub;
      const dampK = cfg.damp > 0 ? decayCoef(sr, cfg.damp) : 1;
      let damp = 1;
      const amp = cfg.gain * velAmp(n.vel);
      const dtSub = n.freq / sr;
      each(out, n.start, n.len + Math.round((cfg.damp > 0 ? cfg.damp * 1.2 : t60) * sr), (k) => {
        if (k >= n.len) {
          damp *= dampK;
          if (damp < 1e-4) return false;
        }
        let v = s1.next();
        if (s2) v = v * (1 - cfg.shimmer * 0.5) + s2.next() * cfg.shimmer * 0.5;
        for (const b of body) v = b.process(v);
        if (sub) {
          v += sub.sine(dtSub) * subAmp * Math.min(1, k / (0.004 * sr));
          subAmp *= subDecay;
        }
        return v * amp * damp;
      });
    },
  };
}

// ---------------------------------------------------------------- modal (struck bars, bells)

interface ModalCfg {
  /** [ratio, amplitude, decay multiplier] */
  partials: [number, number, number][];
  t60: number;
  /** Strike noise level and colour. */
  click: number;
  clickFc: number;
  attack: number;
  /** Release after note-off (0 = ring). */
  damp: number;
  trem: number;
  tremHz: number;
  gain: number;
  /** How much brighter (upper partials) hard hits are. */
  velBright: number;
}

function modal(cfg: ModalCfg, extra: Partial<Instrument> & { about: string }): Instrument {
  return {
    kind: 'tonal',
    tail: cfg.t60 * 1.2,
    defaults: { t60: cfg.t60, damp: cfg.damp, trem: cfg.trem, click: cfg.click },
    ...extra,
    render(out, n, { sr, rng, o }) {
      const t60 = o.t60 * Math.min(2, Math.max(0.3, Math.pow(440 / n.freq, 0.45)));
      const ps = cfg.partials.filter(([r]) => n.freq * r < sr * 0.45);
      const phase = ps.map(() => rng.next());
      const dts = ps.map(([r]) => (n.freq * r) / sr);
      const amps = ps.map(([, a], i) => a * (i === 0 ? 1 : Math.pow(n.vel, cfg.velBright)));
      const dec = ps.map(([, , d]) => decayCoef(sr, t60 * d));
      const clickF = new SVF(sr, cfg.clickFc, 1.2);
      const clickLen = Math.round(0.012 * sr);
      const att = Math.max(1, cfg.attack * sr);
      const dampK = o.damp > 0 ? decayCoef(sr, o.damp) : 1;
      let damp = 1;
      const amp = cfg.gain * velAmp(n.vel);
      const tremDt = cfg.tremHz / sr;
      each(out, n.start, n.len + Math.round((o.damp > 0 ? o.damp * 1.2 : t60 * 1.1) * sr), (k) => {
        if (k >= n.len && o.damp > 0) {
          damp *= dampK;
          if (damp < 1e-4) return false;
        }
        let v = 0;
        for (let p = 0; p < ps.length; p++) {
          v += sin01(phase[p]) * amps[p];
          phase[p] += dts[p];
          amps[p] *= dec[p];
        }
        if (amps[0] < 1e-5) return false;
        if (k < clickLen) v += clickF.process(rng.noise()) * o.click * (1 - k / clickLen) * 4;
        const a = k < att ? k / att : 1;
        const tr = o.trem > 0 ? 1 - o.trem * 0.5 * (1 + Math.sin(TAU * tremDt * k)) : 1;
        return v * a * tr * amp * damp;
      });
    },
  };
}

// ---------------------------------------------------------------- sustained voices

/** Musette accordion: 2–3 detuned reeds (the beating is the musette "wet" sound), bellows wobble, reed formant. */
const accordion: Instrument = {
  kind: 'tonal',
  tail: 0.3,
  range: [53, 93],
  about: 'Musette accordion (detuned reeds); tango, humppa, waltz.',
  defaults: { detune: 11, reeds: 3, bright: 0.5, low: 0.3, attack: 0.03 },
  render(out, n, { sr, rng, o }) {
    const ratios = o.reeds >= 3 ? [1, cents(o.detune), cents(-o.detune * 0.8)] : o.reeds >= 2 ? [1, cents(o.detune)] : [1];
    const oscs = ratios.map(() => new Osc(rng.next()));
    const low = new Osc(rng.next());
    const env = new Env(sr, o.attack, 0.2, 0.82, 0.08);
    const f = new SVF(sr, Math.min(sr * 0.45, n.freq * (2.5 + 5 * o.bright * (0.4 + 0.6 * n.vel)) + 700), 0.8);
    const formant = Biquad.peak(sr, 1250, 1.3, 6);
    const amp = (0.17 * velAmp(n.vel)) / Math.sqrt(ratios.length);
    const wobDt = rng.range(0.3, 0.6) / sr;
    const wobP = rng.next();
    const dts = ratios.map((r) => (n.freq * r) / sr);
    each(out, n.start, n.len + Math.round(0.3 * sr), (k) => {
      if (k === n.len) env.release();
      const e = env.next();
      if (env.done) return false;
      let s = 0;
      for (let r = 0; r < oscs.length; r++) s += oscs[r].pulse(dts[r], 0.38);
      s += low.saw(n.freq / 2 / sr) * o.low;
      const wob = 1 + 0.035 * sin01(wobP + k * wobDt);
      return formant.process(f.process(s)) * e * amp * wob;
    });
  },
};

/** FM electric piano (Rhodes-like): bell "bark" at high velocity, tine ping, optional tremolo. */
const epiano: Instrument = {
  kind: 'tonal',
  tail: 1.2,
  range: [40, 96],
  about: 'FM electric piano (Rhodes-like); lo-fi, muzak, soft jazz.',
  defaults: { bark: 1, trem: 0, decay: 3 },
  render(out, n, { sr, rng, o }) {
    const t60 = o.decay * Math.min(1.6, Math.max(0.4, Math.pow(261 / n.freq, 0.4)));
    const ampK = decayCoef(sr, t60);
    const idxK = decayCoef(sr, 0.9);
    const tineK = decayCoef(sr, 0.05);
    let a = 1;
    let idx = (0.6 + 2.2 * n.vel) * o.bark;
    let tine = 0.22 * n.vel;
    let cp = rng.next();
    let mp = rng.next();
    let tp = 0;
    const dt = n.freq / sr;
    const tdt = Math.min(0.45, (n.freq * 14) / sr);
    const rel = decayCoef(sr, 0.25);
    const amp = 0.28 * velAmp(n.vel);
    const attack = Math.round(0.002 * sr);
    each(out, n.start, n.len + Math.round(1.2 * sr), (k) => {
      if (k >= n.len) a *= rel;
      if (a < 1e-4) return false;
      const m = sin01(mp);
      let v = sin01(cp + (idx * m) / TAU) + tine * sin01(tp);
      cp += dt;
      mp += dt;
      tp += tdt;
      a *= ampK;
      idx = 0.25 * o.bark + (idx - 0.25 * o.bark) * idxK;
      tine *= tineK;
      if (o.trem > 0) v *= 1 - o.trem * 0.5 * (1 + Math.sin((TAU * 4.6 * k) / sr));
      return v * a * amp * (k < attack ? k / attack : 1);
    });
  },
};

/** Soft felt piano: inharmonic additive partials, slow-beating unison, hammer thump. */
const felt: Instrument = {
  kind: 'tonal',
  tail: 1,
  range: [33, 100],
  about: 'Soft felt piano (additive); lullaby, home, reflective.',
  defaults: { decay: 4, pedal: 0, bright: 0.5 },
  render(out, n, { sr, rng, o }) {
    const T = o.decay * Math.min(1.8, Math.max(0.35, Math.pow(261 / n.freq, 0.5)));
    const P = 8;
    const B = 0.0003;
    const ph: number[] = [];
    const dt: number[] = [];
    const amp: number[] = [];
    const dec: number[] = [];
    for (let k = 1; k <= P; k++) {
      const f = k * n.freq * Math.sqrt(1 + B * k * k);
      if (f > sr * 0.4) break;
      ph.push(rng.next());
      dt.push(f / sr);
      amp.push((1 / Math.pow(k, 1.25)) * Math.exp(-(k - 1) * (1.25 - n.vel * 0.7 - o.bright * 0.4)));
      dec.push(decayCoef(sr, T / (1 + 0.55 * (k - 1))));
    }
    const beatDt = rng.range(0.6, 1.4) / sr;
    const thump = new SVF(sr, 280, 0.7);
    const thumpLen = Math.round(0.03 * sr);
    const att = Math.round(0.005 * sr);
    const relK = decayCoef(sr, o.pedal > 0 ? 1.2 : 0.22);
    let rel = 1;
    const g = 0.3 * velAmp(n.vel);
    each(out, n.start, n.len + Math.round((o.pedal > 0 ? 1.4 : 0.3) * sr), (k) => {
      if (k >= n.len) {
        rel *= relK;
        if (rel < 1e-4) return false;
      }
      let v = 0;
      for (let p = 0; p < ph.length; p++) {
        v += sin01(ph[p]) * amp[p];
        ph[p] += dt[p];
        amp[p] *= dec[p];
      }
      if (amp[0] < 1e-5) return false;
      v *= 1 + 0.12 * Math.sin(TAU * beatDt * k);
      if (k < thumpLen) v += thump.process(rng.noise()) * 0.35 * n.vel * (1 - k / thumpLen);
      return v * g * rel * (k < att ? k / att : 1);
    });
  },
};

/** Detuned-saw ensemble through a low-pass; slow attack. */
function padLike(defs: Record<string, number>, about: string): Instrument {
  return {
    kind: 'tonal',
    tail: 2,
    range: [36, 96],
    about,
    defaults: defs,
    render(out, n, { sr, rng, o }) {
      const det = [0, o.detune, -o.detune];
      const oscs = det.map(() => new Osc(rng.next()));
      const dts = det.map((d) => (n.freq * cents(d)) / sr);
      const env = new Env(sr, o.attack, 1.5, 0.85, o.release);
      const f = new SVF(sr, o.cutoff, 0.6);
      const amp = 0.16 * velAmp(n.vel);
      const vibDt = 5.2 / sr;
      const vibStart = Math.round(0.3 * sr);
      const vibP = rng.next();
      each(out, n.start, n.len + Math.round(o.release * 1.3 * sr), (k) => {
        if (k === n.len) env.release();
        const e = env.next();
        if (env.done) return false;
        const vib = k > vibStart ? 1 + o.vibrato * 0.004 * sin01(vibP + k * vibDt) : 1;
        let s = 0;
        for (let i = 0; i < 3; i++) s += oscs[i].saw(dts[i] * vib);
        if ((k & 15) === 0) f.set(o.cutoff * (0.6 + 0.4 * e) * (0.7 + 0.5 * n.vel), 0.6);
        return f.process(s) * e * amp;
      });
    },
  };
}

/** Breathy winds: sine + a few harmonics + band-passed breath, chiff on attack, delayed vibrato. */
function windLike(defs: Record<string, number>, about: string, range: [number, number]): Instrument {
  return {
    kind: 'tonal',
    tail: 0.4,
    range,
    about,
    defaults: defs,
    render(out, n, { sr, rng, o }) {
      const osc = new Osc(rng.next());
      const osc2 = new Osc(rng.next());
      const osc3 = new Osc(rng.next());
      const env = new Env(sr, o.attack, 0.3, 0.85, o.release);
      const breathF = new SVF(sr, Math.min(sr * 0.45, n.freq * 2), 2.5);
      const chiffF = new SVF(sr, Math.min(sr * 0.45, n.freq * 4), 1.5);
      const chiffLen = Math.round(0.05 * sr);
      const vibStart = Math.round(o.vibDelay * sr);
      const vibDt = o.vibHz / sr;
      const amp = 0.3 * velAmp(n.vel);
      const dt = n.freq / sr;
      let vibAmt = 0;
      each(out, n.start, n.len + Math.round(o.release * 1.4 * sr), (k) => {
        if (k === n.len) env.release();
        const e = env.next();
        if (env.done) return false;
        if (k > vibStart) vibAmt = Math.min(1, vibAmt + 1 / (0.25 * sr));
        const vib = 1 + o.vibrato * 0.006 * vibAmt * Math.sin(TAU * vibDt * k);
        let v = osc.sine(dt * vib) + o.h2 * osc2.sine(2 * dt * vib) + o.h3 * osc3.sine(3 * dt * vib);
        breathF.process(rng.noise());
        v += breathF.bp * o.breath * 3;
        if (k < chiffLen) {
          chiffF.process(rng.noise());
          v += chiffF.bp * o.chiff * 4 * (1 - k / chiffLen);
        }
        return v * e * amp;
      });
    },
  };
}

/** Brass: saw through a low-pass that opens with the attack ("blat"), pitch scoop, vibrato. */
function brassLike(defs: Record<string, number>, about: string, range: [number, number]): Instrument {
  return {
    kind: 'tonal',
    tail: 0.4,
    range,
    about,
    defaults: defs,
    render(out, n, { sr, rng, o }) {
      const osc = new Osc(rng.next());
      const osc2 = new Osc(rng.next());
      const env = new Env(sr, o.attack, 0.25, 0.8, o.release);
      const f = new SVF(sr, n.freq * 2, 0.9);
      const amp = 0.2 * velAmp(n.vel);
      const scoopLen = Math.max(1, Math.round(0.045 * sr));
      const vibStart = Math.round(0.28 * sr);
      const dt = n.freq / sr;
      const det = cents(o.detune);
      each(out, n.start, n.len + Math.round(o.release * 1.4 * sr), (k) => {
        if (k === n.len) env.release();
        const e = env.next();
        if (env.done) return false;
        const scoop = k < scoopLen ? cents(-o.scoop * (1 - k / scoopLen)) : 1;
        const vib = k > vibStart ? 1 + o.vibrato * 0.005 * Math.sin((TAU * 5.3 * k) / sr) : 1;
        const s = osc.saw(dt * scoop * vib) + 0.6 * osc2.saw(dt * scoop * vib * det);
        if ((k & 7) === 0) f.set(n.freq * (1 + o.bright * (1.5 + 5 * n.vel) * e), 0.9);
        return f.process(s) * e * amp;
      });
    },
  };
}

/** Drawbar organ (additive) with key click and a slow rotary wobble. */
const organ: Instrument = {
  kind: 'tonal',
  tail: 0.2,
  range: [36, 96],
  about: 'Drawbar organ; church, iskelmä, soul.',
  defaults: { b16: 0.5, b8: 1, b4: 0.55, b223: 0.25, b2: 0.3, rotary: 0.5, click: 0.4 },
  render(out, n, { sr, rng, o }) {
    const ratios = [0.5, 1, 2, 3, 4];
    const levels = [o.b16, o.b8, o.b4, o.b223, o.b2];
    const ph = ratios.map(() => rng.next());
    const dts = ratios.map((r) => (n.freq * r) / sr);
    const env = new Env(sr, 0.006, 0.1, 1, 0.06);
    const click = new SVF(sr, 2500, 0.8);
    const clickLen = Math.round(0.006 * sr);
    const rotDt = 5.8 / sr;
    const amp = 0.13 * velAmp(n.vel * 0.6 + 0.4);
    each(out, n.start, n.len + Math.round(0.2 * sr), (k) => {
      if (k === n.len) env.release();
      const e = env.next();
      if (env.done) return false;
      const rot = Math.sin(TAU * rotDt * k);
      let v = 0;
      for (let p = 0; p < 5; p++) {
        if (dts[p] >= 0.45) continue;
        v += sin01(ph[p]) * levels[p];
        ph[p] += dts[p] * (1 + o.rotary * 0.0012 * rot);
      }
      v *= 1 + o.rotary * 0.12 * rot;
      if (k < clickLen) v += click.process(rng.noise()) * o.click * 2 * (1 - k / clickLen);
      return v * e * amp;
    });
  },
};

/** "Aah" choir pad: detuned saws through vowel formants. */
const choir: Instrument = {
  kind: 'tonal',
  tail: 1.5,
  range: [48, 84],
  about: 'Soft "aah/ooh" choir pad.',
  defaults: { attack: 0.4, release: 0.9, vowel: 0 },
  render(out, n, { sr, rng, o }) {
    const det = [0, 9, -8, 4];
    const oscs = det.map(() => new Osc(rng.next()));
    const dts = det.map((d) => (n.freq * cents(d)) / sr);
    const A: [number, number][] = [
      [800, 1],
      [1150, 0.5],
      [2900, 0.25],
    ];
    const U: [number, number][] = [
      [350, 1],
      [600, 0.3],
      [2400, 0.1],
    ];
    const w = Math.max(0, Math.min(1, o.vowel));
    const forms = A.map(([f, g], i) => ({ f: Biquad.bp(sr, f * (1 - w) + U[i][0] * w, 6), g: g * (1 - w) + U[i][1] * w }));
    const env = new Env(sr, o.attack, 1, 0.9, o.release);
    const amp = 0.4 * velAmp(n.vel);
    const vibDt = 4.8 / sr;
    each(out, n.start, n.len + Math.round(o.release * 1.3 * sr), (k) => {
      if (k === n.len) env.release();
      const e = env.next();
      if (env.done) return false;
      const vib = 1 + 0.003 * Math.sin(TAU * vibDt * k);
      let s = 0;
      for (let i = 0; i < oscs.length; i++) s += oscs[i].saw(dts[i] * vib);
      let v = 0;
      for (const fm of forms) v += fm.f.process(s) * fm.g;
      return v * e * amp;
    });
  },
};

/** Round electric bass: saw + sine through an enveloped low-pass. */
const ebass: Instrument = {
  kind: 'tonal',
  tail: 0.3,
  range: [28, 60],
  about: 'Round fingered electric bass.',
  defaults: { cutoff: 700, release: 0.08 },
  render(out, n, { sr, rng, o }) {
    const a = new Osc(rng.next());
    const b = new Osc(0.25);
    const env = new Env(sr, 0.004, 0.8, 0.55, o.release);
    const fenv = decayCoef(sr, 0.25);
    let fe = 1;
    const f = new SVF(sr, o.cutoff, 0.8);
    const amp = 0.4 * velAmp(n.vel);
    const dt = n.freq / sr;
    each(out, n.start, n.len + Math.round(0.3 * sr), (k) => {
      if (k === n.len) env.release();
      const e = env.next();
      if (env.done) return false;
      fe *= fenv;
      if ((k & 7) === 0) f.set(o.cutoff * (0.7 + 1.5 * fe * n.vel), 0.8);
      return (f.process(a.saw(dt)) * 0.6 + b.sine(dt) * 0.55) * e * amp;
    });
  },
};

/** Soft square lead (a friendly synth melody voice). */
const lead: Instrument = {
  kind: 'tonal',
  tail: 0.3,
  range: [55, 96],
  about: 'Soft pulse-wave synth lead.',
  defaults: { pw: 0.3, cutoff: 5, vibrato: 1, attack: 0.01, release: 0.12 },
  render(out, n, { sr, rng, o }) {
    const osc = new Osc(rng.next());
    const env = new Env(sr, o.attack, 0.3, 0.75, o.release);
    const f = new SVF(sr, Math.min(sr * 0.45, n.freq * o.cutoff), 0.7);
    const amp = 0.18 * velAmp(n.vel);
    const dt = n.freq / sr;
    const vibStart = Math.round(0.2 * sr);
    each(out, n.start, n.len + Math.round(o.release * 1.5 * sr), (k) => {
      if (k === n.len) env.release();
      const e = env.next();
      if (env.done) return false;
      const vib = k > vibStart ? 1 + o.vibrato * 0.005 * Math.sin((TAU * 5.5 * k) / sr) : 1;
      return f.process(osc.pulse(dt * vib, o.pw)) * e * amp;
    });
  },
};

// ---------------------------------------------------------------- drums

function drum(about: string, tail: number, render: Instrument['render'], defaults: Record<string, number> = {}): Instrument {
  return { kind: 'drum', tail, about, defaults: { tone: 1, ...defaults }, render };
}

const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

function metallic(out: Float32Array, n: Note, sr: number, rng: Rng, decay: number, tone: number, gain: number) {
  const ph = METAL.map(() => rng.next());
  const dts = METAL.map((f) => (f * 1.7 * tone) / sr);
  const bp = Biquad.bp(sr, 10000 * tone, 0.9);
  const hp = Biquad.hp(sr, 7000 * tone, 0.7);
  const k = decayCoef(sr, decay);
  let a = gain * velAmp(n.vel);
  each(out, n.start, Math.round(decay * 1.1 * sr), () => {
    let s = 0;
    for (let i = 0; i < 6; i++) {
      s += ph[i] < 0.5 ? 1 : -1;
      ph[i] += dts[i];
      if (ph[i] >= 1) ph[i] -= 1;
    }
    s = s * 0.12 + rng.noise() * 0.35;
    const v = hp.process(bp.process(s)) * a;
    a *= k;
    return v;
  });
}

const DRUMS: Record<string, Instrument> = {
  kick: drum('Kick drum.', 0.5, (out, n, { sr, rng, o }) => {
    let ph = 0;
    const click = Math.round(0.004 * sr);
    const g = 0.75 * velAmp(n.vel);
    each(out, n.start, Math.round(0.5 * sr), (k) => {
      const t = k / sr;
      ph += (o.tone * (46 + 120 * Math.exp(-t * 30))) / sr;
      let v = sin01(ph) * Math.exp(-t * 6.5);
      if (k < click) v += rng.noise() * 0.3 * (1 - k / click);
      return v * g;
    });
  }),
  snare: drum('Snare drum.', 0.35, (out, n, { sr, rng, o }) => {
    const hp = Biquad.hp(sr, 1400, 0.7);
    const lp = Biquad.lp(sr, 9000, 0.7);
    let p1 = 0;
    let p2 = 0;
    const g = 0.5 * velAmp(n.vel);
    each(out, n.start, Math.round(0.35 * sr), (k) => {
      const t = k / sr;
      p1 += (185 * o.tone) / sr;
      p2 += (332 * o.tone) / sr;
      const tone = (sin01(p1) + 0.6 * sin01(p2)) * Math.exp(-t * 22) * 0.45;
      const noise = lp.process(hp.process(rng.noise())) * Math.exp(-t * 16);
      return (tone + noise) * g;
    });
  }),
  brush: drum('Brush on a snare (swish/tap).', 0.4, (out, n, { sr, rng, o }) => {
    const bp = Biquad.bp(sr, 3200 * o.tone, 0.6);
    const g = 0.4 * velAmp(n.vel);
    const att = Math.round(0.018 * sr);
    each(out, n.start, Math.round(0.35 * sr), (k) => {
      const t = k / sr;
      const e = k < att ? k / att : Math.exp(-(t - att / sr) * 12);
      return bp.process(rng.noise()) * e * g;
    });
  }),
  hat: drum('Closed hi-hat.', 0.12, (out, n, { sr, rng, o }) => metallic(out, n, sr, rng, 0.07, o.tone, 0.85)),
  ohat: drum('Open hi-hat.', 0.6, (out, n, { sr, rng, o }) => metallic(out, n, sr, rng, 0.45, o.tone, 0.6)),
  crash: drum('Crash cymbal.', 2.2, (out, n, { sr, rng, o }) => metallic(out, n, sr, rng, 1.9, o.tone * 0.85, 0.45)),
  rim: drum('Rim click / side stick.', 0.08, (out, n, { sr, rng, o }) => {
    const bp = Biquad.bp(sr, 1800 * o.tone, 5);
    let p = 0;
    const g = 0.6 * velAmp(n.vel);
    each(out, n.start, Math.round(0.08 * sr), (k) => {
      const t = k / sr;
      p += (480 * o.tone) / sr;
      return (bp.process(rng.noise()) * 3 + sin01(p) * 0.4) * Math.exp(-t * 45) * g;
    });
  }),
  clap: drum('Hand clap.', 0.3, (out, n, { sr, rng, o }) => {
    const bp = Biquad.bp(sr, 1100 * o.tone, 1.1);
    const bursts = [0, 0.009, 0.018, 0.028].map((s) => Math.round(s * sr));
    const g = 0.7 * velAmp(n.vel);
    each(out, n.start, Math.round(0.3 * sr), (k) => {
      let e = 0;
      for (let b = 0; b < bursts.length; b++) {
        const d = k - bursts[b];
        if (d >= 0) e = b === bursts.length - 1 ? Math.exp(-d / (0.06 * sr)) : Math.max(e, Math.exp(-d / (0.003 * sr)));
      }
      return bp.process(rng.noise()) * e * g;
    });
  }),
  shaker: drum('Shaker.', 0.12, (out, n, { sr, rng, o }) => {
    const hp = Biquad.hp(sr, 5500 * o.tone, 0.7);
    const att = Math.round(0.01 * sr);
    const g = 0.28 * velAmp(n.vel);
    each(out, n.start, Math.round(0.11 * sr), (k) => {
      const e = k < att ? k / att : Math.exp(-(k - att) / (0.025 * sr));
      return hp.process(rng.noise()) * e * g;
    });
  }),
  tamb: drum('Tambourine.', 0.3, (out, n, { sr, rng, o }) => {
    const hp = Biquad.hp(sr, 6000, 0.7);
    const js = [4100, 5300, 6700, 7900].map((f) => ({ p: rng.next(), dt: (f * o.tone) / sr }));
    const g = 0.3 * velAmp(n.vel);
    each(out, n.start, Math.round(0.3 * sr), (k) => {
      const t = k / sr;
      let j = 0;
      for (const x of js) {
        j += sin01(x.p);
        x.p += x.dt;
      }
      return (hp.process(rng.noise()) * Math.exp(-t * 30) + j * 0.12 * Math.exp(-t * 12)) * g;
    });
  }),
  tom: drum('Tom (pitched by the note).', 0.6, (out, n, { sr, rng }) => {
    let p = 0;
    const g = 0.6 * velAmp(n.vel);
    const f0 = n.freq;
    each(out, n.start, Math.round(0.6 * sr), (k) => {
      const t = k / sr;
      p += (f0 * (1 + 0.6 * Math.exp(-t * 25))) / sr;
      return (sin01(p) + rng.noise() * 0.08 * Math.exp(-t * 40)) * Math.exp(-t * 6) * g;
    });
  }),
  block: drum('Woodblock (pitched by tone).', 0.1, (out, n, { sr, rng, o }) => {
    let p = 0;
    const bp = Biquad.bp(sr, 2200 * o.tone, 3);
    const g = 0.5 * velAmp(n.vel);
    each(out, n.start, Math.round(0.1 * sr), (k) => {
      const t = k / sr;
      p += (880 * o.tone) / sr;
      return (sin01(p) + bp.process(rng.noise()) * 1.5) * Math.exp(-t * 55) * g;
    });
  }),
  clave: drum('Clave.', 0.12, (out, n, { sr, o }) => {
    let p = 0;
    const g = 0.45 * velAmp(n.vel);
    each(out, n.start, Math.round(0.12 * sr), (k) => {
      p += (2500 * o.tone) / sr;
      return sin01(p) * Math.exp((-k / sr) * 38) * g;
    });
  }),
  snap: drum('Finger snap.', 0.1, (out, n, { sr, rng, o }) => {
    const bp = Biquad.bp(sr, 2400 * o.tone, 2);
    const g = 0.6 * velAmp(n.vel);
    each(out, n.start, Math.round(0.1 * sr), (k) => bp.process(rng.noise()) * Math.exp((-k / sr) * 55) * g * 2);
  }),
  triangle: drum('Triangle.', 1.6, (out, n, { sr, rng, o }) => {
    const ps = [1, 2.76, 5.4, 8.9].map((r, i) => ({ p: rng.next(), dt: (1250 * o.tone * r) / sr, a: [1, 0.5, 0.35, 0.2][i], k: decayCoef(sr, [1.5, 1.1, 0.8, 0.5][i]) }));
    const g = 0.18 * velAmp(n.vel);
    each(out, n.start, Math.round(1.6 * sr), () => {
      let v = 0;
      for (const x of ps) {
        v += sin01(x.p) * x.a;
        x.p += x.dt;
        x.a *= x.k;
      }
      return v * g;
    });
  }),
};

// ---------------------------------------------------------------- registry

const GUITAR_BODY: [number, number, number][] = [
  [105, 2, 6],
  [210, 2.5, 3],
  [420, 2, 2],
  [2600, 1, -4],
];
const KANTELE_BODY: [number, number, number][] = [
  [260, 2, 4],
  [1100, 1.5, 3],
  [3500, 1, 2],
];

export const INSTRUMENTS: Record<string, Instrument> = {
  accordion,
  epiano,
  felt,
  organ,
  choir,
  ebass,
  lead,
  kantele: pluck(
    { t60: 3.2, bright: 0.75, pos: 0.13, soft: 0.25, shimmer: 0.6, damp: 0, body: KANTELE_BODY, sub: 0 },
    { range: [55, 96], about: 'Kantele: bright, ringing plucked strings with sympathetic shimmer.' },
  ),
  guitar: pluck(
    { t60: 2.4, bright: 0.45, pos: 0.18, soft: 0.45, shimmer: 0, damp: 0.12, body: GUITAR_BODY, sub: 0 },
    { range: [40, 84], about: 'Nylon-string acoustic guitar.' },
  ),
  harp: pluck(
    { t60: 4.5, bright: 0.55, pos: 0.25, soft: 0.65, shimmer: 0.25, damp: 0, body: [[400, 1, 2]], sub: 0 },
    { range: [36, 100], about: 'Concert harp: soft, long ringing plucks.' },
  ),
  bass: pluck(
    { t60: 1.4, bright: 0.15, pos: 0.22, soft: 0.8, shimmer: 0, damp: 0.09, body: [[90, 1.5, 4], [1200, 0.7, -6]], sub: 0.45, gain: 0.65 },
    { range: [28, 55], about: 'Upright bass, plucked.' },
  ),
  vibes: modal(
    { partials: [[1, 1, 1], [4, 0.16, 0.25], [10, 0.035, 0.08]], t60: 3.5, click: 0.06, clickFc: 3000, attack: 0.002, damp: 0, trem: 0.3, tremHz: 5.5, gain: 0.26, velBright: 1 },
    { range: [53, 89], about: 'Vibraphone with motor tremolo.' },
  ),
  glock: modal(
    { partials: [[1, 1, 1], [2.76, 0.32, 0.4], [5.4, 0.16, 0.22], [8.93, 0.07, 0.12]], t60: 2.2, click: 0.08, clickFc: 6000, attack: 0.001, damp: 0, trem: 0, tremHz: 0, gain: 0.2, velBright: 1.2 },
    { range: [72, 108], about: 'Glockenspiel.' },
  ),
  marimba: modal(
    { partials: [[1, 1, 1], [3.93, 0.28, 0.14], [9.2, 0.07, 0.05]], t60: 1.0, click: 0.1, clickFc: 1500, attack: 0.002, damp: 0, trem: 0, tremHz: 0, gain: 0.32, velBright: 1.3 },
    { range: [45, 96], about: 'Marimba.' },
  ),
  musicbox: modal(
    { partials: [[1, 1, 1], [2, 0.1, 0.5], [5.03, 0.18, 0.2], [9.1, 0.05, 0.1]], t60: 1.7, click: 0.1, clickFc: 8000, attack: 0.001, damp: 0, trem: 0, tremHz: 0, gain: 0.22, velBright: 1 },
    { range: [65, 104], about: 'Music box comb.' },
  ),
  bell: modal(
    {
      partials: [[0.5, 0.55, 1.7], [1, 1, 1], [1.19, 0.4, 0.8], [1.5, 0.3, 0.7], [2, 0.45, 0.6], [2.51, 0.22, 0.45], [3.01, 0.14, 0.35], [4.17, 0.1, 0.25]],
      t60: 5, click: 0.04, clickFc: 2500, attack: 0.002, damp: 0, trem: 0, tremHz: 0, gain: 0.18, velBright: 0.8,
    },
    { range: [43, 84], about: 'Church / tubular bell.' },
  ),
  pad: padLike({ attack: 0.4, release: 0.8, cutoff: 1800, detune: 7, vibrato: 0.5 }, 'Warm analog pad.'),
  strings: padLike({ attack: 0.18, release: 0.5, cutoff: 3600, detune: 9, vibrato: 1 }, 'String ensemble.'),
  flute: windLike({ attack: 0.06, release: 0.12, h2: 0.12, h3: 0.05, breath: 0.08, chiff: 0.15, vibrato: 1, vibHz: 5, vibDelay: 0.25 }, 'Flute: breathy, delayed vibrato.', [60, 96]),
  whistle: windLike({ attack: 0.035, release: 0.08, h2: 0.04, h3: 0, breath: 0.03, chiff: 0.04, vibrato: 1.6, vibHz: 6, vibDelay: 0.12 }, 'Someone whistling a tune.', [67, 98]),
  reed: windLike({ attack: 0.04, release: 0.1, h2: 0.05, h3: 0.45, breath: 0.05, chiff: 0.05, vibrato: 0.5, vibHz: 5, vibDelay: 0.35 }, 'Clarinet-ish reed (odd harmonics).', [50, 91]),
  brass: brassLike({ attack: 0.05, release: 0.1, bright: 1, scoop: 25, vibrato: 0.8, detune: 6 }, 'Soft brass / horn section.', [48, 84]),
  tuba: brassLike({ attack: 0.035, release: 0.09, bright: 0.45, scoop: 15, vibrato: 0, detune: 3 }, 'Tuba (oom-pah bass).', [28, 58]),
  ...DRUMS,
};

export const instrumentNames = () => Object.keys(INSTRUMENTS);

export const NOTE_ONLY = (inst: string) => INSTRUMENTS[inst]?.kind === 'tonal';

/** Helper for one-off renders (sound effects): renders a note into a fresh buffer. */
export function renderNote(inst: string, midi: number, seconds: number, vel: number, sr: number, seed = 1, opts: Record<string, number> = {}): Float32Array {
  const def = INSTRUMENTS[inst];
  if (!def) throw new Error(`Unknown instrument '${inst}'`);
  const out = new Float32Array(Math.ceil((seconds + def.tail) * sr));
  def.render(out, { start: 0, len: Math.round(seconds * sr), midi, freq: 440 * Math.pow(2, (midi - 69) / 12), vel }, { sr, rng: new Rng(seed), o: { ...def.defaults, ...opts } });
  return out;
}

export { OnePole };
