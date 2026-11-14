/**
 * Formant voice synthesis: a glottal buzz (plus breath noise) through three vowel formant
 * filters. Used for the hosts' wordless "babble" (one short blip per typed letter, coloured
 * by the letter's vowel, so Finnish names and words get their own melody) and for
 * voice-like sound effects ("mm!", "aah", a yawn, a cheering crowd).
 */
import { Biquad, Osc, Rng, SVF, hashSeed } from './dsp';

/** Formant frequencies (F1, F2, F3) for Finnish vowels, plus a hummed "m". */
export const FORMANTS: Record<string, [number, number, number]> = {
  a: [730, 1150, 2500],
  e: [480, 1850, 2500],
  i: [290, 2250, 3000],
  o: [500, 850, 2450],
  u: [320, 760, 2300],
  y: [280, 1650, 2150],
  ä: [680, 1650, 2450],
  ö: [430, 1450, 2350],
  m: [260, 1100, 2300],
};
export const VOWELS = ['a', 'e', 'i', 'o', 'u', 'y', 'ä', 'ö'];

export interface FormantOpts {
  dur: number;
  /** Pitch in Hz over normalized time t (0..1). */
  pitch: (t: number) => number;
  /** Formants over t: a vowel letter or explicit [F1, F2, F3]. */
  vowel: (t: number) => string | [number, number, number];
  /** 0..1 breathiness. */
  breath?: number;
  /** Formant scale (1 adult male-ish, ~1.15 female, ~1.3 child). */
  shift?: number;
  /** 0 soft (sine-like) .. 1 buzzy. */
  buzz?: number;
  attack?: number;
  release?: number;
  /** Amplitude shape over t (multiplied with attack/release). */
  amp?: (t: number) => number;
  vibrato?: number;
  /** Vibrato rate (default 5.5 Hz). */
  vibratoHz?: number;
}

const lerp3 = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** Resolves a vowel spec; "a>o" style strings morph between two vowels over the sound. */
function formantsAt(v: string | [number, number, number], t: number): [number, number, number] {
  if (Array.isArray(v)) return v;
  if (v.includes('>')) {
    const parts = v.split('>');
    const x = t * (parts.length - 1);
    const i = Math.min(parts.length - 2, Math.floor(x));
    return lerp3(FORMANTS[parts[i]] ?? FORMANTS.a, FORMANTS[parts[i + 1]] ?? FORMANTS.a, x - i);
  }
  return FORMANTS[v] ?? FORMANTS.a;
}

export function formantVoice(sr: number, rng: Rng, o: FormantOpts): Float32Array {
  const n = Math.max(1, Math.round(o.dur * sr));
  const out = new Float32Array(n);
  const osc = new Osc(rng.next());
  const soft = new SVF(sr, 1200, 0.6);
  const f = [new SVF(sr, 700, 6), new SVF(sr, 1200, 8), new SVF(sr, 2500, 10)];
  const shift = o.shift ?? 1;
  const breath = o.breath ?? 0.15;
  const buzz = o.buzz ?? 0.6;
  const att = Math.max(1, (o.attack ?? 0.02) * sr);
  const rel = Math.max(1, (o.release ?? 0.05) * sr);
  const vib = o.vibrato ?? 0;
  const vibHz = o.vibratoHz ?? 5.5;
  const nasal = Biquad.lp(sr, 420, 0.7);
  let amps: [number, number, number] = [1, 0.5, 0.25];
  for (let k = 0; k < n; k++) {
    const t = k / n;
    if ((k & 31) === 0) {
      const v = o.vowel(t);
      const fm = formantsAt(v, t);
      for (let i = 0; i < 3; i++) {
        const fc = fm[i] * shift;
        f[i].set(fc, fc / [90, 120, 170][i]);
      }
      amps = v === 'm' ? [1, 0.06, 0.02] : [1, 0.55, 0.28];
    }
    const p = o.pitch(t) * (1 + vib * 0.012 * Math.sin(2 * Math.PI * vibHz * (k / sr)));
    let src = osc.saw(p / sr);
    src = soft.process(src) * (1 - buzz) + src * buzz;
    src += rng.noise() * breath * 1.5;
    let v = 0;
    for (let i = 0; i < 3; i++) {
      f[i].process(src);
      v += f[i].bp * amps[i];
    }
    if (amps[1] < 0.1) v = nasal.process(v) * 1.6;
    const env = Math.min(1, k / att, (n - k) / rel) * (o.amp ? o.amp(t) : 1);
    out[k] = v * env * 0.5;
  }
  return out;
}

// ---------------------------------------------------------------- host babble

export interface VoiceDef {
  /** Base pitch in Hz (men ~90-140, women ~180-260). */
  pitch: number;
  /** Random pitch spread in semitones (intonation). */
  vary?: number;
  /** Formant scale: >1 smaller/brighter voice. */
  shift?: number;
  breath?: number;
  /** 0 soft .. 1 buzzy. */
  buzz?: number;
  /** Blip length multiplier. */
  len?: number;
  /** Loudness multiplier. */
  volume?: number;
  /** Pitch slide within each syllable in semitones: negative = flat, weary; positive = chirpy, eager. Default about -1.2. */
  glide?: number;
  /** Wobble: 0 none .. 3 shaky old voice. */
  vibrato?: number;
  /** Pause between syllables, as a multiplier: >1 slow and deliberate, <1 a fast talker. */
  gap?: number;
}

export type Onset = '' | 'p' | 's';

/** Which onset a consonant gets: plosives click, sibilants hiss, the rest are voiced. */
export function onsetOf(ch: string): Onset {
  const c = ch.toLowerCase();
  if ('ptkbdg'.includes(c)) return 'p';
  if ('szfšh'.includes(c)) return 's';
  return '';
}

/** The vowel a typed letter "sounds like": itself, or the next vowel in the word. */
export function vowelFor(text: string, i: number): string {
  for (let j = i; j < text.length; j++) {
    const c = text[j].toLowerCase();
    if (VOWELS.includes(c)) return c;
    if (c === 'å') return 'o';
    if (!/[a-zåäöšž']/.test(c)) break;
  }
  for (let j = i - 1; j >= 0; j--) {
    const c = text[j].toLowerCase();
    if (VOWELS.includes(c)) return c;
    if (!/[a-zåäöšž']/.test(c)) break;
  }
  return 'a';
}

/** One babble syllable (~60-80 ms). `variant` picks a deterministic intonation. */
export function renderBlip(v: VoiceDef, vowel: string, variant: number, sr: number, onset: Onset = ''): Float32Array {
  const rng = new Rng(hashSeed(`${v.pitch}:${v.shift ?? 1}:${v.glide ?? ''}:${vowel}:${variant}:${onset}`));
  const vary = v.vary ?? 3;
  const semis = ((variant % 5) / 4 - 0.5) * vary + rng.range(-0.3, 0.3);
  const p0 = v.pitch * Math.pow(2, semis / 12);
  const dur = 0.068 * (v.len ?? 1);
  const glide = v.glide;
  const voiced = formantVoice(sr, rng, {
    dur,
    pitch: glide === undefined ? (t) => p0 * (1.03 - 0.07 * t) : (t) => p0 * Math.pow(2, (glide * (t - 0.4)) / 12),
    // Fast enough to be heard within one short syllable.
    vibrato: (v.vibrato ?? 0) * 1.5,
    vibratoHz: 16,
    vowel: () => vowel,
    breath: v.breath ?? 0.08,
    shift: v.shift ?? 1,
    buzz: v.buzz ?? 0.55,
    attack: 0.008,
    release: 0.03,
  });
  const pre = onset === 'p' ? 0.012 : onset === 's' ? 0.035 : 0;
  const n0 = Math.round(pre * sr);
  const out = new Float32Array(n0 + voiced.length);
  if (onset) {
    const f = onset === 'p' ? Biquad.bp(sr, 1800, 0.8) : Biquad.hp(sr, 4500, 0.7);
    for (let k = 0; k < n0; k++) {
      const e = onset === 'p' ? Math.exp(-k / (0.003 * sr)) : Math.sin((Math.PI * k) / n0);
      out[k] = f.process(rng.noise()) * e * (onset === 'p' ? 0.5 : 0.18);
    }
  }
  out.set(voiced, n0);
  // normalize the blip so all voices sit at a similar level
  let peak = 1e-9;
  for (const x of out) peak = Math.max(peak, Math.abs(x));
  const g = (0.55 * (v.volume ?? 1)) / peak;
  for (let k = 0; k < out.length; k++) out[k] *= g;
  return out;
}

/** Every blip a voice needs: vowels × onsets × intonation variants. */
export const BLIP_VARIANTS = 4;
export function blipKey(vowel: string, onset: Onset, variant: number) {
  return `${vowel}${onset}${variant}`;
}
export function renderVoiceSet(v: VoiceDef, sr: number): Record<string, Float32Array> {
  const out: Record<string, Float32Array> = {};
  for (const vw of VOWELS) for (const on of ['', 'p', 's'] as Onset[]) for (let i = 0; i < BLIP_VARIANTS; i++) out[blipKey(vw, on, i)] = renderBlip(v, vw, i, sr, on);
  return out;
}
