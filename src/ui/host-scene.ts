/**
 * The inside of a location: interior art, the animated owner ("host") and their
 * cartoon speech bubble. One instance lives for the whole app and is re-attached to
 * the location panel on every render, so animations don't restart.
 *
 * Pure presentation: which line the host says is decided by the App from content
 * (location.host.lines) and engine events; this class only shows it.
 */
import { h } from './dom';
import type { HostAnim, HostArt, Theme } from './theme';

export type Mood = 'neutral' | 'happy' | 'annoyed';

const TYPE_CPS = 45; // typewriter speed, characters per second
const MOOD_MS = 1600;
/** How far (px) a bubble may extend above the picture, over the panel title bar. */
const RISE = 24;

export class HostScene {
  readonly el: HTMLElement;
  private back: HTMLImageElement;
  private front: HTMLImageElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bubble: HTMLElement;
  private who: HTMLElement;
  private shown: HTMLElement;
  private rest: HTMLElement;
  private fallback: HTMLElement;

  private host: HostArt | null = null;
  private hostName = '';
  private text = '';
  private typed = 0;
  private sayStart = 0;
  private talkUntil = 0;
  private mood: Mood = 'neutral';
  private moodUntil = 0;
  private timer = 0;
  private lastFrame = -1;
  private placedW = -1;
  /** Called as the typewriter reveals letters (from, to) of the current line; drives the voice. */
  onType: (text: string, from: number, to: number) => void = () => {};

  constructor(private theme: Theme) {
    const [w, hh] = theme.interiorSize;
    this.back = h('img', { class: 'back', alt: '', draggable: false });
    this.front = h('img', { class: 'front', alt: '', draggable: false });
    this.canvas = h('canvas', { class: 'host' });
    this.ctx = this.canvas.getContext('2d')!;
    this.who = h('b', { class: 'who' });
    this.shown = h('span');
    this.rest = h('span', { class: 'rest' });
    this.bubble = h('div', { class: 'speech hidden', onclick: () => this.finishTyping() }, this.who, h('span', { class: 'text' }, this.shown, this.rest));
    this.fallback = h('div', { class: 'no-art' });
    this.el = h('div', { class: 'scene', style: { width: `${w}px`, height: `${hh}px` } }, this.back, this.canvas, this.front, this.fallback, this.bubble);
  }

  /** Switches to a location; clears the bubble. */
  setLocation(locId: string | null, label: string, hostName: string) {
    const t = this.theme;
    const interior = locId ? t.interiors.get(locId) : undefined;
    const front = locId ? t.interiorFronts.get(locId) : undefined;
    this.back.style.display = interior ? '' : 'none';
    if (interior) this.back.src = interior;
    this.front.style.display = front ? '' : 'none';
    if (front) this.front.src = front;
    this.fallback.style.display = interior ? 'none' : '';
    this.fallback.textContent = label;
    this.host = locId ? t.hosts.get(locId) ?? null : null;
    this.hostName = hostName;
    if (this.host) {
      const d = this.host.def;
      this.canvas.width = d.frameWidth;
      this.canvas.height = d.frameHeight;
      Object.assign(this.canvas.style, { display: '', left: `${d.x}px`, top: `${d.y}px`, width: `${d.frameWidth}px`, height: `${d.frameHeight}px` });
    } else this.canvas.style.display = 'none';
    this.lastFrame = -1;
    this.mood = 'neutral';
    this.moodUntil = 0;
    this.talkUntil = 0;
    this.hideBubble();
    this.start();
  }

  /** The host says a line (typewriter + talking animation), then shows the mood. */
  say(text: string, mood: Mood = 'neutral') {
    if (!text) return this.react(mood);
    this.text = text;
    this.typed = 0;
    this.sayStart = performance.now();
    const typeMs = (text.length / TYPE_CPS) * 1000;
    this.talkUntil = this.sayStart + typeMs + 250;
    this.mood = mood;
    this.moodUntil = this.talkUntil + (mood === 'neutral' ? 0 : MOOD_MS);
    this.who.textContent = this.hostName ? `${this.hostName}: ` : '';
    this.who.style.display = this.hostName ? '' : 'none';
    this.shown.textContent = '';
    this.rest.textContent = text;
    this.bubble.classList.remove('hidden', 'pop');
    void this.bubble.offsetWidth; // restart the pop-in animation
    this.bubble.classList.add('pop');
    this.placeBubble();
    this.start();
  }

  /** A wordless reaction (no bubble change). */
  react(mood: Mood) {
    this.mood = mood;
    this.moodUntil = mood === 'neutral' ? 0 : performance.now() + MOOD_MS;
  }

  hideBubble() {
    this.text = '';
    this.bubble.classList.add('hidden');
  }

  private finishTyping() {
    if (this.typed >= this.text.length) return;
    this.sayStart = performance.now() - (this.text.length / TYPE_CPS) * 1000;
    this.talkUntil = performance.now() + 150;
    this.moodUntil = this.talkUntil + (this.mood === 'neutral' ? 0 : MOOD_MS);
  }

  private placeBubble() {
    const [w] = this.theme.interiorSize;
    const [, hh] = this.theme.interiorSize;
    const s = this.bubble.style;
    if (!this.host) {
      this.placedW = this.bubble.offsetWidth;
      s.left = '50%';
      s.transform = 'translateX(-50%)';
      s.bottom = `${hh - 40}px`;
      this.bubble.classList.add('notail');
      return;
    }
    this.bubble.classList.remove('notail');
    s.transform = '';
    const d = this.host.def;
    const cx = d.x + d.frameWidth / 2;
    // Measure with the whole text in place (the not-yet-typed part is invisible).
    const bw = Math.min(this.bubble.offsetWidth || 120, w - 8);
    const left = Math.round(Math.max(4, Math.min(w - 4 - bw, cx - bw / 2)));
    s.left = `${left}px`;
    // Above the head. A tall bubble may rise over the panel's title bar (up to
    // RISE px above the picture); only a very long line covers the host's head.
    const bh = this.bubble.offsetHeight;
    s.bottom = `${Math.round(Math.min(hh - d.y + 2, Math.max(12, hh - bh + RISE)))}px`;
    s.setProperty('--tail-x', `${Math.round(Math.max(10, Math.min(bw - 10, cx - left)))}px`);
    this.placedW = this.bubble.offsetWidth;
  }

  /** Call after (re)attaching el to the document. */
  attached() {
    this.start();
  }

  private start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.tick(), 60);
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
        if (n > this.typed) this.onType(this.text, this.typed, n);
        this.typed = n;
        this.shown.textContent = this.text.slice(0, n);
        this.rest.textContent = this.text.slice(n);
      }
    }
    if (!this.host) return;
    let anim: HostAnim = 'idle';
    let fps = 3;
    if (now < this.talkUntil) {
      anim = 'talk';
      fps = 7;
    } else if (now < this.moodUntil && this.mood !== 'neutral') {
      anim = this.mood;
      fps = 3;
    }
    const anims = this.host.def.anims;
    const list = anims[anim]?.length ? anims[anim]! : anims.idle?.length ? anims.idle : [0];
    const frame = list[Math.floor((now / 1000) * fps) % list.length];
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    const d = this.host.def;
    this.ctx.clearRect(0, 0, d.frameWidth, d.frameHeight);
    this.ctx.drawImage(this.host.sheet, frame * d.frameWidth, 0, d.frameWidth, d.frameHeight, 0, 0, d.frameWidth, d.frameHeight);
  }
}
