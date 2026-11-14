/**
 * npm run audio [filter] [--twice]
 *
 * Renders every song (and sound effect / voice) of the theme to WAV files in audio-preview/
 * and prints levels, loop-seam continuity and any warnings from the song linter. Use it while
 * composing: edit a song JSON, run `npm run audio mysong`, listen to audio-preview/mysong.wav.
 *
 *   --twice   write loops twice in a row, so you can listen to the loop point
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gainToDb, seamRatio } from '../audio/synth/dsp';
import { renderSong } from '../audio/synth/render';
import type { SongDef } from '../audio/synth/song';
import { SFX, renderSfx } from '../audio/synth/sfx';
import { renderBlip, VOWELS } from '../audio/synth/voice';
import { checkAudioConfig, type AudioConfig } from '../audio/config';

const THEME = resolve(import.meta.dirname, '../../public/themes/ryttyla');
const OUT = resolve(import.meta.dirname, '../../audio-preview');
const args = process.argv.slice(2);
const twice = args.includes('--twice');
const filter = args.find((a) => !a.startsWith('--'));

export function wav(left: Float32Array, right: Float32Array, sr: number): Buffer {
  const n = left.length;
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  return b;
}

const db = (x: number) => `${gainToDb(x).toFixed(1).padStart(6)} dB`;

mkdirSync(OUT, { recursive: true });
let problems = 0;

// ---------------------------------------------------------------- songs
const songDir = join(THEME, 'audio/songs');
const songs = existsSync(songDir) ? readdirSync(songDir).filter((f) => f.endsWith('.json')) : [];
for (const f of songs) {
  const id = f.replace(/\.json$/, '');
  if (filter && !id.includes(filter)) continue;
  const def = JSON.parse(readFileSync(join(songDir, f), 'utf8')) as SongDef;
  def.id ??= id;
  const t0 = performance.now();
  const r = renderSong(def);
  const ms = performance.now() - t0;
  let L = r.left;
  let R = r.right;
  if (twice && r.loop) {
    L = new Float32Array(r.left.length * 2);
    R = new Float32Array(r.right.length * 2);
    L.set(r.left);
    L.set(r.left, r.left.length);
    R.set(r.right);
    R.set(r.right, r.right.length);
  }
  writeFileSync(join(OUT, `${id}.wav`), wav(L, R, r.sr));
  const seam = r.loop ? Math.max(seamRatio(r.left), seamRatio(r.right)) : 0;
  console.log(
    `${id.padEnd(16)} ${r.seconds.toFixed(1).padStart(5)} s  peak ${db(r.peak)}  rms ${db(r.rms)}  ${r.loop ? `seam ${seam.toFixed(1).padStart(4)}` : 'one-shot '}  ${ms.toFixed(0).padStart(5)} ms`,
  );
  for (const w of r.warnings) console.log(`   ! ${w}`);
  if (r.loop && seam > 3) console.log('   ! loop seam looks like a jump');
  problems += r.warnings.length;
}

// ---------------------------------------------------------------- sound effects
if (!filter || filter === 'sfx' || Object.keys(SFX).some((k) => k.includes(filter))) {
  mkdirSync(join(OUT, 'sfx'), { recursive: true });
  const names = Object.keys(SFX).filter((k) => !filter || filter === 'sfx' || k.includes(filter));
  const t0 = performance.now();
  for (const name of names) {
    const r = renderSfx(name, 0);
    writeFileSync(join(OUT, 'sfx', `${name}.wav`), wav(r.left, r.right, r.sr));
    if (r.peak > 0.95 || r.peak < 0.05) {
      console.log(`   ! sfx ${name}: peak ${db(r.peak)}`);
      problems++;
    }
  }
  console.log(`${names.length} sound effects rendered in ${(performance.now() - t0).toFixed(0)} ms -> audio-preview/sfx/`);
}

// ---------------------------------------------------------------- voices
const cfgFile = join(THEME, 'audio.json');
if (existsSync(cfgFile)) {
  const cfg = JSON.parse(readFileSync(cfgFile, 'utf8')) as AudioConfig;
  const known = new Set(songs.map((f) => f.replace(/\.json$/, '')));
  for (const p of checkAudioConfig(cfg, known, new Set(Object.keys(SFX)))) {
    console.log(`   ! audio.json: ${p}`);
    problems++;
  }
  if (!filter || filter === 'voices') {
    mkdirSync(join(OUT, 'voices'), { recursive: true });
    for (const [who, v] of Object.entries(cfg.voices ?? {})) {
      // a short "sentence" of blips, so the voice can be judged in context
      const sr = 44100;
      const parts: Float32Array[] = [];
      'hyvää päivää, mitä saisi olla'.split('').forEach((ch, i) => {
        if (i % 2) return;
        const lower = ch.toLowerCase();
        if (!/[a-zåäö ,]/.test(lower)) return;
        if (lower === ' ' || lower === ',') {
          parts.push(new Float32Array(Math.round(sr * (lower === ',' ? 0.18 : 0.06))));
          return;
        }
        const vowel = VOWELS.includes(lower) ? lower : VOWELS[i % VOWELS.length];
        parts.push(renderBlip(v, vowel, i, sr));
        parts.push(new Float32Array(Math.round(sr * 0.012)));
      });
      const len = parts.reduce((s, p) => s + p.length, 0);
      const out = new Float32Array(len);
      let o = 0;
      for (const p of parts) {
        out.set(p, o);
        o += p.length;
      }
      writeFileSync(join(OUT, 'voices', `${who}.wav`), wav(out, out, sr));
    }
  }
}

console.log(problems ? `\n${problems} warning(s).` : '\nAll clean.');
