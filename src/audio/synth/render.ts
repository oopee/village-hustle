/**
 * Renders a compiled song to stereo PCM: instruments → per-track chorus/pan/filters →
 * reverb and delay sends → ambience → (loop fold) → master colour → loudness → limiter.
 *
 * Loops are seamless: everything is rendered once with a tail, and the tail (reverb, ringing
 * notes, echoes) is folded back onto the start, which is exactly what you would hear on the
 * second time round. Modulations use whole cycles per loop.
 */
import { Biquad, DelayLine, dbToGain, hashSeed, limit, mtof, OnePole, peakOf, Reverb, Rng, rmsOf, sin01, softClip } from './dsp';
import { INSTRUMENTS } from './instruments';
import { renderAmbience } from './ambience';
import { compileSong, type SongDef } from './song';

/** Dry music level (RMS) at which ambience plays at its designed level. */
const AMB_REF = 0.065;

export const SAMPLE_RATE = 44100;

export interface Rendered {
  left: Float32Array;
  right: Float32Array;
  sr: number;
  /** True if the buffer is a seamless loop. */
  loop: boolean;
  seconds: number;
  peak: number;
  rms: number;
  warnings: string[];
}

export interface RenderOptions {
  sr?: number;
  seed?: number;
  /** Skip the loudness normalization and limiter (analysis). */
  raw?: boolean;
}

/** Constant-power pan gains (√2-compensated so centre = unity). */
function panGains(p: number): [number, number] {
  const x = Math.max(-1, Math.min(1, p));
  return [Math.cos(((x + 1) * Math.PI) / 4) * Math.SQRT2, Math.sin(((x + 1) * Math.PI) / 4) * Math.SQRT2];
}

/** LFO increment per sample giving whole cycles over `period` samples (or plain hz when 0). */
function lfoDt(hz: number, sr: number, period: number): number {
  if (!period) return hz / sr;
  return Math.max(1, Math.round((hz * period) / sr)) / period;
}

export function renderSong(song: SongDef, opts: RenderOptions = {}): Rendered {
  const sr = opts.sr ?? SAMPLE_RATE;
  const c = compileSong(song);
  const warnings = [...c.warnings];
  const loop = song.loop ?? true;
  const seed = (opts.seed ?? 0) ^ hashSeed(song.id ?? song.title ?? 'song');
  const spb = c.spb;
  const body = Math.max(1, Math.round(c.beats * spb * sr));
  // The tail must outlast every ringing note and the reverb, or the loop fold would cut them.
  const ringing = Math.max(0, ...c.tracks.map((t) => INSTRUMENTS[t.inst]?.tail ?? 0));
  const tailS = Math.min(10, Math.max(song.master?.tail ?? (loop ? 4 : 2.5), ringing + 0.5));
  const total = body + Math.round(tailS * sr);
  const period = loop ? body : 0;

  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const revIn = new Float32Array(total);
  const dlyL = new Float32Array(total);
  const dlyR = new Float32Array(total);

  // ------------------------------------------------ tracks
  for (const tr of c.tracks) {
    const inst = INSTRUMENTS[tr.inst];
    if (!inst || !tr.events.length) continue;
    const def = tr.def;
    const rng = new Rng(seed ^ hashSeed(tr.name));
    const human = (def.humanize ?? (inst.kind === 'drum' ? 2.5 : 5)) / 1000;
    const roll = def.roll ?? (def.style === 'strum' ? 0.014 : 0);
    const o = { ...inst.defaults, ...def.opts };
    const mono = new Float32Array(total);
    for (const e of tr.events) {
      let start = Math.round((e.t * spb + (rng.next() - 0.5) * 2 * human + e.ord * roll) * sr);
      if (e.t === 0 && e.ord === 0 && !loop) start = Math.max(0, start);
      if (start < 0) {
        if (!loop) continue;
        start += body;
      }
      const vel = Math.max(0.05, Math.min(1, e.vel + (rng.next() - 0.5) * 0.08));
      inst.render(mono, { start, len: Math.max(1, Math.round(e.dur * spb * sr)), midi: e.midi, freq: mtof(e.midi), vel }, { sr, rng, o });
    }
    if (def.hp) {
      const f = Biquad.hp(sr, def.hp, 0.707);
      for (let i = 0; i < total; i++) mono[i] = f.process(mono[i]);
    }
    if (def.lp) {
      const f = Biquad.lp(sr, def.lp, 0.707);
      for (let i = 0; i < total; i++) mono[i] = f.process(mono[i]);
    }
    const vol = def.vol ?? 1;
    const [gl, gr] = panGains(def.pan ?? 0);
    const rev = def.rev ?? 0.2;
    const dly = def.dly ?? 0;
    const ch = def.chorus ?? 0;
    if (ch > 0) {
      const dl = new DelayLine(0.04 * sr);
      const dt = lfoDt(0.8, sr, period);
      const base = 0.014 * sr;
      const depth = 0.0035 * sr;
      for (let i = 0; i < total; i++) {
        const x = mono[i] * vol;
        dl.write(x);
        const ph = dt * i;
        const a = dl.read(base + depth * sin01(ph));
        const b = dl.read(base + depth * sin01(ph + 0.25));
        const l = x + ch * 0.7 * a;
        const r = x + ch * 0.7 * b;
        L[i] += l * gl * 0.8;
        R[i] += r * gr * 0.8;
        revIn[i] += (l + r) * 0.4 * rev;
        dlyL[i] += l * dly * 0.8;
        dlyR[i] += r * dly * 0.8;
      }
    } else {
      for (let i = 0; i < total; i++) {
        const x = mono[i] * vol;
        if (x === 0) continue;
        L[i] += x * gl;
        R[i] += x * gr;
        revIn[i] += x * rev;
        dlyL[i] += x * gl * dly;
        dlyR[i] += x * gr * dly;
      }
    }
  }

  // ------------------------------------------------ ambience (loops only; already circular)
  if (song.ambience?.length) {
    if (!loop) warnings.push('ambience is ignored on non-looping songs');
    else {
      // Ambience levels are relative to the music, which is normalized later: scale them by
      // how loud the dry music is, so "level: 1" sits the same under any song.
      let e = 0;
      for (let k = 0; k < total; k++) e += L[k] * L[k] + R[k] * R[k];
      const dry = Math.sqrt(e / (2 * Math.max(1, total)));
      const ambGain = dry > 1e-5 ? Math.min(4, Math.max(0.25, dry / AMB_REF)) : 1;
      song.ambience.forEach((a, i) => {
        try {
          const amb = renderAmbience(a, body, sr, spb, seed + 7919 * (i + 1));
          const rv = a.rev ?? 0.15;
          for (let k = 0; k < body; k++) {
            const l = amb.L[k] * ambGain;
            const r = amb.R[k] * ambGain;
            L[k] += l;
            R[k] += r;
            revIn[k] += (l + r) * 0.5 * rv;
          }
        } catch (e) {
          warnings.push(String((e as Error).message));
        }
      });
    }
  }

  // ------------------------------------------------ delay (ping-pong, damped feedback)
  const dcfg = song.delay;
  if (dcfg && (dcfg.wet ?? 1) > 0) {
    const time = Math.max(0.02, (dcfg.time ?? 0.75) * spb) * sr;
    const fb = Math.min(0.85, dcfg.feedback ?? 0.35);
    const wet = dcfg.wet ?? 1;
    const a = new DelayLine(time + 4);
    const b = new DelayLine(time + 4);
    const ta = new OnePole(sr, dcfg.tone ?? 3200);
    const tb = new OnePole(sr, dcfg.tone ?? 3200);
    const hpA = Biquad.hp(sr, 250);
    const hpB = Biquad.hp(sr, 250);
    for (let i = 0; i < total; i++) {
      const ra = a.read(time - 1);
      const rb = b.read(time - 1);
      a.write(hpA.process(dlyL[i]) + fb * tb.lp(rb));
      b.write(hpB.process(dlyR[i]) + fb * ta.lp(ra));
      L[i] += ra * wet;
      R[i] += rb * wet;
      revIn[i] += (ra + rb) * 0.15;
    }
  }

  // ------------------------------------------------ reverb
  const rcfg = song.reverb ?? {};
  const rwet = rcfg.wet ?? 1;
  if (rwet > 0) {
    const rev = new Reverb(sr, rcfg);
    for (let i = 0; i < total; i++) {
      rev.process(revIn[i]);
      L[i] += rev.outL * rwet;
      R[i] += rev.outR * rwet;
    }
  }

  // ------------------------------------------------ fold the tail into the loop
  let left: Float32Array;
  let right: Float32Array;
  if (loop) {
    for (let i = body; i < total; i++) {
      const j = i % body;
      L[j] += L[i];
      R[j] += R[i];
    }
    left = L.slice(0, body);
    right = R.slice(0, body);
  } else {
    // trim silence after the tail
    let end = total;
    const th = 1e-4;
    while (end > body && Math.abs(L[end - 1]) < th && Math.abs(R[end - 1]) < th) end--;
    left = L.slice(0, end);
    right = R.slice(0, end);
  }
  const n = left.length;

  // ------------------------------------------------ master colour
  const m = song.master ?? {};
  const eqs: (() => { process(x: number): number })[] = [];
  eqs.push(() => Biquad.hp(sr, 28, 0.707));
  if (m.warmth) eqs.push(() => Biquad.lowshelf(sr, 220, m.warmth!));
  if (m.air) eqs.push(() => Biquad.highshelf(sr, 7000, m.air!));
  const lofi = Math.max(0, Math.min(1, m.lofi ?? 0));
  if (lofi > 0) eqs.push(() => Biquad.lp(sr, 13000 - 8500 * lofi, 0.6));
  for (const make of eqs) {
    circularFilter(left, make, loop);
    circularFilter(right, make, loop);
  }
  if (m.width != null && m.width !== 1) {
    for (let i = 0; i < n; i++) {
      const mid = (left[i] + right[i]) * 0.5;
      const side = (left[i] - right[i]) * 0.5 * m.width;
      left[i] = mid + side;
      right[i] = mid - side;
    }
  }
  if (lofi > 0) wowFlutter(left, right, sr, lofi, loop);

  // ------------------------------------------------ loudness + limiter
  if (!opts.raw) {
    const target = dbToGain(m.loudness ?? -20);
    const meas = loudnessRms(left, right, sr);
    if (meas > 1e-6) {
      const g = Math.min(40, target / meas);
      for (let i = 0; i < n; i++) {
        left[i] *= g;
        right[i] *= g;
      }
    } else warnings.push('song renders silent');
    if (lofi > 0) {
      // gentle tape saturation, hiss and the odd vinyl tick (after the gain, so their level is fixed)
      const drive = 1 + lofi;
      const rng = new Rng(seed ^ 0xabc);
      const hissL = Biquad.hp(sr, 3000);
      const hissR = Biquad.hp(sr, 3000);
      const hiss = 0.006 * lofi;
      for (let i = 0; i < n; i++) {
        left[i] = (softClip(left[i] * drive) / drive) + hissL.process(rng.noise()) * hiss;
        right[i] = (softClip(right[i] * drive) / drive) + hissR.process(rng.noise()) * hiss;
      }
      const ticks = Math.round((n / sr) * 0.7 * lofi);
      for (let t = 0; t < ticks; t++) {
        const at = rng.int(0, n - 40);
        const a = rng.range(0.02, 0.06) * lofi;
        for (let k = 0; k < 30; k++) {
          const v = rng.noise() * a * Math.exp(-k / 6);
          left[at + k] += v;
          right[at + k] += v * 0.8;
        }
      }
    }
    limit(left, right, sr, 0.89, loop);
    if (!loop) {
      const f = Math.min(n, Math.round(0.03 * sr));
      for (let i = 0; i < f; i++) {
        const g = i / f;
        left[n - 1 - i] *= g;
        right[n - 1 - i] *= g;
      }
    }
  }

  let bad = false;
  for (let i = 0; i < n && !bad; i++) if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) bad = true;
  if (bad) {
    warnings.push('render produced NaN/Infinity (silenced)');
    left.fill(0);
    right.fill(0);
  }

  return { left, right, sr, loop, seconds: n / sr, peak: peakOf(left, right), rms: rmsOf(left, right), warnings };
}

/** Filters in place; loops are warmed up on their own end so the seam stays continuous. */
function circularFilter(buf: Float32Array, make: () => { process(x: number): number }, loop: boolean) {
  const f = make();
  if (loop) {
    const warm = Math.min(buf.length, 16384);
    for (let i = buf.length - warm; i < buf.length; i++) f.process(buf[i]);
  }
  for (let i = 0; i < buf.length; i++) buf[i] = f.process(buf[i]);
}

/** Tape wow (slow) and flutter (fast) pitch wobble via a modulated circular read. */
function wowFlutter(L: Float32Array, R: Float32Array, sr: number, amt: number, loop: boolean) {
  const n = L.length;
  const src = [L.slice(), R.slice()];
  const period = loop ? n : 0;
  const wow = lfoDt(0.45, sr, period);
  const flt = lfoDt(5.7, sr, period);
  const base = 0.004 * sr;
  const dWow = 0.0018 * sr * amt;
  const dFlt = 0.00012 * sr * amt;
  for (let i = 0; i < n; i++) {
    const d = base + dWow * sin01(wow * i) + dFlt * sin01(flt * i);
    let p = i - d;
    if (loop) p = ((p % n) + n) % n;
    else if (p < 0) p = 0;
    const j = Math.floor(p);
    const f = p - j;
    const j2 = loop ? (j + 1) % n : Math.min(n - 1, j + 1);
    L[i] = src[0][j] + (src[0][j2] - src[0][j]) * f;
    R[i] = src[1][j] + (src[1][j2] - src[1][j]) * f;
  }
}

/** A rough perceptual loudness: RMS after cutting the deep bass and lifting the presence range. */
export function loudnessRms(L: Float32Array, R: Float32Array, sr: number): number {
  const hp = Biquad.hp(sr, 120, 0.5);
  const sh = Biquad.highshelf(sr, 1500, 4);
  let s = 0;
  for (let i = 0; i < L.length; i++) {
    const x = sh.process(hp.process((L[i] + R[i]) * 0.5));
    s += x * x;
  }
  return Math.sqrt(s / Math.max(1, L.length));
}
