/**
 * Sound effects, synthesized from recipes (no sample files). Each recipe can render several
 * random variants so repeated sounds (footsteps, clicks, coins) don't sound copy-pasted.
 *
 * To add one: write a recipe below, then map it to a game moment in the theme's audio.json
 * (see docs/AUDIO-GUIDE.md). `npm run audio sfx` renders them all to audio-preview/sfx/.
 */
import { Biquad, decayCoef, hashSeed, Osc, peakOf, Reverb, Rng, SVF, sin01, TAU } from './dsp';
import { renderNote } from './instruments';
import { renderSong, SAMPLE_RATE } from './render';
import type { SongDef } from './song';
import { formantVoice, type FormantOpts } from './voice';

type Mono = Float32Array;

/** A small mixing desk for building one sound. Times are in seconds. */
class Desk {
  L: Float32Array;
  R: Float32Array;
  constructor(readonly sr: number, seconds: number, readonly rng: Rng) {
    this.L = new Float32Array(Math.round(seconds * sr));
    this.R = new Float32Array(Math.round(seconds * sr));
  }
  buf(sec: number): Mono {
    return new Float32Array(Math.max(1, Math.round(sec * this.sr)));
  }
  add(m: Mono, at = 0, pan = 0, gain = 1) {
    const p = Math.max(-1, Math.min(1, pan));
    const gl = Math.cos(((p + 1) * Math.PI) / 4) * Math.SQRT2 * gain;
    const gr = Math.sin(((p + 1) * Math.PI) / 4) * Math.SQRT2 * gain;
    const s = Math.round(at * this.sr);
    const n = Math.min(m.length, this.L.length - s);
    for (let k = Math.max(0, -s); k < n; k++) {
      this.L[s + k] += m[k] * gl;
      this.R[s + k] += m[k] * gr;
    }
  }
  addStereo(l: Float32Array, r: Float32Array, at = 0, gain = 1) {
    const s = Math.round(at * this.sr);
    const n = Math.min(l.length, this.L.length - s);
    for (let k = 0; k < n; k++) {
      this.L[s + k] += l[k] * gain;
      this.R[s + k] += r[k] * gain;
    }
  }

  // ---------------------------------------------------------- generators (mono)

  /** Filtered noise with an attack/decay envelope (decay = exponential time constant). */
  noise(sec: number, o: { lp?: number; hp?: number; bp?: [number, number]; att?: number; dec?: number; env?: (t: number) => number; gain?: number; sweep?: (t: number) => number }): Mono {
    const b = this.buf(sec);
    const sr = this.sr;
    const lp = o.lp ? Biquad.lp(sr, o.lp, 0.7) : null;
    const hp = o.hp ? Biquad.hp(sr, o.hp, 0.7) : null;
    const bp = o.bp ? new SVF(sr, o.bp[0], o.bp[1]) : null;
    const att = Math.max(1, (o.att ?? 0.002) * sr);
    const dec = o.dec ?? 1e9;
    for (let k = 0; k < b.length; k++) {
      const t = k / b.length;
      let x = this.rng.noise();
      if (bp) {
        if (o.sweep && (k & 15) === 0) bp.set(o.sweep(t), o.bp![1]);
        bp.process(x);
        x = bp.bp;
      }
      if (lp) x = lp.process(x);
      if (hp) x = hp.process(x);
      const e = o.env ? o.env(t) : Math.min(1, k / att) * Math.exp(-(k / sr) / dec);
      b[k] = x * e * (o.gain ?? 1);
    }
    return b;
  }

  /** A tone with a pitch curve f(t) (t = 0..1 over the sound). */
  tone(sec: number, f: (t: number) => number, o: { wave?: 'sine' | 'tri' | 'saw' | 'square'; att?: number; dec?: number; env?: (t: number) => number; gain?: number; lp?: number; harm?: number } = {}): Mono {
    const b = this.buf(sec);
    const sr = this.sr;
    const osc = new Osc(0);
    const lp = o.lp ? Biquad.lp(sr, o.lp, 0.7) : null;
    const att = Math.max(1, (o.att ?? 0.003) * sr);
    const dec = o.dec ?? 1e9;
    let ph2 = 0;
    for (let k = 0; k < b.length; k++) {
      const t = k / b.length;
      const dt = f(t) / sr;
      let x = o.wave === 'saw' ? osc.saw(dt) : o.wave === 'square' ? osc.pulse(dt, 0.5) : o.wave === 'tri' ? osc.tri(dt) : osc.sine(dt);
      if (o.harm) {
        x += o.harm * sin01(ph2);
        ph2 += 2 * dt;
      }
      if (lp) x = lp.process(x);
      const e = o.env ? o.env(t) : Math.min(1, k / att) * Math.exp(-(k / sr) / dec);
      b[k] = x * e * (o.gain ?? 1);
    }
    return b;
  }

  /** A struck object: inharmonic partials [ratio, amp, decay seconds] plus a noise click. */
  hit(sec: number, f0: number, partials: [number, number, number][], o: { click?: number; clickFc?: number; gain?: number } = {}): Mono {
    const b = this.buf(sec);
    const sr = this.sr;
    for (const [r, a, d] of partials) {
      const f = f0 * r;
      if (f > sr * 0.45) continue;
      let ph = this.rng.next();
      const k60 = decayCoef(sr, d);
      let amp = a;
      for (let k = 0; k < b.length && amp > 1e-5; k++) {
        b[k] += sin01(ph) * amp;
        ph += f / sr;
        amp *= k60;
      }
    }
    if (o.click) {
      const f = Biquad.bp(sr, o.clickFc ?? 3000, 1);
      const n = Math.round(0.004 * sr);
      for (let k = 0; k < n && k < b.length; k++) b[k] += f.process(this.rng.noise()) * o.click * (1 - k / n) * 3;
    }
    if (o.gain) for (let k = 0; k < b.length; k++) b[k] *= o.gain;
    return b;
  }

  /** Dense random impulses through a band-pass (crunch, crackle, scratch, rustle). */
  grains(sec: number, density: (t: number) => number, o: { bp: [number, number]; amp?: (t: number) => number; dec?: number; gain?: number }): Mono {
    const b = this.buf(sec);
    const sr = this.sr;
    const f = new SVF(sr, o.bp[0], o.bp[1]);
    const decK = Math.exp(-1 / Math.max(1, (o.dec ?? 0.0015) * sr));
    let e = 0;
    for (let k = 0; k < b.length; k++) {
      const t = k / b.length;
      if (this.rng.next() < density(t) / sr) e = this.rng.range(0.3, 1) * (o.amp ? o.amp(t) : 1);
      f.process(this.rng.noise() * e);
      e *= decK;
      b[k] = f.bp * (o.gain ?? 1) * 4;
    }
    return b;
  }

  voice(o: FormantOpts): Mono {
    return formantVoice(this.sr, this.rng, o);
  }

  inst(name: string, midi: number, dur: number, vel = 0.8, opts: Record<string, number> = {}): Mono {
    return renderNote(name, midi, dur, vel, this.sr, this.rng.int(1, 1e9), opts);
  }

  /** A little piece of music (jingles), rendered by the song engine. */
  song(def: Omit<SongDef, 'loop'>, at = 0, gain = 1) {
    const r = renderSong({ ...def, loop: false, master: { loudness: -16, ...def.master } }, { sr: this.sr });
    for (const w of r.warnings) console.warn(`sfx jingle: ${w}`);
    this.addStereo(r.left, r.right, at, gain);
  }

  /** Puts the whole sound in a room. */
  room(size: number, wet: number, damp = 0.5) {
    const rv = new Reverb(this.sr, { size, damp, predelay: 0.01 });
    for (let k = 0; k < this.L.length; k++) {
      rv.process((this.L[k] + this.R[k]) * 0.5);
      this.L[k] += rv.outL * wet;
      this.R[k] += rv.outR * wet;
    }
  }
}

const bell = (t: number) => Math.sin(Math.PI * Math.min(1, t));
const swell = (a: number) => (t: number) => (t < a ? t / a : Math.pow(1 - (t - a) / (1 - a), 1.5));

interface SfxDef {
  about: string;
  /** Length in seconds (sounds are trimmed after). */
  len: number;
  /** Relative loudness (peak level). */
  level?: number;
  variants?: number;
  make(d: Desk): void;
}

// ---------------------------------------------------------------- reusable parts

function mm(d: Desk, at: number, pitch = 175, len = 0.38) {
  d.add(d.voice({ dur: len, pitch: (t) => pitch * (1 + 0.18 * Math.sin(Math.PI * t) - 0.05 * t), vowel: () => 'm', breath: 0.04, buzz: 0.4, attack: 0.03, release: 0.12 }), at, 0, 1.3);
}

function ahh(d: Desk, at: number, pitch = 185, len = 0.6) {
  d.add(d.voice({ dur: len, pitch: (t) => pitch * (1.05 - 0.2 * t), vowel: (t) => (t < 0.7 ? 'a' : 'a>o'), breath: 0.45, buzz: 0.35, attack: 0.05, release: 0.25, shift: 1.05 }), at, 0, 1.1);
}

function chew(d: Desk, at: number, crunch: number) {
  d.add(d.grains(0.16, (t) => 2500 * crunch * (1 - t), { bp: [d.rng.range(1500, 2800), 0.9], amp: bell, dec: 0.0012 }), at, d.rng.range(-0.1, 0.1), 0.9);
  d.add(d.noise(0.12, { lp: 350, env: bell, gain: 0.5 }), at, 0, 0.8);
}

function clink(d: Desk, at: number, f0: number, gain = 1, pan = 0) {
  d.add(d.hit(0.5, f0, [[1, 1, 0.22], [2.35, 0.55, 0.14], [3.9, 0.35, 0.09], [5.2, 0.2, 0.05]], { click: 0.2, clickFc: 5000 }), at, pan, gain);
}

function latch(d: Desk, at: number, gain = 1) {
  d.add(d.hit(0.12, 1900, [[1, 0.6, 0.03], [1.9, 0.4, 0.02], [3.1, 0.3, 0.015]], { click: 0.5, clickFc: 3500 }), at, 0, gain);
}

function thump(d: Desk, at: number, f = 80, gain = 1, len = 0.25) {
  d.add(d.tone(len, (t) => f * (1.4 - 0.4 * Math.min(1, t * 4)), { dec: len / 4, att: 0.002 }), at, 0, gain);
  d.add(d.noise(len * 0.6, { lp: 500, dec: len / 6 }), at, 0, gain * 0.6);
}

function claps(d: Desk, at: number, people: number, sec: number) {
  for (let p = 0; p < people; p++) {
    const rate = d.rng.range(4, 6);
    for (let t = d.rng.range(0, 0.15); t < sec; t += 1 / rate + d.rng.range(-0.02, 0.02)) {
      d.add(d.noise(0.04, { bp: [d.rng.range(900, 1500), 1.2], dec: 0.008 }), at + t, d.rng.range(-0.8, 0.8), 0.25 * (1 - (t / sec) * 0.6));
    }
  }
}

// ---------------------------------------------------------------- the library

export const SFX: Record<string, SfxDef> = {
  // ------------------------------------------------ UI
  click: {
    about: 'Soft wooden UI tick.',
    len: 0.08,
    level: 0.35,
    variants: 3,
    make(d) {
      const f = d.rng.range(1500, 1900);
      d.add(d.tone(0.06, (t) => f * (1 - 0.25 * t), { wave: 'tri', dec: 0.008, att: 0.001 }));
      d.add(d.noise(0.01, { hp: 3500, dec: 0.002 }), 0, 0, 0.4);
    },
  },
  denied: {
    about: 'Gentle "uh-uh" buzz when something is not possible.',
    len: 0.35,
    level: 0.4,
    make(d) {
      d.add(d.tone(0.1, () => 196, { wave: 'square', lp: 1300, env: swell(0.1) }));
      d.add(d.tone(0.16, () => 165, { wave: 'square', lp: 1100, env: swell(0.08) }), 0.14);
    },
  },
  step: {
    about: 'A footstep on a gravel road.',
    len: 0.14,
    level: 0.28,
    variants: 4,
    make(d) {
      d.add(d.grains(0.1, (t) => 3500 * (1 - t), { bp: [d.rng.range(1200, 2600), 0.7], amp: swell(0.15), dec: 0.0008 }), 0, d.rng.range(-0.15, 0.15));
      d.add(d.tone(0.06, (t) => 95 - 30 * t, { dec: 0.015 }), 0, 0, 0.35);
    },
  },

  // ------------------------------------------------ doors
  door: {
    about: 'An old wooden door: latch click and a creak.',
    len: 0.85,
    level: 0.5,
    variants: 2,
    make(d) {
      latch(d, 0);
      // stick-slip friction: an impulse train of wandering rate exciting wood resonances
      const b = d.buf(0.55);
      const r1 = new SVF(d.sr, d.rng.range(650, 800), 9);
      const r2 = new SVF(d.sr, d.rng.range(1400, 1700), 11);
      let ph = 0;
      const f0 = d.rng.range(30, 45);
      for (let k = 0; k < b.length; k++) {
        const t = k / b.length;
        ph += (f0 * (1 + 0.8 * Math.sin(Math.PI * t) + 0.15 * Math.sin(TAU * 3 * t))) / d.sr;
        const imp = ph >= 1 ? (ph -= 1, d.rng.range(0.5, 1)) : 0;
        r1.process(imp);
        r2.process(imp);
        b[k] = (r1.bp + 0.6 * r2.bp) * Math.sin(Math.PI * t) * 2.5;
      }
      d.add(b, 0.06, 0.2, 1);
      d.room(0.4, 0.25);
    },
  },
  door_close: {
    about: 'A door closing: thump and latch.',
    len: 0.5,
    level: 0.5,
    make(d) {
      thump(d, 0, 75, 1, 0.3);
      latch(d, 0.02, 0.7);
      d.room(0.45, 0.3);
    },
  },
  slide: {
    about: 'Automatic sliding doors (whoosh and motor).',
    len: 1.1,
    level: 0.4,
    make(d) {
      d.add(d.noise(1, { bp: [500, 1.2], sweep: (t) => 400 + 900 * t, env: bell }), 0, -0.3, 0.8);
      d.add(d.tone(1, (t) => 110 + 30 * t, { wave: 'saw', lp: 500, env: bell }), 0, 0.3, 0.12);
      d.add(d.hit(0.3, 900, [[1, 0.3, 0.05], [2.7, 0.2, 0.03]], { click: 0.3 }), 0.95, 0, 0.3);
    },
  },
  shopbell: {
    about: 'The little bell on a shop door.',
    len: 1.8,
    level: 0.45,
    make(d) {
      latch(d, 0, 0.4);
      const f0 = d.rng.range(2350, 2600);
      let a = 1;
      for (let i = 0, t = 0.03; i < 5; i++, t += d.rng.range(0.07, 0.12)) {
        d.add(d.hit(1.4, f0 * d.rng.range(0.985, 1.015), [[1, 1, 0.9], [2.32, 0.45, 0.5], [4.25, 0.25, 0.25], [6.1, 0.1, 0.12]], { click: 0.15, clickFc: 6000 }), t, 0.25, a);
        a *= 0.62;
      }
    },
  },
  clank: {
    about: 'A heavy metal factory door.',
    len: 1.4,
    level: 0.55,
    make(d) {
      thump(d, 0, 60, 1, 0.4);
      d.add(d.hit(1.3, 170, [[1, 0.6, 0.9], [2.47, 0.5, 0.7], [6.3, 0.35, 0.4], [11.2, 0.2, 0.2]], { click: 0.6, clickFc: 2000 }), 0, 0, 0.6);
      latch(d, 0.1, 0.5);
      d.room(0.8, 0.45);
    },
  },
  keys: {
    about: 'A bunch of keys jingling.',
    len: 0.8,
    level: 0.45,
    make(d) {
      for (let i = 0; i < 9; i++) clink(d, d.rng.range(0, 0.45), d.rng.range(3200, 6500), d.rng.range(0.25, 0.7), d.rng.range(-0.4, 0.4));
    },
  },

  // ------------------------------------------------ money
  coins: {
    about: 'A few coins on the counter.',
    len: 0.8,
    level: 0.5,
    variants: 3,
    make(d) {
      const n = d.rng.int(3, 5);
      let t = 0;
      for (let i = 0; i < n; i++) {
        clink(d, t, d.rng.range(2600, 4300), 1 - i * 0.12, d.rng.range(-0.3, 0.3));
        t += d.rng.range(0.045, 0.1);
      }
    },
  },
  kaching: {
    about: 'An old cash register: clunk, drawer and "ching!".',
    len: 1.5,
    level: 0.55,
    make(d) {
      d.add(d.noise(0.06, { lp: 1500, dec: 0.015 }), 0, 0, 0.8);
      d.add(d.hit(0.3, 520, [[1, 0.5, 0.06], [2.3, 0.3, 0.04]], { click: 0.5 }), 0, 0, 0.6);
      d.add(d.noise(0.18, { bp: [700, 1.5], sweep: (t) => 600 + 500 * t, env: bell }), 0.05, 0, 0.5);
      d.add(d.hit(1.3, 2093, [[1, 1, 1.1], [2.0, 0.4, 0.7], [2.76, 0.35, 0.5], [3.9, 0.2, 0.3], [5.4, 0.1, 0.15]], { click: 0.3, clickFc: 6000 }), 0.12, 0.15, 0.9);
      clink(d, 0.22, 3300, 0.35, -0.3);
      clink(d, 0.29, 2900, 0.25, -0.2);
    },
  },
  bag: {
    about: 'Groceries going into a paper bag.',
    len: 0.9,
    level: 0.45,
    make(d) {
      d.add(d.grains(0.7, (t) => 900 * (0.3 + Math.sin(Math.PI * t) * (0.7 + 0.3 * Math.sin(TAU * 4 * t))), { bp: [3200, 0.6], dec: 0.002 }), 0, 0.1);
      thump(d, 0.55, 110, 0.5, 0.15);
    },
  },
  stamp: {
    about: 'An official rubber stamp: ka-THUNK.',
    len: 0.6,
    level: 0.55,
    make(d) {
      d.add(d.noise(0.05, { lp: 700, dec: 0.01 }), 0, 0, 0.35);
      thump(d, 0.17, 105, 1, 0.22);
      d.add(d.noise(0.25, { bp: [240, 4], dec: 0.06 }), 0.17, 0, 0.8);
      d.add(d.noise(0.04, { hp: 1500, dec: 0.008 }), 0.17, 0, 0.4);
      d.room(0.3, 0.2);
    },
  },
  scan: {
    about: 'Checkout: items slide over the barcode scanner, beep, beep, beep.',
    len: 1.2,
    level: 0.4,
    make(d) {
      for (let i = 0; i < 3; i++) {
        const at = i * d.rng.range(0.3, 0.4);
        d.add(d.noise(0.12, { bp: [1800, 0.8], env: bell }), at, -0.2, 0.25);
        d.add(d.tone(0.09, () => 2730, { env: (t) => Math.min(1, t * 40, (1 - t) * 40) }), at + 0.1, 0.1, 0.5);
      }
    },
  },
  bills: {
    about: 'Banknotes being counted.',
    len: 0.8,
    level: 0.45,
    make(d) {
      for (let i = 0; i < 5; i++) d.add(d.noise(0.06, { bp: [2600, 0.8], sweep: (t) => 2000 + 2000 * t, env: bell }), i * 0.12, 0.1, 0.8);
    },
  },

  // ------------------------------------------------ food & drink
  eat: {
    about: 'Munch, munch, munch... "mm!"',
    len: 1.4,
    level: 0.6,
    variants: 2,
    make(d) {
      d.add(d.noise(0.05, { bp: [2400, 1], dec: 0.01 }), 0, 0, 0.7); // the first bite
      for (let i = 0; i < 3; i++) chew(d, 0.05 + i * d.rng.range(0.24, 0.3), 1 - i * 0.25);
      mm(d, 0.95, d.rng.range(160, 200));
    },
  },
  gulp: {
    about: 'Two gulps and a refreshed "aah".',
    len: 1.5,
    level: 0.55,
    make(d) {
      for (let i = 0; i < 2; i++) {
        const at = i * 0.3;
        d.add(d.tone(0.09, (t) => 430 - 270 * t, { env: bell, harm: 0.2 }), at, 0, 0.7);
        d.add(d.noise(0.02, { bp: [1200, 2], dec: 0.004 }), at, 0, 0.4);
      }
      ahh(d, 0.75);
    },
  },
  pour: {
    about: 'Coffee poured into a cup (the pitch rises as it fills).',
    len: 1.5,
    level: 0.45,
    make(d) {
      const b = d.buf(1.15);
      const f = new SVF(d.sr, 500, 7);
      const g = Biquad.bp(d.sr, 2500, 0.7);
      let flick = 0;
      for (let k = 0; k < b.length; k++) {
        const t = k / b.length;
        if ((k & 15) === 0) f.set(450 + 1000 * t * t, 7);
        if (d.rng.next() < 40 / d.sr) flick = d.rng.range(0.4, 1);
        flick *= 0.9995;
        f.process(d.rng.noise());
        const env = Math.min(1, t / 0.04) * Math.min(1, (1 - t) / 0.12);
        b[k] = (f.bp * (0.6 + 0.4 * flick) * 1.5 + g.process(d.rng.noise()) * 0.15) * env;
      }
      d.add(b, 0, 0.1);
      clink(d, 1.25, 4200, 0.4, 0.2);
    },
  },
  slurp: {
    about: 'Slurping hot soup, then "mm".',
    len: 1.1,
    level: 0.55,
    make(d) {
      d.add(d.noise(0.42, { bp: [900, 4], sweep: (t) => 700 + 1900 * Math.sin(Math.PI * t * 0.8), env: (t) => bell(t) * (0.6 + 0.4 * Math.sin(TAU * 11 * t)) }), 0, 0, 1);
      mm(d, 0.55, 170, 0.4);
    },
  },
  lick: {
    about: 'Licking an ice cream, "mmm".',
    len: 1.1,
    level: 0.5,
    make(d) {
      for (let i = 0; i < 2; i++) d.add(d.noise(0.16, { bp: [2400, 2.5], sweep: (t) => 1800 + 1500 * t, env: swell(0.7) }), i * 0.24, 0, 0.8);
      mm(d, 0.55, 215, 0.42);
    },
  },
  sizzle: {
    about: 'Something sizzling on a grill.',
    len: 1.4,
    level: 0.45,
    make(d) {
      d.add(d.noise(1.35, { hp: 3000, env: swell(0.08) }), 0, -0.1, 0.35);
      d.add(d.grains(1.35, () => 220, { bp: [4500, 1], amp: swell(0.08), dec: 0.0008 }), 0, 0.1, 1);
    },
  },
  brew: {
    about: 'A coffee maker gurgling.',
    len: 1.5,
    level: 0.45,
    make(d) {
      for (let i = 0; i < 26; i++) {
        const f = d.rng.range(220, 650);
        d.add(d.tone(0.04, (t) => f * (1 + 0.8 * t), { env: bell }), d.rng.range(0, 1.3), d.rng.range(-0.3, 0.3), d.rng.range(0.15, 0.4));
      }
      d.add(d.noise(1.4, { hp: 2500, env: bell }), 0, 0, 0.1);
    },
  },

  // ------------------------------------------------ games & luck
  scratch: {
    about: 'Scratching a lottery card with a coin.',
    len: 1,
    level: 0.45,
    make(d) {
      let t = 0;
      while (t < 0.85) {
        const len = d.rng.range(0.07, 0.12);
        d.add(d.grains(len, () => 6000, { bp: [d.rng.range(3500, 5000), 0.8], amp: bell, dec: 0.0005 }), t, d.rng.range(-0.2, 0.2), 0.8);
        t += len + d.rng.range(0.02, 0.05);
      }
    },
  },
  win: {
    about: 'A small win: bright arpeggio and sparkles.',
    len: 1.8,
    level: 0.6,
    make(d) {
      d.song({ bpm: 168, bars: 1, tracks: [{ inst: 'glock', notes: 'C6:1/4 E6 G6 C7:1! r:2.25', rev: 0.4 }, { inst: 'marimba', notes: 'C5+E5+G5:1 r:3', rev: 0.3 }] });
      for (let i = 0; i < 10; i++) d.add(d.tone(0.25, () => d.rng.range(3000, 8000), { dec: 0.05 }), 0.3 + d.rng.range(0, 0.6), d.rng.range(-0.8, 0.8), 0.12);
    },
  },
  sparkle: {
    about: 'Good news: three rising chimes.',
    len: 1.2,
    level: 0.45,
    make(d) {
      [0, 0.07, 0.14].forEach((t, i) => d.add(d.inst('glock', [88, 91, 96][i], 0.3, 0.7), t, -0.3 + i * 0.3, 1));
    },
  },
  bonk: {
    about: 'Bad news: a cartoon "bonk" and a low "womp".',
    len: 0.7,
    level: 0.45,
    make(d) {
      d.add(d.hit(0.15, 600, [[1, 0.8, 0.05], [2.3, 0.4, 0.03]], { click: 0.5, clickFc: 1500 }), 0);
      d.add(d.tone(0.4, (t) => 220 - 90 * t, { wave: 'saw', lp: 700, env: swell(0.1) }), 0.05, 0, 0.6);
    },
  },
  cheer: {
    about: 'A small crowd cheering "jee!" and clapping.',
    len: 1.9,
    level: 0.55,
    make(d) {
      for (let i = 0; i < 8; i++) {
        const p = d.rng.range(170, 330);
        const len = d.rng.range(0.45, 0.8);
        d.add(d.voice({ dur: len, pitch: (t) => p * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.4))), vowel: () => (d.rng.chance(0.5) ? 'e' : 'e>a'), breath: 0.3, shift: p > 220 ? 1.18 : 1, attack: 0.04, release: 0.2 }), d.rng.range(0, 0.15), d.rng.range(-0.8, 0.8), 0.45);
      }
      claps(d, 0.3, 8, 1.4);
      d.room(0.6, 0.35);
    },
  },
  mic: {
    about: 'Karaoke mic: tap-tap and a little feedback squeal.',
    len: 1.2,
    level: 0.45,
    make(d) {
      thump(d, 0, 120, 0.8, 0.12);
      thump(d, 0.22, 120, 0.8, 0.12);
      d.add(d.tone(0.55, (t) => 2350 * (1 + 0.004 * Math.sin(TAU * 30 * t)), { env: (t) => Math.pow(Math.sin(Math.PI * t), 2) }), 0.45, 0, 0.12);
      d.room(0.5, 0.35);
    },
  },
  clatter: {
    about: 'Mölkky: the throwing pin hits the wooden pins, which clatter down.',
    len: 1.4,
    level: 0.55,
    make(d) {
      const wood = (_f?: number): [number, number, number][] => [[1, 1, 0.08], [2.42, 0.5, 0.05], [3.9, 0.25, 0.03]];
      d.add(d.hit(0.3, 700, wood(700), { click: 0.6, clickFc: 2500 }), 0, 0, 1);
      let t = 0.06;
      let gap = 0.12;
      for (let i = 0; i < 9; i++) {
        const f = d.rng.range(450, 1100);
        d.add(d.hit(0.25, f, wood(f), { click: 0.3 }), t, d.rng.range(-0.6, 0.6), 0.7 * (1 - i / 11));
        t += gap * d.rng.range(0.6, 1.2);
        gap *= 0.85;
      }
      thump(d, 0.3, 90, 0.3, 0.2);
      d.room(0.3, 0.15);
    },
  },

  // ------------------------------------------------ nature, sauna, beach
  steam: {
    about: 'Löyly: water thrown on hot sauna stones.',
    len: 2.4,
    level: 0.6,
    make(d) {
      d.add(d.noise(0.08, { lp: 300, dec: 0.02 }), 0, 0, 0.6);
      d.add(d.noise(2.2, { hp: 1800, env: (t) => Math.min(1, t / 0.008) * Math.exp(-t * 3.2) }), 0.02, 0, 0.9);
      d.add(d.grains(1.4, (t) => 900 * (1 - t), { bp: [3500, 1], dec: 0.001 }), 0.04, 0, 0.6);
      d.room(0.5, 0.3);
    },
  },
  splash: {
    about: 'Jumping into the lake: splash and bubbles.',
    len: 1.6,
    level: 0.6,
    make(d) {
      d.add(d.noise(0.6, { bp: [700, 0.7], env: (t) => Math.min(1, t / 0.01) * Math.exp(-t * 6) }), 0, 0, 1);
      d.add(d.noise(0.4, { hp: 2000, dec: 0.08 }), 0.01, 0, 0.4);
      for (let i = 0; i < 22; i++) {
        const f = d.rng.range(350, 1300);
        d.add(d.tone(0.035, (t) => f * (1 + 0.6 * t), { env: bell }), 0.08 + Math.pow(d.rng.next(), 1.5) * 0.9, d.rng.range(-0.5, 0.5), d.rng.range(0.1, 0.3));
      }
      for (let i = 0; i < 6; i++) d.add(d.tone(0.03, (t) => 1800 + 1500 * t, { env: bell }), 0.6 + d.rng.range(0, 0.8), d.rng.range(-0.8, 0.8), 0.08);
    },
  },
  fireplace: {
    about: 'Wood crackling in a fireplace.',
    len: 1.6,
    level: 0.4,
    make(d) {
      d.add(d.noise(1.5, { lp: 200, env: bell }), 0, 0, 0.8);
      d.add(d.grains(1.5, () => 25, { bp: [2500, 1], dec: 0.003, amp: bell }), 0, 0, 1.2);
    },
  },

  // ------------------------------------------------ study & office
  page: {
    about: 'A page being turned.',
    len: 0.5,
    level: 0.4,
    variants: 2,
    make(d) {
      d.add(d.noise(0.42, { bp: [1500, 1.2], sweep: (t) => 1200 + 3500 * t, env: (t) => Math.sin(Math.PI * t) * (0.6 + 0.4 * d.rng.next()) }));
      d.add(d.noise(0.05, { lp: 600, dec: 0.01 }), 0.38, 0, 0.5);
    },
  },
  scribble: {
    about: 'Pencil writing.',
    len: 0.9,
    level: 0.4,
    make(d) {
      const rate = d.rng.range(9, 12);
      d.add(d.noise(0.85, { bp: [3600, 1.5], env: (t) => Math.pow(Math.sin(Math.PI * t * 0.85 * rate), 2) * bell(t) }));
    },
  },
  typing: {
    about: 'A burst of keyboard typing.',
    len: 1.1,
    level: 0.4,
    make(d) {
      let t = 0;
      while (t < 0.95) {
        d.add(d.noise(0.02, { bp: [d.rng.range(2500, 4500), 2], dec: 0.004 }), t, d.rng.range(-0.3, 0.3), d.rng.range(0.5, 1));
        d.add(d.noise(0.02, { lp: 300, dec: 0.004 }), t, 0, 0.4);
        t += d.rng.chance(0.1) ? 0.22 : d.rng.range(0.06, 0.14);
      }
    },
  },
  chalk: {
    about: 'Chalk on a blackboard: taps and strokes.',
    len: 1.1,
    level: 0.4,
    make(d) {
      let t = 0;
      for (let i = 0; i < 5; i++) {
        d.add(d.noise(0.015, { bp: [2600, 2], dec: 0.003 }), t, 0, 0.8);
        const len = d.rng.range(0.08, 0.16);
        d.add(d.grains(len, () => 3000, { bp: [3800, 2], amp: bell, dec: 0.0006 }), t + 0.01, 0, 0.6);
        t += len + d.rng.range(0.04, 0.1);
      }
    },
  },
  rip: {
    about: 'Paper torn in half (quitting a job).',
    len: 0.7,
    level: 0.5,
    make(d) {
      d.add(d.grains(0.55, (t) => 2500 + 4000 * t, { bp: [2400, 0.7], amp: (t) => (0.4 + 0.6 * t) * (t > 0.97 ? 0 : 1), dec: 0.0015 }));
    },
  },

  // ------------------------------------------------ work
  hammer: {
    about: 'Hammering nails.',
    len: 1.2,
    level: 0.55,
    variants: 2,
    make(d) {
      for (let i = 0; i < 3; i++) {
        const at = i * d.rng.range(0.3, 0.38);
        d.add(d.noise(0.01, { bp: [3000, 1], dec: 0.002 }), at, 0, 0.6);
        d.add(d.hit(0.3, d.rng.range(2700, 2900) * (1 + i * 0.03), [[1, 0.5, 0.12], [1.83, 0.3, 0.07]], { click: 0.3 }), at, 0, 0.6);
        thump(d, at, 170, 0.6, 0.1);
      }
      d.room(0.4, 0.2);
    },
  },
  saw: {
    about: 'Sawing a plank.',
    len: 1.3,
    level: 0.5,
    make(d) {
      for (let i = 0; i < 3; i++) {
        const push = i % 2 === 0;
        const b = d.buf(0.36);
        const f = new SVF(d.sr, push ? 2100 : 2700, 2);
        let ph = 0;
        for (let k = 0; k < b.length; k++) {
          const t = k / b.length;
          ph += (push ? 95 : 120) / d.sr;
          const teeth = 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(TAU * ph), 4);
          f.process(d.rng.noise() * teeth);
          b[k] = f.bp * Math.sin(Math.PI * t) * 2;
        }
        d.add(b, i * 0.38, 0, 1);
      }
    },
  },
  chop: {
    about: 'An axe splitting firewood.',
    len: 0.9,
    level: 0.6,
    variants: 3,
    make(d) {
      d.add(d.noise(0.02, { lp: 2500, dec: 0.004 }), 0, 0, 1);
      d.add(d.hit(0.3, d.rng.range(330, 420), [[1, 1, 0.09], [2.3, 0.5, 0.06], [4.3, 0.3, 0.03]], { click: 0.6 }), 0, 0, 0.8);
      if (d.rng.chance(0.7)) d.add(d.grains(0.15, (t) => 2000 * (1 - t), { bp: [1800, 1], dec: 0.001 }), 0.02, 0, 0.6);
      thump(d, 0.25, 100, 0.4, 0.15);
      d.room(0.3, 0.15);
    },
  },
  heartbeat: {
    about: 'A heartbeat through a stethoscope.',
    len: 1.8,
    level: 0.6,
    make(d) {
      for (let i = 0; i < 2; i++) {
        const at = i * 0.85;
        d.add(d.tone(0.15, (t) => 70 - 25 * t, { dec: 0.04, lp: 200 }), at, 0, 1);
        d.add(d.tone(0.12, (t) => 80 - 25 * t, { dec: 0.03, lp: 200 }), at + 0.18, 0, 0.7);
      }
    },
  },
  ouch: {
    about: 'A vaccination: glove snap and a small "au!".',
    len: 0.7,
    level: 0.5,
    make(d) {
      d.add(d.noise(0.02, { bp: [2000, 1.5], dec: 0.004 }), 0, 0, 0.6);
      d.add(d.voice({ dur: 0.32, pitch: (t) => 260 * (1 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.3))), vowel: () => 'a>u', breath: 0.15, shift: 1.1, attack: 0.01, release: 0.1 }), 0.22, 0, 1);
    },
  },
  yawn: {
    about: 'A big, contented yawn.',
    len: 1.6,
    level: 0.5,
    make(d) {
      d.add(d.voice({ dur: 1.45, pitch: (t) => (t < 0.3 ? 210 + 60 * (t / 0.3) : 270 - 150 * ((t - 0.3) / 0.7)), vowel: (t) => (t < 0.15 ? 'ö>a' : t < 0.7 ? 'a' : 'a>o>u'), breath: 0.6, buzz: 0.3, attack: 0.15, release: 0.35, shift: 1.05 }));
    },
  },
  rustle: {
    about: 'Trying on clothes: fabric rustle.',
    len: 0.9,
    level: 0.4,
    make(d) {
      for (let i = 0; i < 2; i++) {
        const len = d.rng.range(0.3, 0.4);
        d.add(d.grains(len, (t) => 1800 * Math.sin(Math.PI * t), { bp: [d.rng.range(1600, 2600), 0.5], dec: 0.004 }), i * 0.4, d.rng.range(-0.3, 0.3), 1);
      }
    },
  },
  dance: {
    about: 'Dance steps on the wooden floor of the pavilion.',
    len: 1.6,
    level: 0.5,
    make(d) {
      [0, 0.25, 0.5, 0.875, 1.0, 1.25].forEach((t, i) => {
        d.add(d.hit(0.1, 900, [[1, 0.6, 0.03], [2.1, 0.3, 0.02]], { click: 0.4, clickFc: 1500 }), t, i % 2 ? 0.2 : -0.2, 0.6);
        d.add(d.noise(0.09, { bp: [2200, 1], env: bell }), t + 0.02, i % 2 ? 0.2 : -0.2, 0.25);
      });
      d.room(0.6, 0.3);
    },
  },

  // ------------------------------------------------ gadgets
  bikebell: {
    about: 'A bicycle bell: ring-ring!',
    len: 1.4,
    level: 0.5,
    make(d) {
      for (const at of [0, 0.07, 0.26, 0.33]) d.add(d.hit(1, 3300, [[1, 1, 0.6], [1.003, 0.8, 0.6], [1.59, 0.4, 0.35], [2.31, 0.2, 0.2]], { click: 0.3, clickFc: 5000 }), at, 0.1, 0.8);
    },
  },
  tv_on: {
    about: 'A CRT television switching on.',
    len: 1.1,
    level: 0.4,
    make(d) {
      d.add(d.hit(0.08, 1500, [[1, 0.5, 0.02]], { click: 0.8 }), 0);
      d.add(d.noise(0.5, { lp: 250, env: (t) => Math.exp(-t * 4) * (0.6 + 0.4 * Math.sin(TAU * 25 * t)) }), 0.03, 0, 0.8);
      d.add(d.tone(1, () => 11500, { env: swell(0.3) }), 0.05, 0, 0.03);
      d.add(d.noise(0.6, { hp: 3000, env: (t) => Math.sin(Math.PI * t) }), 0.4, 0, 0.12);
    },
  },
  boot: {
    about: 'A computer starting up with a friendly chime.',
    len: 3.2,
    level: 0.5,
    make(d) {
      d.add(d.hit(0.08, 1500, [[1, 0.5, 0.02]], { click: 0.8 }), 0);
      d.add(d.noise(2, { bp: [350, 0.8], env: swell(0.3) }), 0, 0, 0.15);
      d.song({ bpm: 120, bars: 1, reverb: { size: 0.8 }, tracks: [{ inst: 'epiano', notes: 'C4+G4+D5+E5:4', roll: 0.035, rev: 0.6, opts: { bark: 0.6 } }, { inst: 'pad', notes: 'C3+G3+E4:4', rev: 0.6, vol: 0.6 }] }, 0.35, 0.8);
    },
  },
  fridge: {
    about: 'A fridge door and the compressor humming on.',
    len: 1.4,
    level: 0.4,
    make(d) {
      d.add(d.noise(0.12, { lp: 500, env: bell }), 0, 0, 0.8);
      d.add(d.tone(1.1, () => 100, { harm: 0.6, env: swell(0.6), lp: 400 }), 0.2, 0, 0.4);
    },
  },

  // ------------------------------------------------ travel
  train: {
    about: 'Two-tone train horn, then the train pulls away.',
    len: 3.4,
    level: 0.55,
    make(d) {
      const horn = (f: number) => d.tone(1, (t) => f * (1 - 0.01 * t), { wave: 'saw', lp: 1700, env: (t) => Math.min(1, t / 0.08) * Math.min(1, (1 - t) / 0.15) });
      d.add(horn(349), 0, -0.2, 0.25);
      d.add(horn(440), 0, 0.2, 0.22);
      let t = 1.2;
      let gap = 0.45;
      while (t < 3.2) {
        d.add(d.noise(0.12, { lp: 600, dec: 0.04 }), t, 0, 0.6 * (1 - (t - 1.2) / 2.5));
        d.add(d.noise(0.04, { bp: [500, 3], dec: 0.01 }), t + gap / 2, 0, 0.5 * (1 - (t - 1.2) / 2.5));
        t += gap;
        gap = Math.max(0.2, gap * 0.9);
      }
      d.room(0.85, 0.5);
    },
  },

  // ------------------------------------------------ music stings
  accordion_run: {
    about: 'A quick accordion flourish (dance pavilion).',
    len: 2.6,
    level: 0.6,
    make(d) {
      d.song({
        bpm: 132,
        bars: 1,
        tracks: [
          { inst: 'accordion', notes: 'E4:1/4 F4 G#4 A4 B4 C5 D5 E5 A4+C5+E5:2!', rev: 0.3, humanize: 2 },
          { inst: 'bass', notes: 'r:2 A2:2', vol: 0.8 },
        ],
      });
    },
  },
  harp_gliss: {
    about: 'A dreamy harp glissando (resting).',
    len: 3,
    level: 0.5,
    make(d) {
      d.song({ bpm: 100, bars: 1, reverb: { size: 0.85 }, tracks: [{ inst: 'harp', notes: 'C4:1/8 D4 E4 G4 A4 C5 D5 E5 G5 A5 C6 D6 E6 G6 A6 C7 r:2', rev: 0.6 }] });
    },
  },
  church_bell: {
    about: 'The village church bell (a new week begins).',
    len: 5,
    level: 0.6,
    make(d) {
      const strike = (at: number) => d.add(d.inst('bell', 50, 0.1, 0.9, { t60: 4 }), at, 0, 1);
      strike(0);
      strike(1.7);
      d.room(0.9, 0.55, 0.6);
    },
  },
  turn: {
    about: 'A friendly "your turn" motif.',
    len: 2,
    level: 0.5,
    make(d) {
      d.song({ bpm: 140, bars: 1, reverb: { size: 0.6 }, tracks: [
        { inst: 'kantele', notes: 'D5:1/2 G5 B5 D6:2 r:1/2', rev: 0.4 },
        { inst: 'glock', notes: 'r:1.5 D6:1/2 r:2', rev: 0.4, vol: 0.5 },
        { inst: 'pad', notes: 'G3+B3+D4:3 r:1', vol: 0.5, rev: 0.5 },
      ] });
    },
  },
  hired: {
    about: 'Hired! A short bright fanfare.',
    len: 3.8,
    level: 0.7,
    make(d) {
      d.song({ bpm: 150, bars: 2, reverb: { size: 0.6 }, tracks: [
        { inst: 'brass', notes: 'G4:1/3 G4 G4 C5:1 G4:1/2 C5 E5:1 | G5:3! r:1', rev: 0.3 },
        { inst: 'brass', notes: 'E4:1/3 E4 E4 G4:1 E4:1/2 G4 C5:1 | E5:3 r:1', rev: 0.3, vol: 0.6, pan: -0.3 },
        { inst: 'glock', notes: 'r:4 | C7:2 r:2', vol: 0.6, rev: 0.4 },
        { inst: 'tuba', notes: 'C3:1 r:1 G2:1 r:1 | C2:3 r:1', vol: 0.8 },
        { inst: 'snare', notes: 'r:3 C4:1/4 C4 C4 C4 | C4:1! r:3', vol: 0.4 },
        { inst: 'crash', notes: 'r:4 | r:1 C4:1 r:2', vol: 0.5 },
      ] });
    },
  },
  rejected: {
    about: 'Rejected: sad trombone, wah-wah-wah-waaah.',
    len: 4.6,
    level: 0.6,
    make(d) {
      d.song({ bpm: 120, bars: 2, reverb: { size: 0.5 }, tracks: [
        { inst: 'brass', notes: 'G3:1 F#3:1 F3:1 E3:1 | _:3 r:1', rev: 0.25, gate: 0.85, opts: { bright: 0.6, vibrato: 3, scoop: 60 } },
      ] });
    },
  },
  graduate: {
    about: 'Graduation: a proud little fanfare with bells.',
    len: 5.2,
    level: 0.7,
    make(d) {
      d.song({ bpm: 112, bars: 2, reverb: { size: 0.75 }, tracks: [
        { inst: 'brass', notes: 'G4:1/2 C5:1/2 E5:1 D5:1/2 C5:1/2 D5:1 | E5:1/2 G5:1/2 C6:2! r:1', rev: 0.35 },
        { inst: 'strings', chords: 'C:2 G/B:2 | C:3 r:1', style: 'pad', range: 'G3-E5', rev: 0.4, vol: 0.7 },
        { inst: 'tuba', notes: 'C3:2 B2:2 | C3:3 r:1', vol: 0.7 },
        { inst: 'bell', notes: 'r:4 | C5:1 r:3', vol: 0.6, rev: 0.6 },
        { inst: 'tom', notes: 'r:3 G2:1/4 G2 G2 G2 | C2:1 r:3', vol: 0.4 },
      ] });
    },
  },
  gameover: {
    about: 'The end of the game: a celebratory finale.',
    len: 8.5,
    level: 0.75,
    make(d) {
      d.song({ bpm: 100, sections: { A: 3 }, reverb: { size: 0.8 }, tracks: [
        { inst: 'kantele', notes: 'C5:1/2 E5 G5 C6 B5 G5 E5 G5 | A5:1/2 F5 C5 F5 G5:1/2 D5 B4 D5 | C5+E5+G5+C6:4', rev: 0.4 },
        { inst: 'brass', notes: 'r:4 | r:2 G4:1/2 A4 B4 D5 | E5:4!', rev: 0.35 },
        { inst: 'strings', chords: 'C:4 | F:2 G:2 | C:4', style: 'pad', range: 'G3-E5', vol: 0.7, rev: 0.4 },
        { inst: 'bass', chords: 'C:4 | F:2 G:2 | C:4', style: 'root', vol: 0.8 },
        { inst: 'glock', notes: 'r:4 | r:4 | C7:1 r:3', vol: 0.5, rev: 0.5 },
        { inst: 'crash', notes: 'r:4 | r:4 | C4:1 r:3', vol: 0.5 },
        { inst: 'tom', notes: 'r:4 | r:3 G2:1/4 G2 G2 G2 | C2:1 r:3', vol: 0.4 },
      ] });
    },
  },
};

export interface RenderedSfx {
  left: Float32Array;
  right: Float32Array;
  sr: number;
  peak: number;
}

/** Renders one variant of a sound effect (peak-normalized to its level, trimmed). */
export function renderSfx(name: string, variant = 0, sr = SAMPLE_RATE): RenderedSfx {
  const def = SFX[name];
  if (!def) throw new Error(`Unknown sound effect '${name}'`);
  const d = new Desk(sr, def.len, new Rng(hashSeed(name) + variant * 7919));
  def.make(d);
  let { L, R } = d;
  // trim the silent end, fade the last few ms
  let end = L.length;
  while (end > 1 && Math.abs(L[end - 1]) < 1e-4 && Math.abs(R[end - 1]) < 1e-4) end--;
  L = L.slice(0, end);
  R = R.slice(0, end);
  const fade = Math.min(end, Math.round(0.01 * sr));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    L[end - 1 - i] *= g;
    R[end - 1 - i] *= g;
  }
  const p = peakOf(L, R);
  if (p > 1e-6) {
    const g = (0.85 * (def.level ?? 0.5)) / p;
    for (let i = 0; i < end; i++) {
      L[i] *= g;
      R[i] *= g;
    }
  }
  return { left: L, right: R, sr, peak: peakOf(L, R) };
}

export const sfxVariants = (name: string) => SFX[name]?.variants ?? 1;
