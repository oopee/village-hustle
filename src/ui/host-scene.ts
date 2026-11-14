/**
 * The inside of a location: interior art, the animated owner ("host"), any regulars hanging
 * around ("extras"), the player's own furniture when this is their home, clickable props,
 * and one cartoon speech bubble. One instance lives for the whole app and is re-attached to
 * the location panel on every render, so animations don't restart.
 *
 * Draw order: back image → furniture → host and extras → front image → front furniture and
 * front extras → bubble.
 *
 * Pure presentation: which line is said is decided by the App from content
 * (location.host.lines, location.pokes) and engine events; this class only shows it.
 */
import { h } from './dom';
import type { HostAnim, HostDef, PropDef, Theme } from './theme';

export type Mood = 'neutral' | 'happy' | 'annoyed';

const TYPE_CPS = 45; // typewriter speed, characters per second
const MOOD_MS = 1600;
/** How far (px) a bubble may extend above the picture, over the panel title bar. */
const RISE = 24;

interface Actor {
  /** 'host', or the extra's id. */
  id: string;
  def: HostDef;
  sheet: HTMLImageElement;
  flip: boolean;
  front: boolean;
  talkUntil: number;
  mood: Mood;
  moodUntil: number;
  /** Desynchronises idle animations. */
  phase: number;
}

/** Where the bubble's tail points: centre x and top y in interior pixels. */
interface Anchor {
  cx: number;
  top: number;
  actor: Actor | null;
}

export class HostScene {
  readonly el: HTMLElement;
  private back: HTMLImageElement;
  private front: HTMLImageElement;
  private under: HTMLCanvasElement;
  private stage: HTMLCanvasElement;
  private over: HTMLCanvasElement;
  private bubble: HTMLElement;
  private who: HTMLElement;
  private shown: HTMLElement;
  private rest: HTMLElement;
  private fallback: HTMLElement;

  private locId: string | null = null;
  private host: Actor | null = null;
  private hostName = '';
  private extras: Actor[] = [];
  private props: PropDef[] = [];
  private furnished = '';
  private anchor: Anchor | null = null;
  private voice: string | null = null;
  private text = '';
  private typed = 0;
  private sayStart = 0;
  private timer = 0;
  private lastKey = '';
  private placedW = -1;
  private hoverId: string | null = null;
  /** Called as the typewriter reveals letters (from, to) of the current line; drives the voice. */
  onType: (text: string, from: number, to: number, voice: string | null) => void = () => {};
  /** Called when a prop or an extra is clicked (its id). */
  onPoke: (id: string) => void = () => {};
  /** Which props / extras respond to clicks (others are not highlighted). */
  pokeable: (id: string) => boolean = () => false;

  constructor(private theme: Theme) {
    const [w, hh] = theme.interiorSize;
    const layer = (cls: string) => {
      const c = h('canvas', { class: cls });
      c.width = w;
      c.height = hh;
      c.getContext('2d')!.imageSmoothingEnabled = false;
      return c;
    };
    this.back = h('img', { class: 'back', alt: '', draggable: false });
    this.front = h('img', { class: 'front', alt: '', draggable: false });
    this.under = layer('under');
    this.stage = layer('stage');
    this.over = layer('over');
    this.who = h('b', { class: 'who' });
    this.shown = h('span');
    this.rest = h('span', { class: 'rest' });
    this.bubble = h('div', { class: 'speech hidden', onclick: () => this.finishTyping() }, this.who, h('span', { class: 'text' }, this.shown, this.rest));
    this.fallback = h('div', { class: 'no-art' });
    this.el = h(
      'div',
      { class: 'scene', style: { width: `${w}px`, height: `${hh}px` } },
      this.back,
      this.under,
      this.stage,
      this.front,
      this.over,
      this.fallback,
      this.bubble,
    );
    this.el.addEventListener('pointermove', (e) => this.pointer(e, false));
    this.el.addEventListener('pointerleave', () => this.setHover(null));
    this.el.addEventListener('click', (e) => this.pointer(e, true));
  }

  /** Switches to a location; clears the bubble. `owned` = item ids to show as furniture (the player's own home). */
  setLocation(locId: string | null, label: string, hostName: string, owned: string[] = []) {
    const t = this.theme;
    this.locId = locId;
    const interior = locId ? t.interiors.get(locId) : undefined;
    const front = locId ? t.interiorFronts.get(locId) : undefined;
    this.back.style.display = interior ? '' : 'none';
    if (interior) this.back.src = interior;
    this.front.style.display = front ? '' : 'none';
    if (front) this.front.src = front;
    this.fallback.style.display = interior ? 'none' : '';
    this.fallback.textContent = label;
    const actor = (id: string, def: HostDef, sheet: HTMLImageElement, flip = false, isFront = false, phase = 0): Actor => ({
      id,
      def,
      sheet,
      flip,
      front: isFront,
      talkUntil: 0,
      mood: 'neutral',
      moodUntil: 0,
      phase,
    });
    const host = locId ? t.hosts.get(locId) : undefined;
    this.host = host ? actor('host', host.def, host.sheet) : null;
    this.extras = (locId ? t.extras.get(locId) ?? [] : []).map((x, i) => actor(x.def.id, x.def, x.sheet, !!x.def.flip, !!x.def.front, 0.37 * (i + 1)));
    this.props = locId ? t.props.get(locId) ?? [] : [];
    this.hostName = hostName;
    this.furnished = '';
    this.setFurniture(owned);
    this.lastKey = '';
    this.setHover(null);
    this.hideBubble();
    this.start();
  }

  /** Shows the player's own things in their home (call again after buying or losing items). */
  setFurniture(owned: string[]) {
    const key = owned.slice().sort().join(',');
    if (key === this.furnished) return;
    this.furnished = key;
    const [w, hh] = this.theme.interiorSize;
    const u = this.under.getContext('2d')!;
    u.clearRect(0, 0, w, hh);
    this.lastKey = ''; // the over layer is redrawn with the actors
    const set = this.locId ? this.theme.furniture.get(this.locId) : undefined;
    if (!set) return;
    for (const id of owned) {
      const f = set.get(id);
      if (f && !f.def.front) u.drawImage(f.img, f.def.x, f.def.y);
    }
  }

  /** The host says a line (typewriter + talking animation), then shows the mood. */
  say(text: string, mood: Mood = 'neutral') {
    if (!text) return this.react(mood);
    const a = this.host;
    this.speak(text, mood, a ? this.anchorOf(a) : null, this.hostName, this.locId);
  }

  /**
   * A prop or regular "says" something: a named speaker (a regular, the cat) talks with
   * their own voice; an unnamed prop gets a narrator bubble pointing at it.
   */
  sayAt(id: string, text: string, name?: string) {
    const x = this.extras.find((e) => e.id === id);
    if (x) return this.speak(text, 'neutral', this.anchorOf(x), name ?? '', name ? id : null);
    const p = this.props.find((q) => q.id === id);
    const anchor = p ? { cx: p.x + p.w / 2, top: p.y, actor: null } : null;
    this.speak(text, 'neutral', anchor, name ?? '', name ? id : null);
  }

  /** A wordless reaction from the host (no bubble change). */
  react(mood: Mood) {
    if (this.host) this.setMood(this.host, mood, performance.now());
  }

  /** A regular reacts to something done with them: a little chat, then the mood. */
  reactExtra(id: string, mood: Mood) {
    const x = this.extras.find((e) => e.id === id);
    if (!x) return false;
    const now = performance.now();
    x.talkUntil = now + 1400;
    x.mood = mood;
    x.moodUntil = mood === 'neutral' ? 0 : x.talkUntil + MOOD_MS;
    return true;
  }

  hasExtra(id: string) {
    return this.extras.some((e) => e.id === id);
  }

  hideBubble() {
    this.text = '';
    this.anchor = null;
    this.bubble.classList.add('hidden');
  }

  private setMood(a: Actor, mood: Mood, now: number) {
    a.mood = mood;
    a.moodUntil = mood === 'neutral' ? 0 : now + MOOD_MS;
  }

  private anchorOf(a: Actor): Anchor {
    return { cx: a.def.x + a.def.frameWidth / 2, top: a.def.y, actor: a };
  }

  private speak(text: string, mood: Mood, anchor: Anchor | null, name: string, voice: string | null) {
    // The previous speaker stops mid-sentence.
    const prev = this.anchor?.actor;
    if (prev && prev !== anchor?.actor) prev.talkUntil = 0;
    this.text = text;
    this.typed = 0;
    this.sayStart = performance.now();
    this.anchor = anchor;
    this.voice = voice;
    const typeMs = (text.length / TYPE_CPS) * 1000;
    const a = anchor?.actor;
    if (a) {
      a.talkUntil = this.sayStart + typeMs + 250;
      a.mood = mood;
      a.moodUntil = a.talkUntil + (mood === 'neutral' ? 0 : MOOD_MS);
    }
    this.who.textContent = name ? `${name}: ` : '';
    this.who.style.display = name ? '' : 'none';
    this.shown.textContent = '';
    this.rest.textContent = text;
    this.bubble.classList.remove('hidden', 'pop');
    void this.bubble.offsetWidth; // restart the pop-in animation
    this.bubble.classList.add('pop');
    this.placeBubble();
    this.start();
  }

  private finishTyping() {
    if (this.typed >= this.text.length) return;
    const now = performance.now();
    this.sayStart = now - (this.text.length / TYPE_CPS) * 1000;
    const a = this.anchor?.actor;
    if (a) {
      a.talkUntil = now + 150;
      a.moodUntil = a.talkUntil + (a.mood === 'neutral' ? 0 : MOOD_MS);
    }
  }

  private placeBubble() {
    const [w, hh] = this.theme.interiorSize;
    const s = this.bubble.style;
    const an = this.anchor;
    if (!an) {
      this.placedW = this.bubble.offsetWidth;
      s.left = '50%';
      s.transform = 'translateX(-50%)';
      s.bottom = `${hh - 40}px`;
      this.bubble.classList.add('notail');
      return;
    }
    this.bubble.classList.remove('notail');
    s.transform = '';
    // Measure with the whole text in place (the not-yet-typed part is invisible).
    const bw = Math.min(this.bubble.offsetWidth || 120, w - 8);
    const left = Math.round(Math.max(4, Math.min(w - 4 - bw, an.cx - bw / 2)));
    s.left = `${left}px`;
    // Above the head. A tall bubble may rise over the panel's title bar (up to
    // RISE px above the picture); only a very long line covers the speaker's head.
    const bh = this.bubble.offsetHeight;
    s.bottom = `${Math.round(Math.min(hh - an.top + 2, Math.max(12, hh - bh + RISE)))}px`;
    s.setProperty('--tail-x', `${Math.round(Math.max(10, Math.min(bw - 10, an.cx - left)))}px`);
    this.placedW = this.bubble.offsetWidth;
  }

  // ---------------------------------------------------------------- pointer

  private toLogical(e: PointerEvent | MouseEvent): [number, number] {
    const r = this.el.getBoundingClientRect();
    const [w, hh] = this.theme.interiorSize;
    return [((e.clientX - r.left) / r.width) * w, ((e.clientY - r.top) / r.height) * hh];
  }

  /** The prop or extra under a point (front-most first), if it responds to clicks. */
  private hitTest(x: number, y: number): string | null {
    const actors = [...this.extras].sort((a, b) => Number(b.front) - Number(a.front));
    for (const a of actors) {
      const d = a.def;
      const px = Math.floor(x - d.x);
      const py = Math.floor(y - d.y);
      if (px < 0 || py < 0 || px >= d.frameWidth || py >= d.frameHeight) continue;
      if (this.pokeable(a.id) && this.opaqueAt(a, a.flip ? d.frameWidth - 1 - px : px, py)) return a.id;
    }
    for (const p of this.props) if (x >= p.x && y >= p.y && x < p.x + p.w && y < p.y + p.h && this.pokeable(p.id)) return p.id;
    return null;
  }

  private alphaCache = new Map<HTMLImageElement, Uint8ClampedArray | null>();
  private opaqueAt(a: Actor, px: number, py: number): boolean {
    let data = this.alphaCache.get(a.sheet);
    if (data === undefined) {
      try {
        const c = document.createElement('canvas');
        c.width = a.sheet.width;
        c.height = a.sheet.height;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(a.sheet, 0, 0);
        data = ctx.getImageData(0, 0, c.width, c.height).data;
      } catch {
        data = null; // tainted canvas: fall back to the frame box
      }
      this.alphaCache.set(a.sheet, data);
    }
    if (!data) return true;
    // Any frame will do: idle frame 0 is close enough for a click.
    const frame = a.def.anims.idle?.[0] ?? 0;
    const sx = frame * a.def.frameWidth + px;
    return data[(py * a.sheet.width + sx) * 4 + 3] > 0;
  }

  private setHover(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.el.style.cursor = id ? 'pointer' : '';
    this.lastKey = '';
  }

  private pointer(e: PointerEvent | MouseEvent, click: boolean) {
    const [x, y] = this.toLogical(e);
    // Clicks on the bubble itself skip the typing instead.
    if (click && (e.target as HTMLElement).closest?.('.speech')) return;
    const id = this.hitTest(x, y);
    if (click) {
      if (id) this.onPoke(id);
    } else this.setHover(id);
  }

  // ---------------------------------------------------------------- animation

  /** Call after (re)attaching el to the document. */
  attached() {
    this.start();
  }

  private start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.tick(), 60);
  }

  private frameOf(a: Actor, now: number): number {
    let anim: HostAnim = 'idle';
    let fps = 3;
    if (now < a.talkUntil) {
      anim = 'talk';
      fps = 7;
    } else if (now < a.moodUntil && a.mood !== 'neutral') anim = a.mood;
    const anims = a.def.anims;
    const list = anims[anim]?.length ? anims[anim]! : anims.idle?.length ? anims.idle : [0];
    return list[Math.floor((now / 1000 + a.phase) * fps) % list.length];
  }

  private drawActor(ctx: CanvasRenderingContext2D, a: Actor, frame: number) {
    const d = a.def;
    if (a.flip) {
      ctx.save();
      ctx.translate(d.x + d.frameWidth, d.y);
      ctx.scale(-1, 1);
      ctx.drawImage(a.sheet, frame * d.frameWidth, 0, d.frameWidth, d.frameHeight, 0, 0, d.frameWidth, d.frameHeight);
      ctx.restore();
    } else ctx.drawImage(a.sheet, frame * d.frameWidth, 0, d.frameWidth, d.frameHeight, d.x, d.y, d.frameWidth, d.frameHeight);
  }

  /** A soft highlight around the hovered thing so players notice it can be clicked. */
  private drawHover(ctx: CanvasRenderingContext2D) {
    const id = this.hoverId;
    if (!id) return;
    const a = this.extras.find((e) => e.id === id);
    const r = a ? { x: a.def.x, y: a.def.y, w: a.def.frameWidth, h: a.def.frameHeight } : this.props.find((p) => p.id === id);
    if (!r) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 226, 122, 0.85)';
    ctx.setLineDash([2, 2]);
    ctx.lineDashOffset = -Math.floor(performance.now() / 120) % 4;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.restore();
  }

  private tick() {
    if (!this.el.isConnected) {
      clearInterval(this.timer);
      this.timer = 0;
      return;
    }
    const now = performance.now();
    if (this.text && this.bubble.offsetWidth !== this.placedW) this.placeBubble();
    if (this.text && this.typed < this.text.length) {
      const n = Math.min(this.text.length, Math.floor(((now - this.sayStart) / 1000) * TYPE_CPS));
      if (n !== this.typed) {
        if (n > this.typed) this.onType(this.text, this.typed, n, this.voice);
        this.typed = n;
        this.shown.textContent = this.text.slice(0, n);
        this.rest.textContent = this.text.slice(n);
      }
    }
    const actors = this.host ? [this.host, ...this.extras] : this.extras;
    const frames = actors.map((a) => this.frameOf(a, now));
    const key = frames.join(',') + (this.hoverId ? `|${this.hoverId}${Math.floor(now / 120) % 4}` : '');
    if (key === this.lastKey) return;
    this.lastKey = key;
    const [w, hh] = this.theme.interiorSize;
    const s = this.stage.getContext('2d')!;
    const o = this.over.getContext('2d')!;
    s.clearRect(0, 0, w, hh);
    o.clearRect(0, 0, w, hh);
    // Front furniture sits above the room's front layer.
    const set = this.locId ? this.theme.furniture.get(this.locId) : undefined;
    if (set && this.furnished) {
      for (const id of this.furnished.split(',')) {
        const f = set.get(id);
        if (f?.def.front) o.drawImage(f.img, f.def.x, f.def.y);
      }
    }
    // The host, then the regulars; front ones above the room's front layer.
    actors.forEach((a, i) => this.drawActor(a.front ? o : s, a, frames[i]));
    this.drawHover(o);
  }
}
