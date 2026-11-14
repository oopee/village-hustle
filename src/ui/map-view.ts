/** Canvas renderer for the village map: background, buildings, hover and the walking player token. */
import type { Content } from '../engine';
import type { Direction, OverlayArt, Theme } from './theme';

/** Footstep interval while walking (matches the walk cycle's feel). */
const STEP_MS = 270;

interface Token {
  color: number;
  x: number;
  y: number;
  moving: boolean;
  facing: 1 | -1;
  dir: Direction;
}

export class MapView {
  readonly ctx: CanvasRenderingContext2D;
  hover: string | null = null;
  token: Token | null = null;
  /** Called with the location id under the pointer (or null). */
  onHover: (locId: string | null, x: number, y: number) => void = () => {};
  onClick: (locId: string) => void = () => {};
  /** Called on every footstep while the token walks. */
  onStep: () => void = () => {};
  private frame = 0;
  private raf = 0;
  private walkToken = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly theme: Theme,
    readonly content: Content,
  ) {
    canvas.width = theme.def.width;
    canvas.height = theme.def.height;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    canvas.addEventListener('pointermove', (e) => this.pointer(e, false));
    canvas.addEventListener('pointerdown', (e) => this.pointer(e, true));
    canvas.addEventListener('pointerleave', () => this.setHover(null, 0, 0));
    const loop = () => {
      this.frame++;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  nodePos(node: string): [number, number] {
    return this.theme.def.nodes[node] ?? [this.theme.def.width / 2, this.theme.def.height / 2];
  }

  setToken(color: number | null, node?: string) {
    this.walkToken++;
    if (color === null || !node) {
      this.token = null;
      return;
    }
    const [x, y] = this.nodePos(node);
    this.token = { color, x, y, moving: false, facing: 1, dir: 'down' };
  }

  /** Animates the token along a path of nodes. speed = pixels per second (0 = jump). */
  async walk(path: string[], speed: number): Promise<void> {
    if (!this.token || path.length < 2) return;
    const my = ++this.walkToken;
    const t = this.token;
    if (speed <= 0) {
      [t.x, t.y] = this.nodePos(path[path.length - 1]);
      return;
    }
    t.moving = true;
    let nextStep = performance.now() + 60;
    for (let i = 1; i < path.length; i++) {
      const [x0, y0] = [t.x, t.y];
      const [x1, y1] = this.nodePos(path[i]);
      const dist = Math.hypot(x1 - x0, y1 - y0);
      if (x1 !== x0) t.facing = x1 > x0 ? 1 : -1;
      if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) t.dir = x1 > x0 ? 'right' : 'left';
      else t.dir = y1 > y0 ? 'down' : 'up';
      const ms = (dist / speed) * 1000;
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          if (my !== this.walkToken) return resolve();
          const now = performance.now();
          if (now >= nextStep) {
            nextStep = now + STEP_MS;
            this.onStep();
          }
          const k = Math.min(1, (now - start) / Math.max(1, ms));
          t.x = x0 + (x1 - x0) * k;
          t.y = y0 + (y1 - y0) * k;
          if (k >= 1) resolve();
          else requestAnimationFrame(step);
        };
        step();
      });
      if (my !== this.walkToken) return;
    }
    t.moving = false;
    t.dir = 'down';
  }

  private drawOverlay(o: OverlayArt, now: number) {
    const f = Math.floor((now / 1000) * o.fps) % o.frames;
    this.ctx.drawImage(o.img, f * o.frameWidth, 0, o.frameWidth, o.frameHeight, o.x, o.y, o.frameWidth, o.frameHeight);
  }

  private toLogical(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.canvas.width, ((e.clientY - r.top) / r.height) * this.canvas.height];
  }

  hitTest(x: number, y: number): string | null {
    // Buildings: pixel-exact on the sprite (front-most = drawn last = lowest y).
    const list = [...this.theme.buildings.values()].sort((a, b) => b.y + b.h - (a.y + a.h));
    for (const b of list) {
      const px = Math.floor(x - b.x);
      const py = Math.floor(y - b.y);
      if (px < 0 || py < 0 || px >= b.w || py >= b.h) continue;
      if (b.alpha[(py * b.w + px) * 4 + 3] > 0) return b.id;
    }
    // Locations without a sprite, or clicking right on the road node.
    for (const loc of this.content.locations) {
      const [nx, ny] = this.nodePos(loc.node);
      if (Math.hypot(nx - x, ny - y) <= 9) return loc.id;
    }
    return null;
  }

  private setHover(id: string | null, x: number, y: number) {
    this.hover = id;
    this.canvas.style.cursor = id ? 'pointer' : 'default';
    this.onHover(id, x, y);
  }

  private pointer(e: PointerEvent, click: boolean) {
    const [x, y] = this.toLogical(e);
    const id = this.hitTest(x, y);
    if (click) {
      if (id) this.onClick(id);
    } else if (id !== this.hover) this.setHover(id, x, y);
    else if (id) this.onHover(id, x, y);
  }

  draw() {
    const { ctx, theme } = this;
    const now = performance.now();
    ctx.drawImage(theme.background, 0, 0);
    for (const o of theme.overlays) if (!o.above) this.drawOverlay(o, now);
    const sprites = [...theme.buildings.values()].sort((a, b) => a.y + a.h - (b.y + b.h));
    for (const b of sprites) {
      if (this.hover === b.id) ctx.drawImage(b.hover, b.x - 1, b.y - 1);
      else ctx.drawImage(b.img, b.x, b.y);
    }
    // Signposts for locations that have no art yet.
    for (const loc of this.content.locations) {
      if (theme.buildings.has(loc.id)) continue;
      const [x, y] = this.nodePos(loc.node);
      ctx.fillStyle = '#5a3b22';
      ctx.fillRect(x - 1, y - 18, 2, 12);
      ctx.fillStyle = this.hover === loc.id ? '#ffe27a' : '#f3efe4';
      ctx.font = '10px VT323, monospace';
      const w = Math.ceil(ctx.measureText(loc.name).width) + 6;
      ctx.fillRect(x - w / 2, y - 28, w, 11);
      ctx.strokeStyle = '#1e1a22';
      ctx.strokeRect(x - w / 2 + 0.5, y - 27.5, w - 1, 10);
      ctx.fillStyle = '#1e1a22';
      ctx.fillText(loc.name, x - w / 2 + 3, y - 19);
    }
    const t = this.token;
    if (t) {
      const frames = theme.playerFrames[t.color % theme.playerFrames.length];
      const dirs = theme.def.player.directions;
      let img: HTMLCanvasElement;
      let mirror = false;
      if (dirs) {
        const cycle = dirs[t.dir]?.length ? dirs[t.dir] : dirs.down;
        img = frames[(t.moving ? cycle[Math.floor(this.frame / 8) % cycle.length] : cycle[0]) % frames.length];
      } else {
        img = frames[t.moving ? Math.floor(this.frame / 8) % frames.length : 0];
        mirror = t.facing < 0;
      }
      const bob = t.moving ? 0 : Math.round(Math.sin(this.frame / 20) * 0.6);
      const x = Math.round(t.x - img.width / 2);
      const y = Math.round(t.y - img.height + 3 + bob);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(Math.round(t.x), Math.round(t.y) + 3, Math.max(5, img.width / 3), 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (mirror) {
        ctx.save();
        ctx.translate(x + img.width, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      } else ctx.drawImage(img, x, y);
    }
    for (const o of theme.overlays) if (o.above) this.drawOverlay(o, now);
    if (theme.foreground) ctx.drawImage(theme.foreground, 0, 0);
  }
}
