import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actionKeys, checkAudioConfig, resolveAction, scheduleOf, type AudioConfig } from '../src/audio/config';
import { seamRatio } from '../src/audio/synth/dsp';
import { renderSong } from '../src/audio/synth/render';
import { renderSfx, SFX } from '../src/audio/synth/sfx';
import { compileSong, parseChord, parsePitch, type SongDef } from '../src/audio/synth/song';
import { renderBlip, vowelFor } from '../src/audio/synth/voice';
import { loadNodeContent } from '../src/tools/node-content';

const THEME = resolve(import.meta.dirname, '../public/themes/ryttyla');
const SONGS = join(THEME, 'audio/songs');
const songIds = existsSync(SONGS) ? readdirSync(SONGS).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : [];
const readSong = (id: string) => ({ ...(JSON.parse(readFileSync(join(SONGS, `${id}.json`), 'utf8')) as SongDef), id });

const finite = (a: Float32Array) => a.every((x) => Number.isFinite(x));
const seam = (a: Float32Array) => seamRatio(a);

describe('song notation', () => {
  it('parses pitches and chords', () => {
    expect(parsePitch('C4')).toBe(60);
    expect(parsePitch('F#5')).toBe(78);
    expect(parsePitch('Bb3')).toBe(58);
    expect(parseChord('Am7')?.intervals).toEqual([0, 3, 7, 10]);
    expect(parseChord('C/E')?.bass).toBe(4);
  });

  it('compiles notes with sticky durations, ties, chords and repeats', () => {
    const c = compileSong({ bpm: 120, bars: 2, tracks: [{ inst: 'kantele', notes: '[C4:1/2 D4]*2 E4:1 _ | G4+B4+D5:4' }] });
    expect(c.warnings).toEqual([]);
    const ev = c.tracks[0].events;
    expect(ev.map((e) => e.midi)).toEqual([60, 62, 60, 62, 64, 67, 71, 74]);
    expect(ev[4].dur).toBeCloseTo(2 * 0.95, 5); // E4 tied over two beats
    expect(c.beats).toBe(8);
  });

  it('warns about a bar of the wrong length, unknown instruments and out-of-range notes', () => {
    const c = compileSong({ bpm: 100, bars: 1, tracks: [{ inst: 'kantele', notes: 'C4:1 D4 | E4:4' }, { inst: 'banjo', notes: 'C4:4' }, { inst: 'glock', notes: 'C2:4' }] });
    expect(c.warnings.some((w) => w.includes('bar 1'))).toBe(true);
    expect(c.warnings.some((w) => w.includes('banjo'))).toBe(true);
    expect(c.warnings.some((w) => w.includes('outside'))).toBe(true);
  });

  it('realizes chord styles and repeats short parts to fill a section', () => {
    const c = compileSong({ bpm: 120, meter: 3, sections: { A: 4 }, tracks: [{ inst: 'bass', chords: 'Am | E7', style: 'waltzbass' }, { inst: 'brush', steps: 'x.x.x.' }] });
    expect(c.warnings).toEqual([]);
    expect(c.tracks[0].events.length).toBe(4);
    expect(c.tracks[1].events.length).toBe(24); // 1.5-beat pattern × 8 to fill 12 beats
  });

  it('bass styles play the root of a chord that changes mid-bar', () => {
    const c = compileSong({ bpm: 120, bars: 1, tracks: [{ inst: 'bass', chords: 'C:2 G:2', style: 'root' }] });
    expect(c.warnings).toEqual([]);
    expect(c.tracks[0].events.map((e) => e.midi % 12)).toEqual([0, 7]);
  });

  it('root-and-fifth bass stays in its low register', () => {
    const c = compileSong({ bpm: 120, bars: 16, tracks: [{ inst: 'bass', chords: '[C | F | G | C]*4', style: 'rootfifth' }] });
    const roots = c.tracks[0].events.filter((_, i) => i % 2 === 0).map((e) => e.midi);
    expect(Math.max(...roots) - Math.min(...roots)).toBeLessThanOrEqual(7);
    expect(roots.slice(-4)).toEqual(roots.slice(0, 4));
  });

  it('warns when a chord part ends with a short bar', () => {
    const c = compileSong({ bpm: 120, bars: 2, tracks: [{ inst: 'bass', chords: 'Am7:2 D7:2 | Gm7', style: 'root' }] });
    expect(c.warnings.some((w) => w.includes('last bar'))).toBe(true);
  });

  it('measures loop seams without mistaking a note attack for a click', () => {
    const n = 44100;
    const attack = new Float32Array(n);
    // a pluck (a decaying noise burst) that starts right on the loop point
    for (let i = 0, x = 1; i < 2000; i++) attack[i] = (((x = (x * 16807) % 2147483647) / 2147483647) * 2 - 1) * Math.exp(-i / 400);
    expect(seamRatio(attack)).toBeLessThan(3);
    // a smooth signal whose end doesn't meet its start: a real click
    const step = new Float32Array(n);
    for (let i = 0; i < n; i++) step[i] = 0.3 * (1 - i / n) + 0.05 * Math.sin(i * 0.01);
    expect(seamRatio(step)).toBeGreaterThan(8);
  });
});

describe('rendering', () => {
  it('renders a looping song with ambience that loops without a click', () => {
    const r = renderSong({
      id: 'test',
      bpm: 120,
      meter: 3,
      bars: 4,
      ambience: [{ type: 'birds' }, { type: 'waves' }],
      tracks: [
        { inst: 'kantele', notes: 'A4:1 C5 E5 | D5:2 C5:1 | B4:1 G#4 B4 | A4:3' },
        { inst: 'accordion', chords: 'Am | Dm | E7 | Am', style: 'waltz' },
        { inst: 'bass', chords: 'Am | Dm | E7 | Am', style: 'waltzbass' },
      ],
    });
    expect(r.loop).toBe(true);
    expect(r.left.length).toBe(Math.round(6 * 44100));
    expect(finite(r.left) && finite(r.right)).toBe(true);
    expect(r.peak).toBeLessThanOrEqual(0.9);
    expect(r.rms).toBeGreaterThan(0.01);
    expect(seam(r.left)).toBeLessThan(8);
    expect(seam(r.right)).toBeLessThan(8);
  });

  it('is deterministic', () => {
    const def: SongDef = { id: 'det', bpm: 140, bars: 1, tracks: [{ inst: 'marimba', notes: 'C5:1 E5 G5 C6' }, { kit: { kick: 'x...', hat: '..x.' } } as never] };
    const a = renderSong(def);
    const b = renderSong(def);
    expect(a.left).toEqual(b.left);
  });

  it('renders every sound effect cleanly', () => {
    for (const name of Object.keys(SFX)) {
      for (let v = 0; v < (SFX[name].variants ?? 1); v++) {
        const r = renderSfx(name, v);
        expect(finite(r.left) && finite(r.right), name).toBe(true);
        expect(r.peak, name).toBeLessThanOrEqual(0.95);
        expect(r.peak, name).toBeGreaterThan(0.05);
        expect(r.left.length, name).toBeGreaterThan(100);
      }
    }
  }, 60_000);

  it('babble blips are short, finite and follow the text', () => {
    const b = renderBlip({ pitch: 200 }, 'a', 0, 44100, 'p');
    expect(finite(b)).toBe(true);
    expect(b.length / 44100).toBeLessThan(0.15);
    expect(vowelFor('Ryttylä', 0)).toBe('y');
    expect(vowelFor('kiitos', 0)).toBe('i');
  });
});

describe('shipped audio', () => {
  it('every song compiles without warnings and has a sensible length', () => {
    for (const id of songIds) {
      const c = compileSong(readSong(id));
      expect(c.warnings, id).toEqual([]);
      const seconds = c.beats * c.spb;
      expect(seconds, id).toBeGreaterThan(20);
      expect(seconds, id).toBeLessThan(120);
    }
  });

  it('every song renders as a clean loop', () => {
    for (const id of songIds) {
      const r = renderSong(readSong(id));
      expect(r.loop, id).toBe(true);
      expect(finite(r.left) && finite(r.right), id).toBe(true);
      expect(r.peak, id).toBeLessThanOrEqual(0.95);
      expect(Math.max(seam(r.left), seam(r.right)), id).toBeLessThan(3);
    }
  }, 180_000);

  it('audio.json is valid and covers every location', async () => {
    const cfg = JSON.parse(readFileSync(join(THEME, 'audio.json'), 'utf8')) as AudioConfig;
    expect(checkAudioConfig(cfg, new Set(songIds), new Set(Object.keys(SFX)))).toEqual([]);
    const content = await loadNodeContent();
    for (const loc of content.locations) {
      expect(cfg.music?.locations?.[loc.id], `music for ${loc.id}`).toBeTruthy();
      if (loc.host) expect(cfg.voices?.[loc.id], `voice for ${loc.id}`).toBeTruthy();
      for (const a of loc.actions) {
        const items = (a as { items?: string[] }).items ?? [undefined];
        for (const option of items) {
          const ref = resolveAction(cfg, { loc: loc.id, action: a.id, option, kind: a.kind, category: option ? content.itemById.get(option)?.category : undefined });
          if (a.kind !== 'courses' && a.kind !== 'jobs') expect(ref, `sound for ${loc.id}.${a.id}${option ? `.${option}` : ''}`).toBeTruthy();
        }
      }
    }
  });
});

describe('audio config', () => {
  it('tries keys from the most to the least specific', () => {
    expect(actionKeys({ loc: 'grill', action: 'food', option: 'grill_meal', category: 'food', kind: 'shop', outcome: 'good' })).toEqual([
      'action.grill.food.good',
      'action.grill.food',
      'item.grill_meal.good',
      'item.grill_meal',
      'category.food',
      'kind.shop.good',
      'kind.shop',
    ]);
    const cfg: AudioConfig = { sfx: { 'kind.shop': 'kaching', 'item.grill_meal': 'eat', 'action.grill.food.bad': '' } };
    expect(resolveAction(cfg, { loc: 'grill', action: 'food', option: 'grill_meal', kind: 'shop' })).toBe('eat');
    expect(resolveAction(cfg, { loc: 'grill', action: 'food', option: 'x', kind: 'shop' })).toBe('kaching');
    expect(resolveAction(cfg, { loc: 'grill', action: 'food', option: 'grill_meal', kind: 'shop', outcome: 'bad' })).toBeNull();
  });

  it('schedules sequences', () => {
    expect(scheduleOf(['a', 'b'])).toEqual([{ name: 'a', at: 0 }, { name: 'b', at: 0.25 }]);
    expect(scheduleOf({ play: ['a', 'b', 'c'], gap: 1 }, 0.5)).toEqual([{ name: 'a', at: 0.5 }, { name: 'b', at: 1.5 }, { name: 'c', at: 2.5 }]);
  });

  it('reports unknown songs and effects', () => {
    const p = checkAudioConfig({ music: { map: 'nope' }, sfx: { 'ui.click': 'nope', 'bogus.key': 'click' } }, new Set(), new Set(['click']));
    expect(p.length).toBe(3);
  });
});
