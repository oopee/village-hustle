/**
 * The theme's audio.json: which song plays where, which sound effect plays for which game
 * moment, and how each host's voice sounds. Everything is optional; a missing file = silence.
 * See docs/AUDIO-GUIDE.md for the full key reference.
 */
import type { VoiceDef } from './synth/voice';

/** A sound to play: an effect name ("coins"), a file ("sounds/x.ogg"), or several in a row. */
export type SfxRef = string | SfxRef[] | { play: SfxRef[]; gap?: number };

/** A song: an id in audio/songs/ or a prerecorded file. */
export type SongRef = string | { file: string };

export interface AudioConfig {
  music?: {
    title?: SongRef;
    /** Plays on the village map (while walking). */
    map?: SongRef;
    /** One song per location id. */
    locations?: Record<string, SongRef>;
    gameover?: SongRef;
  };
  /** Game moment key → sound. See `actionKeys` for the lookup order. */
  sfx?: Record<string, SfxRef>;
  /** Host babble voices per location id. */
  voices?: Record<string, VoiceDef>;
  /** Default volumes 0..1. */
  volume?: { music?: number; sfx?: number; voice?: number };
}

export const DEFAULT_VOLUME = { music: 0.55, sfx: 0.8, voice: 0.6 };

/** Seconds between the parts of a sequence (["kaching", "bag"]) unless the ref says otherwise. */
export const DEFAULT_GAP = 0.25;

export interface ActionInfo {
  loc: string;
  action: string;
  /** The chosen option (item / job / course id), if any. */
  option?: string;
  /** The item category of that option (food, clothing, ...). */
  category?: string;
  /** What kind of action it was (shop, work, transfer, jobs, courses, ...). */
  kind?: string;
  /** How it went: hired, rejected, graduate, enroll, lesson, good, bad. */
  outcome?: string;
}

/** Keys tried for an action, most specific first. */
export function actionKeys(a: ActionInfo): string[] {
  const keys: string[] = [];
  const add = (k: string | false | undefined) => k && keys.push(k);
  const o = a.outcome;
  add(o && `action.${a.loc}.${a.action}.${o}`);
  add(`action.${a.loc}.${a.action}`);
  add(a.option && o && `item.${a.option}.${o}`);
  add(a.option && `item.${a.option}`);
  add(a.category && `category.${a.category}`);
  add(a.kind && o && `kind.${a.kind}.${o}`);
  add(a.kind && `kind.${a.kind}`);
  return keys;
}

/** The first configured sound for an action (null = keep quiet). */
export function resolveAction(cfg: AudioConfig, a: ActionInfo): SfxRef | null {
  for (const k of actionKeys(a)) {
    const v = cfg.sfx?.[k];
    if (v !== undefined) return v === '' ? null : v;
  }
  return null;
}

/** Flattens a ref into timed effects/files. */
export function scheduleOf(ref: SfxRef, at = 0, gap = DEFAULT_GAP): { name: string; at: number }[] {
  if (typeof ref === 'string') return ref ? [{ name: ref, at }] : [];
  const list = Array.isArray(ref) ? ref : ref.play;
  const g = Array.isArray(ref) ? gap : (ref.gap ?? gap);
  return list.flatMap((r, i) => scheduleOf(r, at + i * g, gap));
}

export const isFile = (name: string) => name.includes('.');
export const songRefId = (r: SongRef) => (typeof r === 'string' ? r : r.file);

/** Problems in a config, for the validator and `npm run audio`. */
export function checkAudioConfig(cfg: AudioConfig, songs: Set<string>, sfx: Set<string>): string[] {
  const out: string[] = [];
  const song = (where: string, r: SongRef | undefined) => {
    if (r == null) return;
    if (typeof r === 'object') {
      if (!r.file) out.push(`${where}: song file is empty`);
    } else if (!songs.has(r)) out.push(`${where}: unknown song '${r}'`);
  };
  const m = cfg.music ?? {};
  song('music.title', m.title);
  song('music.map', m.map);
  song('music.gameover', m.gameover);
  for (const [loc, r] of Object.entries(m.locations ?? {})) song(`music.locations.${loc}`, r);
  for (const [key, ref] of Object.entries(cfg.sfx ?? {})) {
    if (!/^(ui|walk|enter|action|item|category|kind|turn|week|game|msg)\./.test(key)) out.push(`sfx.${key}: unknown key type`);
    for (const { name } of scheduleOf(ref)) if (!isFile(name) && !sfx.has(name)) out.push(`sfx.${key}: unknown sound effect '${name}'`);
  }
  for (const [who, v] of Object.entries(cfg.voices ?? {})) {
    if (!(v.pitch > 40 && v.pitch < 600)) out.push(`voices.${who}: pitch ${v.pitch} Hz looks wrong`);
  }
  for (const [k, v] of Object.entries(cfg.volume ?? {})) if (typeof v !== 'number' || v < 0 || v > 1) out.push(`volume.${k}: should be 0..1`);
  return out;
}
