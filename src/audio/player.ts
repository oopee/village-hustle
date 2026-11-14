/**
 * Plays the game's audio in the browser: looping location music with crossfades, sound
 * effects and the hosts' babble voices. Everything is synthesized from recipes (songs are
 * JSON in the theme, effects are code) by a background worker, so there are no audio files
 * to ship; a theme may still point at prerecorded files instead.
 *
 * The UI only says *what happens* ("we are at the grill now", "the player bought food");
 * this class decides how that sounds via the theme's audio.json.
 */
import {
  DEFAULT_VOLUME,
  isFile,
  resolveAction,
  scheduleOf,
  songRefId,
  type ActionInfo,
  type AudioConfig,
  type SfxRef,
  type SongRef,
} from './config';
import type { RenderJob, RenderReply, RenderRequest } from './worker';
import { blipKey, BLIP_VARIANTS, onsetOf, vowelFor, VOWELS } from './synth/voice';
import type { SongDef } from './synth/song';

const STORE_KEY = 'village-hustle:audio';
const FADE = 1.1; // crossfade seconds
const MUSIC_DEBOUNCE = 300; // ms: don't start music for places only passed through
const SONG_CACHE = 4; // rendered songs kept in memory
const BLIP_GAP = 0.07; // seconds between babble syllables

export interface Volumes {
  music: number;
  sfx: number;
  voice: number;
  muted: boolean;
}

type Bus = 'music' | 'sfx' | 'voice';

interface Job {
  msg: RenderJob;
  prio: number;
  resolve: (r: RenderReply) => void;
}

/** A tiny queue in front of one worker: one job at a time, highest priority first. */
class RenderLane {
  private worker: Worker | null = null;
  private failed = false;
  private queue: Job[] = [];
  private busy = false;
  private seq = 0;
  private waiting = new Map<number, Job>();

  constructor(private name: string) {}

  private ensure(): Worker | null {
    if (this.worker || this.failed) return this.worker;
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: this.name });
      this.worker.onmessage = (e: MessageEvent<RenderReply>) => this.done(e.data);
      this.worker.onerror = (e) => {
        console.warn(`Audio worker failed (${e.message}); rendering on the main thread instead.`);
        this.worker?.terminate();
        this.worker = null;
        this.failed = true;
        const lost = [...this.waiting.values()];
        this.waiting.clear();
        this.busy = false;
        this.queue.unshift(...lost);
        this.pump();
      };
    } catch {
      this.failed = true;
    }
    return this.worker;
  }

  run(msg: RenderJob, prio = 0): Promise<RenderReply> {
    return new Promise((resolve) => {
      this.queue.push({ msg, prio, resolve });
      this.pump();
    });
  }

  /** Drops queued low-priority jobs (e.g. hover prefetches that are no longer interesting). */
  prune(keep: (msg: RenderJob, prio: number) => boolean) {
    const drop = this.queue.filter((j) => !keep(j.msg, j.prio));
    this.queue = this.queue.filter((j) => keep(j.msg, j.prio));
    for (const j of drop) j.resolve({ req: -1, kind: 'error', message: 'cancelled' });
  }

  private pump() {
    if (this.busy || !this.queue.length) return;
    let best = 0;
    for (let i = 1; i < this.queue.length; i++) if (this.queue[i].prio > this.queue[best].prio) best = i;
    const job = this.queue.splice(best, 1)[0];
    this.busy = true;
    const req = ++this.seq;
    this.waiting.set(req, job);
    const w = this.ensure();
    const msg = { ...job.msg, req } as RenderRequest;
    if (w) w.postMessage(msg);
    else
      void import('./worker').then(({ handle }) => {
        // let the page breathe between main-thread renders
        setTimeout(() => this.done(handle(msg).reply), 0);
      });
  }

  private done(r: RenderReply) {
    const job = this.waiting.get(r.req);
    if (!job) return;
    this.waiting.delete(r.req);
    this.busy = false;
    job.resolve(r);
    this.pump();
  }
}

interface Playing {
  key: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  duration: number;
}

export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses = {} as Record<Bus, GainNode>;
  private duck!: GainNode;
  private vol: Volumes;

  private songLane = new RenderLane('audio-songs');
  private fxLane = new RenderLane('audio-fx');
  private songs = new Map<string, Promise<AudioBuffer | null>>();
  private defs = new Map<string, Promise<SongDef | null>>();
  private fx = new Map<string, Promise<AudioBuffer | null>>();
  private voices = new Map<string, Promise<Record<string, AudioBuffer> | null>>();
  private variants: Promise<Record<string, number>> | null = null;

  private want: string | null = null;
  private wantTimer = 0;
  private current: Playing | null = null;
  private offsets = new Map<string, number>();
  private nextBlip = 0;
  private lastFx = new Map<string, number>();

  constructor(
    private cfg: AudioConfig,
    private base: string,
  ) {
    let saved: Partial<Volumes> = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Volumes>;
    } catch {
      /* private mode etc. */
    }
    const d = { ...DEFAULT_VOLUME, ...cfg.volume };
    this.vol = { music: saved.music ?? d.music, sfx: saved.sfx ?? d.sfx, voice: saved.voice ?? d.voice, muted: saved.muted ?? false };

    // Browsers only allow sound after the player has interacted with the page.
    const unlock = () => {
      this.unlock();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    // Warm the caches before the first click: title and map songs, then every configured effect.
    if (this.enabled) {
      for (const w of ['title', 'map']) {
        const ref = this.songFor(w);
        if (ref) void this.songBuffer(ref, 5);
      }
      this.variants = this.fxLane.run({ kind: 'meta' }).then((r) => (r.kind === 'meta' ? r.variants : {}));
      void this.warmEffects();
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  /** Loads the theme's audio.json; returns a silent player if there is none. */
  static async load(base: string): Promise<AudioPlayer> {
    let cfg: AudioConfig = {};
    try {
      const res = await fetch(`${base}audio.json`);
      if (res.ok) cfg = (await res.json()) as AudioConfig;
    } catch {
      /* no audio for this theme */
    }
    return new AudioPlayer(cfg, base);
  }

  get enabled() {
    return !!(this.cfg.music || this.cfg.sfx || this.cfg.voices);
  }

  // ---------------------------------------------------------------- setup

  private unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      // gentle safety limiter so stacked effects never clip
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -6;
      comp.knee.value = 6;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      this.master.connect(comp).connect(ctx.destination);
      this.duck = ctx.createGain();
      this.duck.connect(this.master);
      for (const b of ['music', 'sfx', 'voice'] as Bus[]) {
        this.buses[b] = ctx.createGain();
        this.buses[b].connect(b === 'music' ? this.duck : this.master);
      }
      this.applyVolumes(true);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().then(() => this.applyMusic());
    else this.applyMusic();
  }

  private async warmEffects() {
    const names = new Set<string>();
    for (const ref of Object.values(this.cfg.sfx ?? {})) for (const { name } of scheduleOf(ref)) names.add(name);
    const variants = (await this.variants) ?? {};
    for (const n of names) {
      if (isFile(n)) void this.fxBuffer(n, 0, -10);
      else for (let v = 0; v < (variants[n] ?? 1); v++) void this.fxBuffer(n, v, -10);
    }
  }

  // ---------------------------------------------------------------- volume

  volumes(): Volumes {
    return { ...this.vol };
  }

  setVolumes(v: Partial<Volumes>) {
    Object.assign(this.vol, v);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.vol));
    } catch {
      /* ignore */
    }
    this.applyVolumes(false);
  }

  toggleMute() {
    this.setVolumes({ muted: !this.vol.muted });
    return this.vol.muted;
  }

  private applyVolumes(now: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => (now ? (g.gain.value = v) : g.gain.setTargetAtTime(v, t, 0.05));
    // perceptual curve: slider 0..1 → gain
    const curve = (x: number) => x * x;
    set(this.master, this.vol.muted ? 0 : 1);
    set(this.buses.music, curve(this.vol.music));
    set(this.buses.sfx, curve(this.vol.sfx));
    set(this.buses.voice, curve(this.vol.voice));
  }

  // ---------------------------------------------------------------- buffers

  private toBuffer(r: RenderReply): AudioBuffer | null {
    if (r.kind !== 'pcm') {
      if (r.kind === 'error' && r.message !== 'cancelled') console.warn(`Audio: ${r.message}`);
      return null;
    }
    const b = new AudioBuffer({ numberOfChannels: 2, length: Math.max(1, r.left.length), sampleRate: r.sr });
    b.copyToChannel(r.left as Float32Array<ArrayBuffer>, 0);
    b.copyToChannel(r.right as Float32Array<ArrayBuffer>, 1);
    return b;
  }

  private async decodeFile(path: string): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(`${this.base}audio/${path}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const ctx = this.ctx ?? new OfflineAudioContext(2, 1, 44100);
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      console.warn(`Audio file ${path} could not be loaded (${String(e)})`);
      return null;
    }
  }

  private songDef(id: string): Promise<SongDef | null> {
    let p = this.defs.get(id);
    if (!p) {
      p = fetch(`${this.base}audio/songs/${id}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<SongDef>) : null))
        .then((d) => (d ? { ...d, id } : null))
        .catch(() => null);
      this.defs.set(id, p);
    }
    return p;
  }

  /** A rendered song; `prio` > 0 for songs needed now, < 0 for guesses. */
  private songBuffer(ref: SongRef, prio: number): Promise<AudioBuffer | null> {
    const key = songRefId(ref);
    let p = this.songs.get(key);
    if (p) {
      // refresh LRU position
      this.songs.delete(key);
      this.songs.set(key, p);
      return p;
    }
    p =
      typeof ref === 'object'
        ? this.decodeFile(ref.file)
        : this.songDef(ref).then(async (def) => {
            if (!def) {
              console.warn(`Audio: song '${ref}' not found`);
              return null;
            }
            return this.toBuffer(await this.songLane.run({ kind: 'song', def }, prio));
          });
    // forget failed/cancelled renders so they can be retried
    void p.then((b) => {
      if (!b && this.songs.get(key) === p) this.songs.delete(key);
    });
    this.songs.set(key, p);
    while (this.songs.size > SONG_CACHE) {
      const oldest = [...this.songs.keys()].find((k) => k !== this.current?.key && k !== key);
      if (!oldest) break;
      this.songs.delete(oldest);
    }
    return p;
  }

  private fxBuffer(name: string, variant: number, prio = 5): Promise<AudioBuffer | null> {
    const key = `${name}#${variant}`;
    let p = this.fx.get(key);
    if (!p) {
      p = isFile(name) ? this.decodeFile(name) : this.fxLane.run({ kind: 'sfx', name, variant }, prio).then((r) => this.toBuffer(r));
      this.fx.set(key, p);
    }
    return p;
  }

  // ---------------------------------------------------------------- music

  private songFor(where: string): SongRef | undefined {
    const m = this.cfg.music;
    if (!m) return undefined;
    if (where === 'title') return m.title ?? m.map;
    if (where === 'map') return m.map;
    if (where === 'gameover') return m.gameover ?? m.title;
    return m.locations?.[where] ?? m.map;
  }

  /** Sets the music context: 'title', 'map', 'gameover', a location id, or null for silence. */
  music(where: string | null) {
    const ref = where ? this.songFor(where) : undefined;
    const key = ref ? songRefId(ref) : null;
    if (key === this.want) return;
    this.want = key;
    clearTimeout(this.wantTimer);
    this.wantTimer = window.setTimeout(() => this.applyMusic(), this.current ? MUSIC_DEBOUNCE : 0);
  }

  /** Starts rendering a place's song in the background (hovering over it, walking there). */
  prefetch(where: string) {
    const ref = this.songFor(where);
    if (!ref) return;
    const key = songRefId(ref);
    // only the latest guesses matter
    this.songLane.prune((msg, prio) => prio >= 0 || (msg.kind === 'song' && msg.def.id === key));
    void this.songBuffer(ref, -1);
  }

  private applyMusic() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const key = this.want;
    if (key === (this.current?.key ?? null)) return;
    if (!key) {
      this.stopCurrent();
      return;
    }
    const ref = this.findRef(key);
    if (!ref) return;
    void this.songBuffer(ref, 10).then((buf) => {
      if (!buf || this.want !== key || this.current?.key === key || !this.ctx) return;
      this.stopCurrent();
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      const t = ctx.currentTime + 0.02;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + FADE);
      src.connect(gain).connect(this.buses.music);
      const offset = (this.offsets.get(key) ?? 0) % buf.duration;
      src.start(t, offset);
      this.current = { key, src, gain, startedAt: t - offset, duration: buf.duration };
    });
  }

  private findRef(key: string): SongRef | undefined {
    const m = this.cfg.music ?? {};
    const all = [m.title, m.map, m.gameover, ...Object.values(m.locations ?? {})];
    return all.find((r) => r && songRefId(r) === key);
  }

  private stopCurrent() {
    const c = this.current;
    if (!c || !this.ctx) return;
    this.current = null;
    const t = this.ctx.currentTime;
    // remember where we were, so coming back continues the tune instead of restarting it
    this.offsets.set(c.key, (t - c.startedAt) % c.duration);
    c.gain.gain.cancelScheduledValues(t);
    c.gain.gain.setValueAtTime(c.gain.gain.value, t);
    c.gain.gain.linearRampToValueAtTime(0, t + FADE);
    c.src.stop(t + FADE + 0.05);
  }

  // ---------------------------------------------------------------- effects

  /** Plays the effect configured for a game moment key (e.g. "enter.grill", "ui.click"). */
  cue(key: string, delay = 0) {
    const ref = this.cfg.sfx?.[key];
    if (ref) this.play(ref, delay);
  }

  /** Plays the sound for an action, chosen by the most specific matching key. */
  action(a: ActionInfo, delay = 0) {
    const ref = resolveAction(this.cfg, a);
    if (ref) this.play(ref, delay);
  }

  /** Plays a sound reference: an effect name, a file, or a sequence. */
  play(ref: SfxRef, delay = 0) {
    if (!this.ctx || this.ctx.state !== 'running' || this.vol.muted) return;
    for (const { name, at } of scheduleOf(ref, delay)) void this.playOne(name, at);
  }

  private async playOne(name: string, at: number) {
    const ctx = this.ctx!;
    const want = ctx.currentTime + at;
    // don't stack the exact same sound on top of itself (fast clicking, fast AI turns)
    const last = this.lastFx.get(name) ?? -1;
    if (Math.abs(want - last) < 0.05) return;
    this.lastFx.set(name, want);
    const n = isFile(name) ? 1 : ((await this.variants) ?? {})[name] ?? 1;
    const buf = await this.fxBuffer(name, Math.floor(Math.random() * n));
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.05; // tiny pitch variation
    src.connect(this.buses.sfx);
    src.start(Math.max(ctx.currentTime, want));
  }

  // ---------------------------------------------------------------- voices

  private voiceSet(who: string): Promise<Record<string, AudioBuffer> | null> | null {
    const def = this.cfg.voices?.[who];
    if (!def) return null;
    let p = this.voices.get(who);
    if (!p) {
      p = this.fxLane.run({ kind: 'voice', def }, 8).then((r) => {
        if (r.kind !== 'voice') return null;
        const out: Record<string, AudioBuffer> = {};
        for (const [k, b] of Object.entries(r.blips)) {
          const ab = new AudioBuffer({ numberOfChannels: 1, length: b.length, sampleRate: r.sr });
          ab.copyToChannel(b as Float32Array<ArrayBuffer>, 0);
          out[k] = ab;
        }
        return out;
      });
      this.voices.set(who, p);
    }
    return p;
  }

  /** Get a host's voice ready (call when entering their place). */
  prepareVoice(who: string) {
    void this.voiceSet(who);
  }

  /**
   * The host's text advanced from `from` to `to` characters: babble one syllable for the
   * new letters (rate-limited), tinted by the letters' vowel. Music ducks a little meanwhile.
   */
  babble(who: string, text: string, from: number, to: number) {
    if (!this.ctx || this.ctx.state !== 'running' || this.vol.muted || to <= from) return;
    const set = this.voiceSet(who);
    if (!set) return;
    const now = this.ctx.currentTime;
    if (now < this.nextBlip) return;
    let i = from;
    while (i < to && !/[a-zåäöšž]/i.test(text[i])) i++;
    if (i >= to) return;
    this.nextBlip = now + BLIP_GAP * (this.cfg.voices?.[who]?.gap ?? 1);
    const vowel = vowelFor(text, i);
    const key = blipKey(VOWELS.includes(vowel) ? vowel : 'a', onsetOf(text[i]), (i * 7 + text.length) % BLIP_VARIANTS);
    void set.then((blips) => {
      const b = blips?.[key];
      if (!b || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.connect(this.buses.voice);
      src.start();
      const t = this.ctx.currentTime;
      const g = this.duck.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0.72, t, 0.04);
      g.setTargetAtTime(1, t + 0.25, 0.3);
    });
  }
}
