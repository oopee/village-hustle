/**
 * Ambience ("atmosphere") layers mixed under location music: birds, lake waves, a crackling
 * fire, café murmur, a ticking clock, factory machines synced to the beat...
 *
 * Everything here is generated CIRCULARLY for a loop of n samples: events wrap around the
 * loop end, noise beds are cross-faded into their own start and every slow modulation runs a
 * whole number of cycles per loop, so the result loops without a seam.
 *
 * A song lists its layers as  "ambience": [{ "type": "birds", "level": 0.8, "rev": 0.3 }].
 */
import { Biquad, decayCoef, Osc, Rng, SVF, sin01, TAU } from './dsp';

export interface AmbienceSpec {
  type: string;
  /** Loudness multiplier (1 = the designed default). */
  level?: number;
  /** Event density multiplier. */
  rate?: number;
  /** Centre pan -1..1 for beds/events (events also spread around it). */
  pan?: number;
  /** Reverb send 0..1 (applied by the song renderer). */
  rev?: number;
  seed?: number;
  /** Generator-specific numbers. */
  opts?: Record<string, number>;
}

interface Ctx {
  n: number;
  sr: number;
  /** Seconds per beat of the song (machines sync to it). */
  spb: number;
  rng: Rng;
  L: Float32Array;
  R: Float32Array;
  rate: number;
  pan: number;
  o: Record<string, number>;
}

// ---------------------------------------------------------------- helpers

/** Adds a mono event at sample `pos`, wrapping around the loop end. */
function place(c: Ctx, mono: Float32Array, pos: number, pan: number, gain: number) {
  const p = Math.max(-1, Math.min(1, pan));
  const gl = Math.cos(((p + 1) * Math.PI) / 4) * gain;
  const gr = Math.sin(((p + 1) * Math.PI) / 4) * gain;
  const n = c.n;
  let idx = ((Math.round(pos) % n) + n) % n;
  for (let j = 0; j < mono.length; j++) {
    c.L[idx] += mono[j] * gl;
    c.R[idx] += mono[j] * gr;
    if (++idx >= n) idx = 0;
  }
}

/**
 * A continuous bed: generates n + X samples per channel and cross-fades the overhang into the
 * start (equal power, since the two ends are uncorrelated noise).
 * `make` returns a fresh generator; L and R get independent ones mixed by `width`.
 */
function bed(c: Ctx, make: (ch: number) => (k: number) => number, gain: number, width = 0.6, pan = c.pan) {
  const X = Math.min(Math.round(c.sr * 1.5), Math.floor(c.n / 3));
  const len = c.n + X;
  const chans = [0, 1].map((ch) => {
    const g = make(ch);
    const b = new Float32Array(len);
    for (let k = 0; k < len; k++) b[k] = g(k);
    for (let i = 0; i < X; i++) {
      const t = i / X;
      b[i] = b[i] * Math.sin((t * Math.PI) / 2) + b[c.n + i] * Math.cos((t * Math.PI) / 2);
    }
    return b;
  });
  const p = Math.max(-1, Math.min(1, pan));
  const gl = Math.cos(((p + 1) * Math.PI) / 4) * Math.SQRT2 * gain;
  const gr = Math.sin(((p + 1) * Math.PI) / 4) * Math.SQRT2 * gain;
  const a = (1 + width) / 2;
  const b = (1 - width) / 2;
  for (let k = 0; k < c.n; k++) {
    const x = chans[0][k];
    const y = chans[1][k];
    c.L[k] += (a * x + b * y) * gl;
    c.R[k] += (b * x + a * y) * gr;
  }
}

/** A slow periodic modulation 0..1 built from a few sines with whole cycles per loop. */
function slowMod(c: Ctx, hz: number, parts = 3): (k: number) => number {
  const comps = Array.from({ length: parts }, (_, i) => {
    const cycles = Math.max(1, Math.round(((hz * (1 + i * 0.83)) * c.n) / c.sr));
    return { dt: cycles / c.n, ph: c.rng.next(), a: 1 / (i + 1) };
  });
  const norm = comps.reduce((s, x) => s + x.a, 0);
  return (k) => {
    let v = 0;
    for (const x of comps) v += x.a * sin01(x.ph + x.dt * k);
    return 0.5 + (0.5 * v) / norm;
  };
}

/** Random event times (samples) at `perSec` average rate, at least `minGap` seconds apart. */
function scatter(c: Ctx, perSec: number, minGap = 0.1): number[] {
  const count = Math.max(perSec > 0 ? 1 : 0, Math.round((perSec * c.rate * c.n) / c.sr));
  const out: number[] = [];
  let tries = 0;
  while (out.length < count && tries++ < count * 20) {
    const t = Math.floor(c.rng.next() * c.n);
    const gap = minGap * c.sr;
    if (out.every((x) => Math.min(Math.abs(x - t), c.n - Math.abs(x - t)) >= gap)) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

const buf = (c: Ctx, seconds: number) => new Float32Array(Math.max(1, Math.round(seconds * c.sr)));

/** Distance: low-passes an event in place. */
function far(c: Ctx, b: Float32Array, fc: number) {
  const f = Biquad.lp(c.sr, fc, 0.6);
  for (let i = 0; i < b.length; i++) b[i] = f.process(b[i]);
  return b;
}

/** A gliding, enveloped sine tone (bird and animal calls). */
function tone(c: Ctx, b: Float32Array, start: number, dur: number, f: (t: number) => number, amp: number, harm = 0.1, att = 0.15) {
  const len = Math.round(dur * c.sr);
  let ph = c.rng.next();
  for (let k = 0; k < len && start + k < b.length; k++) {
    const t = k / len;
    const e = t < att ? Math.sin(((t / att) * Math.PI) / 2) : Math.pow(Math.cos((((t - att) / (1 - att)) * Math.PI) / 2), 1.5);
    ph += f(t) / c.sr;
    b[start + k] += (sin01(ph) + harm * sin01(ph * 2)) * e * amp;
  }
}

// ---------------------------------------------------------------- generators

const GENERATORS: Record<string, { about: string; run: (c: Ctx) => void }> = {
  birds: {
    about: 'Songbirds: whistles, trills, warbles and chirps around the listener.',
    run(c) {
      const { rng } = c;
      for (const at of scatter(c, 0.32, 0.6)) {
        const kind = rng.int(0, 3);
        const b = buf(c, 2);
        const base = rng.range(2600, 4600);
        if (kind === 0) {
          // two/three-note whistle ("ti-tyy")
          const notes = rng.int(2, 3);
          let s = 0;
          for (let i = 0; i < notes; i++) {
            const f0 = base * (i === notes - 1 ? rng.range(0.75, 0.9) : rng.range(0.95, 1.15));
            const d = rng.range(0.09, 0.22);
            tone(c, b, s, d, (t) => f0 * (1 + 0.06 * (1 - t)), 0.5, 0.06);
            s += Math.round((d + rng.range(0.05, 0.12)) * c.sr);
          }
        } else if (kind === 1) {
          // trill: fast repeated down-sweeps
          const count = rng.int(8, 18);
          const rate = rng.range(12, 20);
          for (let i = 0; i < count; i++) {
            const s = Math.round((i / rate) * c.sr);
            const f0 = base * rng.range(1.05, 1.3);
            tone(c, b, s, 0.03, (t) => f0 * (1 - 0.35 * t), 0.4 * (0.6 + 0.4 * Math.sin((Math.PI * i) / count)), 0.15, 0.2);
          }
        } else if (kind === 2) {
          // warble: varied short notes with a fast vibrato
          let s = 0;
          const count = rng.int(5, 10);
          for (let i = 0; i < count; i++) {
            const f0 = base * rng.range(0.7, 1.4);
            const d = rng.range(0.05, 0.12);
            const vib = rng.range(25, 45);
            const bend = rng.range(-0.15, 0.15);
            tone(c, b, s, d, (t) => f0 * (1 + 0.05 * Math.sin(TAU * vib * t * d)) * (1 + bend * t), 0.35, 0.12);
            s += Math.round((d + rng.range(0.01, 0.05)) * c.sr);
          }
        } else {
          // sparrow-ish up-chirps
          const count = rng.int(1, 3);
          for (let i = 0; i < count; i++) {
            tone(c, b, Math.round(i * 0.16 * c.sr), 0.07, (t) => base * 0.7 * (1 + 0.6 * t), 0.4, 0.25, 0.1);
          }
        }
        const dist = rng.range(0, 1);
        far(c, b, 9000 - dist * 5000);
        place(c, b, at, c.pan + rng.range(-0.85, 0.85), 0.12 * (1 - dist * 0.65));
      }
    },
  },

  cuckoo: {
    about: 'A distant cuckoo (käki) calling "kuk-koo" a few times.',
    run(c) {
      const { rng } = c;
      const f1 = rng.range(640, 700);
      for (const at of scatter(c, 0.06, 6)) {
        const calls = rng.int(2, 5);
        const b = buf(c, calls * 0.75 + 0.5);
        for (let i = 0; i < calls; i++) {
          const s = Math.round(i * 0.72 * c.sr);
          tone(c, b, s, 0.17, () => f1, 0.5, 0.12, 0.3);
          tone(c, b, s + Math.round(0.24 * c.sr), 0.3, (t) => f1 * 0.81 * (1 - 0.02 * t), 0.45, 0.12, 0.2);
        }
        far(c, b, 2200);
        place(c, b, at, c.pan + rng.range(-0.6, 0.6), 0.09);
      }
    },
  },

  loon: {
    about: 'The haunting wail of a black-throated loon (kuikka) across the lake.',
    run(c) {
      const { rng } = c;
      for (const at of scatter(c, 0.035, 10)) {
        const b = buf(c, 3.4);
        const f0 = rng.range(560, 640);
        const up = rng.range(1.35, 1.55);
        // a long glide up, a hold, and a break back down
        tone(
          c, b, 0, 2.6,
          (t) => {
            const g = t < 0.3 ? 1 + (up - 1) * Math.sin(((t / 0.3) * Math.PI) / 2) : t < 0.75 ? up : up - (up - 1.1) * ((t - 0.75) / 0.25);
            return f0 * g * (1 + 0.008 * Math.sin(TAU * 5 * t * 2.6));
          },
          0.5, 0.35, 0.25,
        );
        far(c, b, 2600);
        place(c, b, at, c.pan + rng.range(-0.5, 0.5), 0.07);
      }
    },
  },

  waves: {
    about: 'Small lake waves lapping on a sandy shore.',
    run(c) {
      const swell = slowMod(c, 0.13);
      bed(c, () => {
        const f = new SVF(c.sr, 500, 0.5);
        const r = new Rng(c.rng.int(1, 1e9));
        return (k) => {
          const s = swell(k);
          if ((k & 31) === 0) f.set(250 + 900 * s * s, 0.5);
          return f.process(r.noise()) * (0.25 + 0.75 * s * s);
        };
      }, 0.09, 0.7);
      // laps: short splashy bursts
      for (const at of scatter(c, 0.3, 1.2)) {
        const b = buf(c, 0.7);
        const bp = Biquad.bp(c.sr, c.rng.range(900, 2200), 0.7);
        const att = 0.04 * c.sr;
        for (let k = 0; k < b.length; k++) {
          const e = k < att ? k / att : Math.exp(-(k - att) / (0.15 * c.sr));
          b[k] = bp.process(c.rng.noise()) * e;
        }
        place(c, b, at, c.pan + c.rng.range(-0.6, 0.6), 0.08 * c.rng.range(0.5, 1));
      }
    },
  },

  wind: {
    about: 'Wind in the trees, in slow gusts.',
    run(c) {
      const gust = slowMod(c, 0.07, 4);
      bed(c, (ch) => {
        const f = new SVF(c.sr, 600, 1.4);
        const r = new Rng(c.rng.int(1, 1e9));
        const g2 = slowMod(c, 0.11 + ch * 0.03);
        return (k) => {
          const s = 0.6 * gust(k) + 0.4 * g2(k);
          if ((k & 31) === 0) f.set(280 + 1100 * s, 1.4);
          f.process(r.noise());
          return f.bp * (0.15 + s * s);
        };
      }, 0.1, 0.8);
    },
  },

  fire: {
    about: 'A wood fire or sauna stove: soft roar plus crackles and pops.',
    run(c) {
      const flick = slowMod(c, 0.6, 3);
      bed(c, () => {
        const lp = Biquad.lp(c.sr, 160, 0.7);
        const hp = Biquad.hp(c.sr, 3500, 0.7);
        const r = new Rng(c.rng.int(1, 1e9));
        return (k) => (lp.process(r.noise()) * 1.4 + hp.process(r.noise()) * 0.05) * (0.6 + 0.4 * flick(k));
      }, 0.06, 0.4);
      const crackle = (perSec: number, fc: [number, number], dec: [number, number], gain: number) => {
        for (const at of scatter(c, perSec, 0.01)) {
          const d = c.rng.range(dec[0], dec[1]);
          const b = buf(c, d * 6);
          const bp = Biquad.bp(c.sr, c.rng.range(fc[0], fc[1]), 1.2);
          const k60 = decayCoef(c.sr, d);
          let a = 1;
          for (let k = 0; k < b.length; k++) {
            b[k] = bp.process(c.rng.noise()) * a;
            a *= k60;
          }
          place(c, b, at, c.pan + c.rng.range(-0.4, 0.4), gain * c.rng.range(0.3, 1));
        }
      };
      crackle(7, [1800, 6000], [0.004, 0.012], 0.25);
      crackle(0.6, [500, 1400], [0.02, 0.05], 0.35);
    },
  },

  crowd: {
    about: 'Murmur of people talking, with clinking cups and the odd laugh.',
    run(c) {
      const { rng } = c;
      // phrases of "speech": noise through two moving formants, chopped into syllables
      for (const at of scatter(c, 3.2 * (c.o.people ?? 1), 0.05)) {
        const dur = rng.range(0.8, 2.6);
        const b = buf(c, dur);
        const pitch = rng.range(95, 230);
        const osc = new Osc(rng.next());
        const f1 = new SVF(c.sr, 500, 4);
        const f2 = new SVF(c.sr, 1500, 5);
        const r = new Rng(rng.int(1, 1e9));
        const syl = rng.range(3.5, 6);
        let sylPh = 0;
        let v1 = 500;
        let v2 = 1500;
        for (let k = 0; k < b.length; k++) {
          const t = k / b.length;
          sylPh += syl / c.sr;
          if (sylPh >= 1) {
            sylPh -= 1;
            v1 = r.range(300, 850);
            v2 = r.range(900, 2200);
          }
          if ((k & 63) === 0) {
            f1.set(v1, 4);
            f2.set(v2, 5);
          }
          const src = osc.saw((pitch * (1 + 0.1 * Math.sin(TAU * 1.3 * t))) / c.sr) * 0.6 + r.noise() * 0.4;
          f1.process(src);
          f2.process(src);
          const am = Math.pow(Math.sin(Math.PI * sylPh), 2);
          const env = Math.sin(Math.PI * t);
          b[k] = (f1.bp + 0.5 * f2.bp) * am * env;
        }
        far(c, b, 1800);
        place(c, b, at, c.pan + rng.range(-0.8, 0.8), 0.05 * rng.range(0.4, 1));
      }
      // cups and cutlery
      for (const at of scatter(c, 0.35 * (c.o.clinks ?? 1), 0.4)) {
        const b = buf(c, 0.5);
        const f0 = rng.range(2200, 4200);
        for (const [r, a, d] of [[1, 1, 0.25], [2.32, 0.5, 0.15], [4.1, 0.3, 0.08]] as const) {
          let ph = rng.next();
          const k60 = decayCoef(c.sr, d);
          let amp = a;
          for (let k = 0; k < b.length; k++) {
            b[k] += sin01(ph) * amp;
            ph += (f0 * r) / c.sr;
            amp *= k60;
          }
        }
        place(c, b, at, c.pan + rng.range(-0.8, 0.8), 0.035 * rng.range(0.4, 1));
      }
      // an occasional distant laugh: "ha-ha-ha" on vowel /a/
      for (const at of scatter(c, 0.04 * (c.o.laughs ?? 1), 5)) {
        const count = rng.int(3, 6);
        const b = buf(c, count * 0.2 + 0.2);
        const pitch = rng.range(150, 260);
        const osc = new Osc(0);
        const fa = Biquad.bp(c.sr, 800, 3);
        const fb = Biquad.bp(c.sr, 1250, 4);
        for (let k = 0; k < b.length; k++) {
          const t = k / c.sr;
          const s = (t % 0.19) / 0.12;
          const am = s < 1 ? Math.sin(Math.PI * s) * (1 - (t / (count * 0.19)) * 0.5) : 0;
          if (t > count * 0.19) break;
          const src = osc.saw((pitch * (1.1 - 0.15 * (t / (count * 0.19)))) / c.sr);
          b[k] = (fa.process(src) + 0.6 * fb.process(src)) * am;
        }
        far(c, b, 2000);
        place(c, b, at, c.pan + rng.range(-0.7, 0.7), 0.05);
      }
    },
  },

  clock: {
    about: 'A wall clock ticking (tick-tock, about once a second).',
    run(c) {
      const ticks = Math.max(1, Math.round(c.n / c.sr / (c.o.period ?? 1)));
      const step = c.n / ticks;
      for (let i = 0; i < ticks; i++) {
        const b = buf(c, 0.07);
        const bp = Biquad.bp(c.sr, i % 2 ? 2600 : 3200, 5);
        const body = Biquad.bp(c.sr, i % 2 ? 900 : 1100, 6);
        for (let k = 0; k < b.length; k++) {
          const x = k < 45 ? c.rng.noise() : 0;
          b[k] = (bp.process(x) + body.process(x) * 0.8) * Math.exp(-k / (0.008 * c.sr));
        }
        place(c, b, i * step, c.pan + 0.35, 0.7);
      }
    },
  },

  hum: {
    about: 'Electric hum of fluorescent lights (100 Hz buzz).',
    run(c) {
      const cyc = (hz: number) => Math.max(1, Math.round((hz * c.n) / c.sr)) / c.n;
      const parts = [
        [100, 1],
        [200, 0.5],
        [300, 0.35],
        [400, 0.15],
        [600, 0.08],
      ].map(([f, a]) => ({ dt: cyc(f), a, ph: c.rng.next() }));
      const wob = slowMod(c, 0.3);
      bed(c, () => (k) => {
        let v = 0;
        for (const p of parts) v += sin01(p.ph + p.dt * k) * p.a;
        return v * (0.8 + 0.2 * wob(k));
      }, 0.012, 0.1);
    },
  },

  beeps: {
    about: 'Checkout scanners beeping somewhere in the shop.',
    run(c) {
      for (const at of scatter(c, 0.35, 0.8)) {
        const double = c.rng.chance(0.25);
        const f0 = c.rng.pick([2700, 2900, 3150]);
        const b = buf(c, double ? 0.3 : 0.15);
        const osc = new Osc(0);
        const lp = Biquad.lp(c.sr, 5000, 0.7);
        for (let k = 0; k < b.length; k++) {
          const t = k / c.sr;
          const on = t < 0.09 || (double && t > 0.15 && t < 0.24);
          b[k] = on ? lp.process(osc.pulse(f0 / c.sr, 0.5)) * 0.4 : lp.process(0);
        }
        far(c, b, 4000);
        place(c, b, at, c.pan + c.rng.range(-0.8, 0.8), 0.07 * c.rng.range(0.5, 1));
      }
    },
  },

  train: {
    about: 'A railway station: a train rumbling past and a platform chime.',
    run(c) {
      const { rng, sr } = c;
      // one pass per loop
      const dur = Math.min(c.n / sr - 1, rng.range(9, 13));
      const b = buf(c, dur);
      const lp = Biquad.lp(sr, 140, 0.8);
      const mid = Biquad.bp(sr, 600, 0.7);
      for (let k = 0; k < b.length; k++) {
        const t = k / b.length;
        const env = Math.pow(Math.sin(Math.PI * t), 2);
        b[k] = (lp.process(rng.noise()) * 2 + mid.process(rng.noise()) * 0.3) * env;
      }
      const clack = Biquad.bp(sr, 520, 3);
      for (let s = 0.4; s < dur - 0.4; s += 1.05) {
        for (const off of [0, 0.11]) {
          const p = Math.round((s + off) * sr);
          const t = p / b.length;
          const env = Math.pow(Math.sin(Math.PI * t), 2);
          for (let k = 0; k < 0.04 * sr && p + k < b.length; k++) b[p + k] += clack.process(k < 40 ? rng.noise() * 3 : 0) * env;
        }
      }
      const at = rng.next() * c.n;
      // pan sweeps across while it passes: split into slices
      const slices = 24;
      for (let i = 0; i < slices; i++) {
        const a = Math.floor((i / slices) * b.length);
        const z = Math.floor(((i + 1) / slices) * b.length);
        const part = b.slice(a, z);
        place(c, part, at + a, -0.8 + (1.6 * i) / (slices - 1), 0.25);
      }
      // platform chime: three bell-ish tones
      if ((c.o.chime ?? 1) > 0) {
        const cb = buf(c, 3);
        [0, 0.45, 0.9].forEach((s, i) => {
          const f = [784, 659, 523][i];
          for (const [r, a, d] of [[1, 1, 1.4], [2, 0.3, 0.7], [3, 0.12, 0.4]] as const) {
            let ph = 0;
            const k60 = decayCoef(sr, d);
            let amp = a;
            const s0 = Math.round(s * sr);
            for (let k = 0; s0 + k < cb.length; k++) {
              cb[s0 + k] += sin01(ph) * amp;
              ph += (f * r) / sr;
              amp *= k60;
            }
          }
        });
        place(c, far(c, cb, 3500), (at + c.n / 2) % c.n, c.pan - 0.3, 0.06);
      }
    },
  },

  pages: {
    about: 'Quiet library: pages turning and a pencil scribbling.',
    run(c) {
      for (const at of scatter(c, 0.14, 2)) {
        const b = buf(c, 0.45);
        const f = new SVF(c.sr, 1500, 1.2);
        for (let k = 0; k < b.length; k++) {
          const t = k / b.length;
          if ((k & 31) === 0) f.set(1200 + 3500 * t, 1.2);
          f.process(c.rng.noise());
          const env = Math.sin(Math.PI * t) * (0.6 + 0.4 * c.rng.next());
          b[k] = f.bp * env;
        }
        place(c, b, at, c.pan + c.rng.range(-0.7, 0.7), 0.09);
      }
      for (const at of scatter(c, 0.06, 4)) {
        const b = buf(c, c.rng.range(0.6, 1.2));
        const bp = Biquad.bp(c.sr, 3500, 1.5);
        const rate = c.rng.range(8, 13);
        for (let k = 0; k < b.length; k++) {
          const s = Math.sin(Math.PI * ((k / c.sr) * rate));
          b[k] = bp.process(c.rng.noise()) * s * s * Math.sin((Math.PI * k) / b.length);
        }
        place(c, b, at, c.pan + c.rng.range(-0.5, 0.5), 0.03);
      }
    },
  },

  machines: {
    about: 'Factory floor: a press thumping on the beat, a motor drone, steam hiss, conveyor rattle.',
    run(c) {
      const { sr, rng } = c;
      const every = c.o.press ?? 2; // beats between press thumps
      const step = every * c.spb * sr;
      const count = Math.max(1, Math.round(c.n / step));
      for (let i = 0; i < count; i++) {
        const b = buf(c, 0.4);
        let ph = 0;
        const lp = Biquad.lp(sr, 900, 0.7);
        for (let k = 0; k < b.length; k++) {
          const t = k / sr;
          ph += (48 + 70 * Math.exp(-t * 25)) / sr;
          b[k] = sin01(ph) * Math.exp(-t * 9) + lp.process(k < 600 ? rng.noise() : 0) * 0.6;
        }
        place(c, b, (i * c.n) / count, c.pan - 0.2, 0.22);
        // the clank after the thump
        const cl = buf(c, 0.3);
        const parts = [1, 2.4, 3.9].map((r) => ({ ph: 0, dt: (r * 820) / sr }));
        for (let k = 0; k < cl.length; k++) {
          let v = 0;
          for (const p of parts) {
            v += sin01(p.ph);
            p.ph += p.dt;
          }
          cl[k] = v * Math.exp(-k / (0.05 * sr));
        }
        place(c, cl, (i * c.n) / count + 0.5 * c.spb * sr, c.pan + 0.4, 0.03);
      }
      // motor drone
      const cyc = (hz: number) => Math.max(1, Math.round((hz * c.n) / sr)) / c.n;
      const d1 = cyc(50);
      const d2 = cyc(100.6);
      bed(c, () => {
        const lp = Biquad.lp(sr, 400, 0.7);
        const o = new Osc(rng.next());
        let k0 = 0;
        return (k) => {
          k0 = k;
          return lp.process(o.saw(d1)) * 0.5 + sin01(d2 * k0) * 0.25;
        };
      }, 0.03, 0.2);
      // conveyor rattle
      const rattle = cyc(11);
      bed(c, () => {
        const bp = Biquad.bp(sr, 1800, 1);
        const r = new Rng(rng.int(1, 1e9));
        return (k) => bp.process(r.noise()) * Math.pow(0.5 + 0.5 * sin01(rattle * k), 6);
      }, 0.05, 0.5, c.pan + 0.3);
      // steam hiss every few bars
      for (const at of scatter(c, 0.06, 6)) {
        const b = buf(c, 1.4);
        const hp = Biquad.hp(sr, 2500, 0.7);
        for (let k = 0; k < b.length; k++) {
          const t = k / b.length;
          b[k] = hp.process(rng.noise()) * (t < 0.05 ? t / 0.05 : Math.pow(1 - t, 2));
        }
        place(c, b, at, c.pan + rng.range(-0.8, 0.8), 0.06);
      }
    },
  },

  grasshoppers: {
    about: 'Grasshoppers / crickets chirping in a summer meadow.',
    run(c) {
      const { rng, sr } = c;
      const bugs = Math.round((c.o.count ?? 5) * c.rate);
      for (let i = 0; i < bugs; i++) {
        const f0 = rng.range(4200, 7200);
        const pan = c.pan + rng.range(-0.9, 0.9);
        const gain = 0.03 * rng.range(0.4, 1);
        for (const at of scatter(c, 0.18, 1.5)) {
          const dur = rng.range(0.8, 2.5);
          const b = buf(c, dur);
          const pulse = rng.range(14, 28);
          let ph = rng.next();
          for (let k = 0; k < b.length; k++) {
            const t = k / sr;
            const p = (t * pulse) % 1;
            const am = p < 0.5 ? Math.sin(Math.PI * p * 2) : 0;
            ph += f0 / sr;
            b[k] = (sin01(ph) * 0.7 + rng.noise() * 0.3) * am * Math.sin((Math.PI * k) / b.length);
          }
          place(c, b, at, pan, gain);
        }
      }
    },
  },

  typing: {
    about: 'Office: bursts of keyboard typing.',
    run(c) {
      const { rng, sr } = c;
      for (const at of scatter(c, 0.12, 3)) {
        const dur = rng.range(1, 3.5);
        const b = buf(c, dur + 0.1);
        let t = 0;
        while (t < dur) {
          const p = Math.round(t * sr);
          const bp = Biquad.bp(sr, rng.range(2500, 4500), 2);
          const thump = Biquad.lp(sr, 300, 0.7);
          const a = rng.range(0.5, 1);
          for (let k = 0; k < 0.02 * sr && p + k < b.length; k++) {
            const x = k < 25 ? rng.noise() : 0;
            b[p + k] += (bp.process(x) * 1.5 + thump.process(x) * 0.8) * a * Math.exp(-k / (0.004 * sr));
          }
          t += rng.chance(0.08) ? rng.range(0.25, 0.5) : rng.range(0.07, 0.17);
        }
        place(c, b, at, c.pan + rng.range(-0.6, 0.6), 0.1);
      }
    },
  },

  rain: {
    about: 'Gentle rain on a roof.',
    run(c) {
      bed(c, () => {
        const bp = Biquad.bp(c.sr, 2500, 0.5);
        const lp = Biquad.lp(c.sr, 500, 0.7);
        const r = new Rng(c.rng.int(1, 1e9));
        return () => bp.process(r.noise()) * 0.6 + lp.process(r.noise()) * 0.4;
      }, 0.05, 0.8);
      for (const at of scatter(c, 6, 0.01)) {
        const b = buf(c, 0.02);
        const bp = Biquad.bp(c.sr, c.rng.range(2000, 6000), 3);
        for (let k = 0; k < b.length; k++) b[k] = bp.process(k < 8 ? c.rng.noise() : 0) * 3;
        place(c, b, at, c.pan + c.rng.range(-0.9, 0.9), 0.08 * c.rng.next());
      }
    },
  },
};

export const ambienceTypes = () => Object.keys(GENERATORS);
export const ambienceAbout = (t: string) => GENERATORS[t]?.about ?? '';

/** Renders one ambience layer for a loop of n samples into new (L, R) buffers. */
export function renderAmbience(spec: AmbienceSpec, n: number, sr: number, spb: number, seed: number): { L: Float32Array; R: Float32Array } {
  const gen = GENERATORS[spec.type];
  if (!gen) throw new Error(`Unknown ambience '${spec.type}' (known: ${ambienceTypes().join(', ')})`);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const c: Ctx = { n, sr, spb, rng: new Rng(seed ^ (spec.seed ?? 0)), L, R, rate: spec.rate ?? 1, pan: spec.pan ?? 0, o: spec.opts ?? {} };
  gen.run(c);
  const lvl = spec.level ?? 1;
  if (lvl !== 1) {
    for (let i = 0; i < n; i++) {
      L[i] *= lvl;
      R[i] *= lvl;
    }
  }
  return { L, R };
}
