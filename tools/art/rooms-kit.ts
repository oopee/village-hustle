/**
 * Shared pixel-art helpers for tools/art/rooms.ts (interiors) and rooms-hosts.ts (hosts).
 * Everything here is pure: draws into the Img it is given.
 */
import { Img, hex, type RGBA } from '../raster';

export type Ramp = RGBA[];
export const ramp = (...h: string[]): Ramp => h.map((s) => hex(s));
export const W = 256;
export const H = 160;

export const OUT = hex('#2b1d2a');

export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}
export const alpha = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], a];

/** Common colour ramps, light -> dark, hue-shifted (warm lights, purple shadows). */
export const PAL = {
  white: ramp('#fffaf0', '#ece4da', '#c8bcc4', '#968aa4', '#5e5474'),
  wood: ramp('#f2c98c', '#d79e60', '#ad7242', '#7c4a36', '#4e2c32'),
  darkWood: ramp('#b47a4a', '#8a5636', '#663c2e', '#482634', '#2f1a28'),
  pine: ramp('#f8e0aa', '#e6bd80', '#c4925e', '#94643f', '#5f3b34'),
  log: ramp('#eeb46e', '#cd8a4a', '#a06036', '#6e3c2e', '#46242c'),
  metal: ramp('#f4f6f2', '#c8ccd4', '#9298ac', '#60627c', '#3c3a54'),
  steel: ramp('#d8dee8', '#a8b0c0', '#7a8098', '#525470', '#34304a'),
  red: ramp('#f78a64', '#d84a3e', '#a62e3a', '#701e34', '#46142c'),
  orange: ramp('#ffc070', '#f08a3a', '#c45a2e', '#86382e'),
  green: ramp('#b8e080', '#76b452', '#448446', '#2a5842', '#1c3838'),
  leaf: ramp('#c4e888', '#82bf52', '#4e9244', '#2f623e', '#1e4038'),
  blue: ramp('#9ad0f4', '#5c94dc', '#3c60b4', '#2c3c7c', '#202654'),
  teal: ramp('#9ee4d4', '#52b4a8', '#2e7e84', '#215462'),
  yellow: ramp('#fff4a8', '#f6d050', '#d49a30', '#9c6230'),
  cream: ramp('#fffbe8', '#f4e8c4', '#d8c49a', '#a8907a'),
  brick: ramp('#e88a64', '#c25c44', '#8e3c3c', '#5c2836'),
  stone: ramp('#d4ccc8', '#a8a0a4', '#7c7484', '#545064', '#36324a'),
  purple: ramp('#c8a0e0', '#9a6cc4', '#6c4898', '#46306a'),
  pink: ramp('#ffd0d8', '#f4a0b4', '#cc6e8e', '#94466c'),
  black: ramp('#5c5070', '#3e3450', '#2e2640', '#221c30'),
};
export const BOOKS: Ramp[] = [
  PAL.red, PAL.blue, PAL.green, PAL.yellow, PAL.cream, PAL.purple, PAL.teal, PAL.orange, PAL.brick, PAL.darkWood,
];

// ------------------------------------------------------------------ masks

/** Boolean shape buffer. Draw shapes, then paint() them with automatic edge shading. */
export class Mask {
  m: Uint8Array;
  /** Offset added to every drawing call (used for the host breathing bob). */
  ox = 0;
  oy = 0;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.m = new Uint8Array(w * h);
  }
  has(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.m[y * this.w + x] === 1;
  }
  add(x: number, y: number) {
    x = Math.floor(x) + this.ox;
    y = Math.floor(y) + this.oy;
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.m[y * this.w + x] = 1;
    return this;
  }
  del(x: number, y: number) {
    x = Math.floor(x) + this.ox;
    y = Math.floor(y) + this.oy;
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.m[y * this.w + x] = 0;
    return this;
  }
  rect(x: number, y: number, w: number, h: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.add(x + i, y + j);
    return this;
  }
  span(y: number, x0: number, x1: number) {
    for (let x = x0; x <= x1; x++) this.add(x, y);
    return this;
  }
  /** Rows: [y, x0, x1][] */
  rows(rows: [number, number, number][]) {
    for (const [y, a, b] of rows) this.span(y, a, b);
    return this;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.add(x, y);
    return this;
  }
  disc(cx: number, cy: number, r: number) {
    return this.ellipse(cx, cy, r, r);
  }
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
    const minX = Math.floor(Math.min(x0, x1, x2));
    const maxX = Math.ceil(Math.max(x0, x1, x2));
    const minY = Math.floor(Math.min(y0, y1, y2));
    const maxY = Math.ceil(Math.max(y0, y1, y2));
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const w0 = (x1 - x) * (y2 - y) - (x2 - x) * (y1 - y);
        const w1 = (x2 - x) * (y0 - y) - (x0 - x) * (y2 - y);
        const w2 = (x0 - x) * (y1 - y) - (x1 - x) * (y0 - y);
        if (area > 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0) this.add(x, y);
      }
    return this;
  }
  /** Thick line; w = width in px. */
  line(x0: number, y0: number, x1: number, y1: number, w = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      if (w <= 1) this.add(Math.round(x), Math.round(y));
      else
        for (let j = -w; j <= w; j++)
          for (let i = -w; i <= w; i++) {
            const px = Math.round(x + i * 0.5);
            const py = Math.round(y + j * 0.5);
            if ((px - x) ** 2 + (py - y) ** 2 <= (w / 2) ** 2) this.add(px, py);
          }
    }
    return this;
  }
  /** Keep only pixels where pred(localX, localY) holds. */
  clip(pred: (x: number, y: number) => boolean) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (this.m[y * this.w + x] && !pred(x - this.ox, y - this.oy)) this.m[y * this.w + x] = 0;
    return this;
  }
  sub(o: Mask) {
    for (let i = 0; i < this.m.length; i++) if (o.m[i]) this.m[i] = 0;
    return this;
  }
  union(o: Mask) {
    for (let i = 0; i < this.m.length; i++) if (o.m[i]) this.m[i] = 1;
    return this;
  }
  each(fn: (x: number, y: number) => void) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.m[y * this.w + x]) fn(x, y);
  }
  /**
   * Paint with automatic edge shading: top/left edges one step lighter, bottom/right
   * edges one step darker. `split` (local x): pixels right of it use the next darker tone.
   */
  paint(img: Img, r: Ramp, o: { split?: number; flat?: boolean; out?: RGBA; base?: number; noHi?: boolean } = {}) {
    const base = o.base ?? 1;
    const last = r.length - 1;
    this.each((x, y) => {
      let i = base;
      if (o.split !== undefined && x - this.ox >= o.split) i = Math.min(last, i + 1);
      if (!o.flat) {
        const t = !this.has(x, y - 1);
        const l = !this.has(x - 1, y);
        const rr = !this.has(x + 1, y);
        const b = !this.has(x, y + 1);
        if ((b || rr) && !(t || l)) i = Math.min(last, i + 1);
        else if ((t || l) && !(b || rr) && !o.noHi) i = Math.max(0, i - 1);
      }
      img.set(x, y, r[i]);
    });
    if (o.out) this.outlineOn(img, o.out);
    return this;
  }
  fill(img: Img, c: RGBA) {
    this.each((x, y) => img.set(x, y, c));
    return this;
  }
  outlineOn(img: Img, c: RGBA) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.has(x, y)) continue;
        if (this.has(x - 1, y) || this.has(x + 1, y) || this.has(x, y - 1) || this.has(x, y + 1)) img.set(x, y, c);
      }
    return this;
  }
}

export const mask = (img: Img) => new Mask(img.w, img.h);

// ------------------------------------------------------------------ basic shapes

/** Furniture block in 3/4 view: a top face `top` px deep above a front face. */
export function box(img: Img, x: number, y: number, w: number, h: number, top: number, rt: Ramp, rf: Ramp, out = true) {
  if (top > 0) {
    img.rect(x, y, w, top, rt[1]);
    img.hline(x, x + w - 1, y, rt[2]);
    img.hline(x, x + w - 1, y + top - 1, rt[0]);
  }
  img.rect(x, y + top, w, h - top, rf[1]);
  img.hline(x, x + w - 1, y + top, rf[2]);
  img.vline(x + w - 1, y + top, y + h - 1, rf[2]);
  img.hline(x, x + w - 1, y + h - 1, rf[3] ?? rf[2]);
  img.vline(x, y + top + 1, y + h - 2, rf[0]);
  if (out) img.frame(x - 1, y - 1, w + 2, h + 2, OUT);
}

/** Soft purple floor shadow. */
export function shadow(img: Img, cx: number, cy: number, rx: number, ry: number, a = 70) {
  const c = hex('#3a2448', a);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) img.set(x, y, c);
}
export function shadowRect(img: Img, x: number, y: number, w: number, h: number, a = 70) {
  img.rect(x, y, w, h, hex('#3a2448', a));
}

/** Translucent overlay over a rect. */
export function tint(img: Img, x: number, y: number, w: number, h: number, c: RGBA) {
  img.rect(x, y, w, h, c);
}

// ------------------------------------------------------------------ walls & floors

export function wallPlanks(
  img: Img, x0: number, y0: number, x1: number, y1: number, r: Ramp, pw: number, rnd: () => number, o: { knots?: boolean; grain?: boolean } = {},
) {
  let x = x0;
  while (x <= x1) {
    const w = pw;
    const tone = rnd() < 0.35 ? mix(r[1], r[2], 0.28) : rnd() < 0.3 ? mix(r[1], r[0], 0.25) : r[1];
    img.rect(x, y0, Math.min(w, x1 - x + 1), y1 - y0 + 1, tone);
    img.vline(x, y0, y1, r[3]);
    img.vline(x + 1, y0, y1, mix(tone, r[0], 0.45));
    img.vline(x + w - 1, y0, y1, mix(tone, r[2], 0.4));
    if (o.grain !== false) {
      const n = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const gx = x + 2 + Math.floor(rnd() * Math.max(1, w - 4));
        const gy = y0 + Math.floor(rnd() * (y1 - y0));
        const gl = 6 + Math.floor(rnd() * 12);
        img.vline(gx, gy, Math.min(y1, gy + gl), mix(tone, r[2], 0.55));
      }
    }
    if (o.knots && rnd() < 0.3) {
      const kx = x + 2 + Math.floor(rnd() * Math.max(1, w - 5));
      const ky = y0 + 4 + Math.floor(rnd() * Math.max(1, y1 - y0 - 8));
      img.rect(kx, ky, 2, 3, r[2]);
      img.set(kx, ky + 1, r[3]);
    }
    x += w;
  }
}

export function wallLogs(img: Img, x0: number, y0: number, x1: number, y1: number, r: Ramp, lh: number, rnd: () => number) {
  for (let y = y0, k = 0; y <= y1; y += lh, k++) {
    for (let j = 0; j < lh && y + j <= y1; j++) {
      const c = j === 0 ? r[4] ?? r[3] : j === 1 ? r[0] : j < lh * 0.55 ? r[1] : j < lh - 2 ? mix(r[1], r[2], 0.5) : r[2];
      img.hline(x0, x1, y + j, c);
    }
    // cracks & knots
    const n = Math.floor((x1 - x0) / 40);
    for (let i = 0; i < n; i++) {
      const cx = x0 + Math.floor(rnd() * (x1 - x0));
      const cy = y + 3 + Math.floor(rnd() * Math.max(1, lh - 5));
      if (rnd() < 0.6) img.hline(cx, cx + 4 + Math.floor(rnd() * 8), cy, mix(r[2], r[3], 0.4));
      else {
        img.rect(cx, cy, 3, 2, r[2]);
        img.set(cx + 1, cy, r[3]);
      }
    }
    // occasional joint between two logs
    if (rnd() < 0.5) {
      const jx = x0 + 20 + Math.floor(rnd() * (x1 - x0 - 40));
      img.vline(jx, y + 1, Math.min(y1, y + lh - 1), r[3]);
      img.vline(jx + 1, y + 1, Math.min(y1, y + lh - 1), r[0]);
    }
  }
}

export type Motif = 'dots' | 'stripes' | 'diamond' | 'flower' | 'retro' | 'none';
export function wallpaper(img: Img, x0: number, y0: number, x1: number, y1: number, base: RGBA, m: RGBA, kind: Motif, step = 8, m2?: RGBA) {
  img.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, base);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const lx = x - x0;
      const ly = y - y0;
      const row = Math.floor(ly / step);
      const off = row % 2 ? step / 2 : 0;
      const u = (((lx + off) % step) + step) % step;
      const v = ly % step;
      const c = step >> 1;
      if (kind === 'stripes') {
        if (lx % step === 0) img.set(x, y, m);
        else if (m2 && lx % step === 2 && ly % 4 < 2) img.set(x, y, m2);
      } else if (kind === 'dots') {
        if (u === c && v === c) img.set(x, y, m);
      } else if (kind === 'diamond') {
        if (Math.abs(u - c) + Math.abs(v - c) === c - 1) img.set(x, y, m);
      } else if (kind === 'flower') {
        const d = Math.abs(u - c) + Math.abs(v - c);
        if (d === 1) img.set(x, y, m);
        else if (d === 0 && m2) img.set(x, y, m2);
      } else if (kind === 'retro') {
        // big 70s circles
        const s = step;
        const cx = (lx % (s * 2)) - s;
        const cy = (ly % (s * 2)) - s;
        const d = Math.sqrt(cx * cx + cy * cy);
        if (d > s * 0.55 && d < s * 0.8) img.set(x, y, m);
        else if (m2 && d < s * 0.3) img.set(x, y, m2);
      }
    }
}

export function wainscot(img: Img, x0: number, x1: number, y0: number, y1: number, r: Ramp, pw = 6) {
  for (let x = x0; x <= x1; x++) {
    const k = (x - x0) % pw;
    img.vline(x, y0, y1, k === 0 ? r[3] : k === 1 ? r[0] : k === pw - 1 ? r[2] : r[1]);
  }
  // top rail
  img.hline(x0, x1, y0 - 3, r[0]);
  img.hline(x0, x1, y0 - 2, r[1]);
  img.hline(x0, x1, y0 - 1, r[2]);
  img.hline(x0, x1, y0, r[3]);
}

/** Horizontal floor boards, getting taller towards the viewer. */
export function floorPlanks(img: Img, y0: number, r: Ramp, rnd: () => number, o: { y1?: number } = {}) {
  const y1 = o.y1 ?? img.h - 1;
  let y = y0;
  let row = 0;
  while (y <= y1) {
    const bh = Math.min(10, 4 + Math.floor(row * 0.8));
    const tone = row % 3 === 1 ? mix(r[1], r[2], 0.22) : row % 3 === 2 ? mix(r[1], r[0], 0.18) : r[1];
    for (let j = 0; j < bh && y + j <= y1; j++)
      img.hline(0, img.w - 1, y + j, j === 0 ? r[3] : j === 1 ? mix(tone, r[0], 0.5) : j === bh - 1 ? mix(tone, r[2], 0.5) : tone);
    // butt joints
    let x = Math.floor(rnd() * 40) - 40;
    while (x < img.w) {
      x += 34 + Math.floor(rnd() * 46);
      img.vline(x, y + 1, Math.min(y1, y + bh - 1), r[3]);
      img.vline(x + 1, y + 1, Math.min(y1, y + bh - 1), mix(tone, r[0], 0.4));
      // grain streak
      const gx = x + 6 + Math.floor(rnd() * 20);
      if (bh > 5) img.hline(gx, gx + 4 + Math.floor(rnd() * 10), y + 2 + Math.floor(rnd() * (bh - 3)), mix(tone, r[2], 0.45));
    }
    y += bh;
    row++;
  }
}

export function floorTiles(img: Img, y0: number, a: RGBA, b: RGBA, grout: RGBA, size = 12) {
  let y = y0;
  let row = 0;
  while (y < img.h) {
    const th = Math.min(size, 5 + row * 2);
    for (let j = 0; j < th && y + j < img.h; j++)
      for (let x = 0; x < img.w; x++) {
        const col = Math.floor((x - img.w / 2 + 1000 * size) / size);
        const c = (col + row) % 2 ? a : b;
        const edge = j === 0 || (x - img.w / 2 + 1000 * size) % size === 0;
        img.set(x, y + j, edge ? grout : j === 1 ? mix(c, hex('#ffffff'), 0.25) : c);
      }
    y += th;
    row++;
  }
}

/** Floor of linoleum / concrete with sparse specks (no noise). */
export function floorFlat(img: Img, y0: number, r: Ramp, rnd: () => number) {
  img.rect(0, y0, img.w, img.h - y0, r[1]);
  for (let y = y0; y < img.h; y++) if ((y - y0) % 11 === 10) img.hline(0, img.w - 1, y, mix(r[1], r[2], 0.35));
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rnd() * img.w);
    const y = y0 + 2 + Math.floor(rnd() * (img.h - y0 - 2));
    img.set(x, y, rnd() < 0.5 ? r[2] : r[0]);
  }
}

/**
 * Room box: back wall + floor, with slanted side walls at the left/right edges for depth.
 * `wall` paints the whole image area (back + side walls), `floor` paints a full-size image
 * that is clipped to the floor polygon.
 */
export function roomBox(
  img: Img,
  o: { floorY: number; side?: number; slope?: number; wall: (img: Img) => void; floor: (img: Img) => void; skirt?: Ramp; corner?: RGBA },
) {
  const side = o.side ?? 12;
  const slope = o.slope ?? 14;
  const fy = o.floorY;
  o.wall(img);
  const fl = new Img(img.w, img.h);
  o.floor(fl);
  const top = (x: number) =>
    x < side ? fy + Math.round(((side - x) * slope) / side) : x > img.w - 1 - side ? fy + Math.round(((x - (img.w - 1 - side)) * slope) / side) : fy;
  for (let x = 0; x < img.w; x++) {
    const t = top(x);
    for (let y = t; y < img.h; y++) img.set(x, y, fl.get(x, y));
    // side walls darker
    if (x < side) for (let y = 0; y < t; y++) img.set(x, y, hex('#2a1838', 80));
    if (x > img.w - 1 - side) for (let y = 0; y < t; y++) img.set(x, y, hex('#2a1838', 50));
  }
  const corner = o.corner ?? hex('#2a1838', 110);
  img.vline(side, 0, fy - 1, corner);
  img.vline(img.w - 1 - side, 0, fy - 1, corner);
  if (o.skirt) {
    const s = o.skirt;
    img.rect(side, fy - 4, img.w - 2 * side, 4, s[1]);
    img.hline(side, img.w - 1 - side, fy - 4, s[0]);
    img.hline(side, img.w - 1 - side, fy - 1, s[2]);
    for (let x = 0; x < side; x++) {
      const t = top(x);
      for (let j = 1; j <= 4; j++) img.set(x, t - j, j === 4 ? mix(s[0], s[2], 0.5) : s[2]);
      const xr = img.w - 1 - x;
      const tr = top(xr);
      for (let j = 1; j <= 4; j++) img.set(xr, tr - j, j === 4 ? s[0] : s[1]);
    }
  }
  // contact shadow along the base of the walls
  for (let x = 0; x < img.w; x++) img.set(x, top(x), hex('#2a1838', 70));
  for (let x = side; x < img.w - side; x++) img.set(x, fy + 1, hex('#2a1838', 30));
}

/** Darker band across the top of the wall (ceiling edge / beam). */
export function ceiling(img: Img, h: number, r: Ramp) {
  img.rect(0, 0, img.w, h, r[2]);
  img.hline(0, img.w - 1, h - 1, r[3]);
  img.hline(0, img.w - 1, h, hex('#2a1838', 60));
  img.hline(0, img.w - 1, h + 1, hex('#2a1838', 30));
}

// ------------------------------------------------------------------ windows & views

export interface WindowOpts {
  cols?: number;
  rows?: number;
  curtain?: Ramp;
  sill?: Ramp;
  bar?: number;
}
export function windowFrame(img: Img, x: number, y: number, w: number, h: number, frame: Ramp, view: (v: Img) => void, o: WindowOpts = {}) {
  const bar = o.bar ?? 2;
  // frame
  img.rect(x, y, w, h, frame[1]);
  img.frame(x - 1, y - 1, w + 2, h + 2, OUT);
  img.hline(x, x + w - 1, y, frame[0]);
  img.vline(x, y, y + h - 1, frame[0]);
  img.hline(x, x + w - 1, y + h - 1, frame[2]);
  img.vline(x + w - 1, y, y + h - 1, frame[2]);
  const gx = x + 3;
  const gy = y + 3;
  const gw = w - 6;
  const gh = h - 6;
  const v = new Img(gw, gh);
  view(v);
  img.blit(v, gx, gy);
  // inner frame shadow
  img.hline(gx, gx + gw - 1, gy, hex('#2a1838', 90));
  img.vline(gx, gy, gy + gh - 1, hex('#2a1838', 70));
  // glass glints
  const glint = hex('#ffffff', 70);
  for (let k = 0; k < Math.min(gw, gh) / 2; k++) {
    img.set(gx + gw - 4 - k, gy + 2 + k, glint);
    img.set(gx + gw - 6 - k, gy + 2 + k, glint);
  }
  // mullions
  const cols = o.cols ?? 2;
  const rows = o.rows ?? 1;
  for (let i = 1; i < cols; i++) {
    const mx = gx + Math.round((gw * i) / cols) - (bar >> 1);
    img.rect(mx, gy, bar, gh, frame[1]);
    img.vline(mx, gy, gy + gh - 1, frame[0]);
    img.vline(mx + bar, gy, gy + gh - 1, hex('#2a1838', 50));
  }
  for (let j = 1; j < rows; j++) {
    const my = gy + Math.round((gh * j) / rows) - (bar >> 1);
    img.rect(gx, my, gw, bar, frame[1]);
    img.hline(gx, gx + gw - 1, my, frame[0]);
    img.hline(gx, gx + gw - 1, my + bar, hex('#2a1838', 50));
  }
  if (o.sill) {
    const s = o.sill;
    img.rect(x - 3, y + h, w + 6, 3, s[1]);
    img.hline(x - 3, x + w + 2, y + h, s[0]);
    img.hline(x - 3, x + w + 2, y + h + 2, s[2]);
    img.frame(x - 4, y + h - 1, w + 8, 5, OUT);
    img.hline(x - 2, x + w + 1, y + h + 4, hex('#2a1838', 60));
  }
  if (o.curtain) {
    const c = o.curtain;
    for (const side of [0, 1]) {
      const cx0 = side ? x + w - 5 : x - 5;
      const m = new Mask(img.w, img.h);
      m.rect(cx0, y - 3, 10, h + 2);
      m.tri(cx0, y + h - 2, cx0 + 10, y + h - 2, side ? cx0 + 10 : cx0, y + h + 6);
      m.paint(img, c, { split: cx0 + 7 });
      for (let k = 2; k < 10; k += 3) img.vline(cx0 + k, y, y + h - 2, c[2]);
      m.outlineOn(img, OUT);
    }
    // rod
    img.rect(x - 8, y - 5, w + 16, 2, PAL.darkWood[1]);
    img.hline(x - 8, x + w + 7, y - 6, OUT);
    img.hline(x - 8, x + w + 7, y - 3, OUT);
  }
}

/** Sky in flat horizontal bands. */
export function skyBands(v: Img, cols: RGBA[], y0 = 0, y1 = v.h) {
  const n = cols.length;
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    v.hline(0, v.w - 1, y, cols[Math.min(n - 1, Math.floor(t * n))]);
  }
}

export function cloud(v: Img, x: number, y: number, s: number, c: RGBA, sh: RGBA) {
  const m = new Mask(v.w, v.h);
  m.ellipse(x, y, s * 1.6, s * 0.7).ellipse(x - s * 0.8, y + 1, s, s * 0.55).ellipse(x + s, y + 1, s * 0.9, s * 0.5);
  m.each((px, py) => v.set(px, py, py > y + s * 0.2 ? sh : c));
}

/** Bumpy far forest silhouette from y downwards. */
export function treeLine(v: Img, y: number, c: RGBA, rnd: () => number, amp = 4) {
  for (let x = 0; x < v.w; x++) {
    const h = Math.round(amp * (0.5 + 0.5 * Math.sin(x * 0.7 + rnd() * 0.6)) + ((x * 7) % 5 === 0 ? 2 : 0));
    v.vline(x, y - h, v.h - 1, c);
  }
}

export function spruce(img: Img, cx: number, top: number, h: number, r: Ramp) {
  const m = new Mask(img.w, img.h);
  const tiers = Math.max(2, Math.floor(h / 6));
  for (let i = 0; i < tiers; i++) {
    const ty = top + (i * (h - 2)) / tiers;
    const hw = 1.5 + ((i + 1) * h) / tiers / 2.6;
    m.tri(cx, ty, cx - hw, ty + h / tiers + 2, cx + hw, ty + h / tiers + 2);
  }
  m.paint(img, r, { split: cx + 1 });
  img.vline(cx, top + h, top + h + 1, PAL.darkWood[2]);
}

export function birch(img: Img, x: number, y0: number, y1: number, leaf: Ramp, rnd: () => number) {
  img.vline(x, y0, y1, hex('#f4f0e8'));
  img.vline(x + 1, y0, y1, hex('#c8c0c8'));
  for (let y = y0 + 2; y < y1; y += 3 + Math.floor(rnd() * 4)) img.set(x + (rnd() < 0.5 ? 0 : 1), y, OUT);
  const m = new Mask(img.w, img.h);
  for (let i = 0; i < 6; i++) m.ellipse(x + (rnd() - 0.5) * 10, y0 + (rnd() - 0.3) * 8, 3 + rnd() * 3, 2 + rnd() * 2);
  m.paint(img, leaf, { split: x + 3 });
}

export function lake(v: Img, y0: number, y1: number, cols: RGBA[], glint: RGBA, rnd: () => number) {
  skyBands(v, cols, y0, y1);
  for (let i = 0; i < Math.floor(v.w / 5); i++) {
    const x = Math.floor(rnd() * v.w);
    const y = y0 + 1 + Math.floor(rnd() * (y1 - y0 - 1));
    v.hline(x, x + 1 + Math.floor(rnd() * 3), y, glint);
  }
}

/** Summer view: sky, far shore forest, lake, birches. */
export function viewSummer(rnd: () => number, o: { birches?: boolean; lakeLine?: number } = {}) {
  return (v: Img) => {
    const ll = o.lakeLine ?? Math.floor(v.h * 0.55);
    skyBands(v, ramp('#7cc0ec', '#94d0f2', '#b2def4', '#d2ecf2'), 0, ll);
    cloud(v, v.w * 0.3, v.h * 0.18, 4, hex('#ffffff'), hex('#dceef8'));
    treeLine(v, ll - 2, hex('#4c8a64'), rnd, 3);
    treeLine(v, ll, hex('#36705a'), rnd, 2);
    lake(v, ll + 2, v.h, ramp('#5e9ad4', '#4a84c4', '#3c70b0'), hex('#c8ecff'), rnd);
    if (o.birches) {
      birch(v, Math.floor(v.w * 0.18), 2, v.h - 1, PAL.leaf, rnd);
      birch(v, Math.floor(v.w * 0.78), 5, v.h - 1, PAL.leaf, rnd);
    }
  };
}

// ------------------------------------------------------------------ props

export function clock(img: Img, cx: number, cy: number, r: number, rim: Ramp, hour = 10, min = 10, face: RGBA = hex('#fff8e8')) {
  const m = new Mask(img.w, img.h).disc(cx, cy, r);
  m.paint(img, rim);
  m.outlineOn(img, OUT);
  new Mask(img.w, img.h).disc(cx, cy, r - 2).fill(img, face);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    if (k % 3 === 0) img.set(Math.round(cx + Math.sin(a) * (r - 3)), Math.round(cy - Math.cos(a) * (r - 3)), rim[3] ?? OUT);
  }
  const ha = ((hour % 12) / 12 + min / 720) * Math.PI * 2;
  const ma = (min / 60) * Math.PI * 2;
  img.line(cx, cy, Math.round(cx + Math.sin(ha) * (r - 5)), Math.round(cy - Math.cos(ha) * (r - 5)), OUT);
  img.line(cx, cy, Math.round(cx + Math.sin(ma) * (r - 3)), Math.round(cy - Math.cos(ma) * (r - 3)), OUT);
  img.set(cx, cy, PAL.red[2]);
}

/** A row of book spines standing on a shelf at yb (bottom). */
export function books(img: Img, x0: number, x1: number, yb: number, maxH: number, rnd: () => number, gapChance = 0.08) {
  let x = x0;
  while (x <= x1 - 2) {
    if (rnd() < gapChance) {
      x += 3 + Math.floor(rnd() * 4);
      continue;
    }
    const w = Math.min(x1 - x + 1, 2 + Math.floor(rnd() * 3));
    const h = Math.max(4, maxH - Math.floor(rnd() * 4));
    const r = BOOKS[Math.floor(rnd() * BOOKS.length)];
    img.rect(x, yb - h + 1, w, h, r[1]);
    img.vline(x, yb - h + 1, yb, r[0]);
    if (w > 2) img.vline(x + w - 1, yb - h + 1, yb, r[2]);
    if (rnd() < 0.5) img.hline(x, x + w - 1, yb - h + 3, r[3] ?? r[2]);
    img.hline(x, x + w - 1, yb - h + 1, mix(r[0], r[1], 0.5));
    x += w;
    if (rnd() < 0.15) x++;
  }
}

export function bookshelf(img: Img, x: number, y: number, w: number, h: number, frame: Ramp, rnd: () => number, shelfH = 14) {
  box(img, x, y, w, h, 0, frame, frame);
  img.rect(x + 2, y + 2, w - 4, h - 4, frame[3]);
  for (let sy = y + 2 + shelfH; sy < y + h - 2; sy += shelfH) {
    books(img, x + 2, x + w - 3, sy - 1, shelfH - 3, rnd);
    img.rect(x + 2, sy, w - 4, 2, frame[1]);
    img.hline(x + 2, x + w - 3, sy, frame[0]);
  }
  books(img, x + 2, x + w - 3, y + h - 3, Math.min(shelfH - 3, ((h - 4) % shelfH) - 3 > 3 ? ((h - 4) % shelfH) - 3 : shelfH - 3), rnd);
  // shadow inside top
  img.hline(x + 2, x + w - 3, y + 2, hex('#2a1838', 80));
}

export function pot(img: Img, cx: number, yb: number, w: number, h: number, r: Ramp) {
  const m = new Mask(img.w, img.h);
  m.tri(cx - w / 2, yb - h, cx + w / 2, yb - h, cx + w / 2 - 2, yb).tri(cx - w / 2, yb - h, cx - w / 2 + 2, yb, cx + w / 2 - 2, yb);
  m.paint(img, r, { split: cx + w / 5 });
  m.outlineOn(img, OUT);
  img.rect(Math.round(cx - w / 2) - 1, yb - h - 1, w + 2, 3, r[1]);
  img.hline(Math.round(cx - w / 2) - 1, Math.round(cx - w / 2) + w, yb - h - 1, r[0]);
  img.frame(Math.round(cx - w / 2) - 2, yb - h - 2, w + 4, 5, OUT);
}

/** Leafy potted plant; kind changes the leaf cluster shape. */
export function plant(img: Img, cx: number, yb: number, size: number, rnd: () => number, kind: 'ficus' | 'monstera' | 'fern' = 'ficus', potR: Ramp = PAL.brick) {
  const ph = Math.round(size * 0.45);
  const top = yb - ph;
  const m = new Mask(img.w, img.h);
  if (kind === 'ficus') {
    img.vline(cx, top - size, top, PAL.darkWood[2]);
    img.vline(cx + 1, top - size * 0.6, top, PAL.darkWood[3]);
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * size * 0.55;
      m.ellipse(cx + Math.cos(a) * d, top - size * 0.95 + Math.sin(a) * d * 0.8, 3.2, 2.4);
    }
  } else if (kind === 'monstera') {
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * (0.1 + (0.8 * i) / 6);
      const ex = cx + Math.cos(a) * size * 0.7;
      const ey = top + Math.sin(a) * size * 0.8;
      m.line(cx, top, ex, ey, 1).ellipse(ex, ey, 4, 3);
    }
  } else {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * (0.05 + (0.9 * i) / 8);
      m.line(cx, top, cx + Math.cos(a) * size * 0.8, top + Math.sin(a) * size * 0.6, 2);
    }
  }
  m.paint(img, PAL.leaf, { split: cx + size * 0.3 });
  m.outlineOn(img, hex('#1e3a36'));
  pot(img, cx + 0.5, yb, Math.max(8, Math.round(size * 0.6)), ph, potR);
}

/** Rag rug (räsymatto) seen from above: weft stripes + fringe. */
export function ragRug(img: Img, x: number, y: number, w: number, h: number, cols: RGBA[], rnd: () => number) {
  const fr = hex('#f0e6d6');
  for (let j = 0; j < h; j++) {
    const band = cols[Math.floor((j * cols.length * 3) / h) % cols.length];
    const dark = mix(band, hex('#2a1838'), 0.25);
    for (let i = 0; i < w; i++) img.set(x + i, y + j, (i + j * 2) % 7 === 0 ? dark : band);
  }
  for (let j = 0; j < h; j += 2) {
    img.hline(x - 3, x - 1, y + j, fr);
    img.hline(x + w, x + w + 2, y + j, fr);
  }
  img.hline(x, x + w - 1, y + h, hex('#2a1838', 70));
  void rnd;
}

/** Paper sheet pinned on a wall. */
export function paper(img: Img, x: number, y: number, w: number, h: number, c: RGBA = hex('#fbf6e6'), pin?: RGBA) {
  img.rect(x + 1, y + 1, w, h, hex('#2a1838', 60));
  img.rect(x, y, w, h, c);
  img.vline(x + w - 1, y, y + h - 1, mix(c, hex('#8a7a9a'), 0.3));
  img.hline(x, x + w - 1, y + h - 1, mix(c, hex('#8a7a9a'), 0.3));
  if (pin) {
    img.set(x + (w >> 1), y + 1, pin);
    img.set(x + (w >> 1), y + 2, mix(pin, OUT, 0.5));
  }
}
/** Fake text lines (scribbles) on a sheet. */
export function lines(img: Img, x: number, y: number, w: number, n: number, c: RGBA, rnd: () => number, gap = 2) {
  for (let i = 0; i < n; i++) img.hline(x, x + Math.max(2, Math.round(w * (0.5 + rnd() * 0.5))) - 1, y + i * gap, c);
}

export function frameArt(img: Img, x: number, y: number, w: number, h: number, fr: Ramp, draw: (v: Img) => void) {
  img.rect(x + 2, y + 2, w, h, hex('#2a1838', 60));
  box(img, x, y, w, h, 0, fr, fr);
  const v = new Img(w - 4, h - 4);
  draw(v);
  img.blit(v, x + 2, y + 2);
}

export function steam(img: Img, x: number, y: number, n: number, c: RGBA = hex('#ffffff', 150)) {
  for (let i = 0; i < n; i++) {
    const yy = y - i * 3;
    const xx = x + (i % 2 ? 1 : -1);
    img.set(xx, yy, c);
    img.set(xx, yy - 1, c);
    img.set(xx + (i % 2 ? 1 : -1), yy - 2, c);
  }
}

export function lightBeam(img: Img, x0: number, y0: number, w: number, dx: number, len: number, c: RGBA) {
  // parallelogram from a window going down-right
  for (let j = 0; j < len; j++) {
    const off = Math.round((j * dx) / len);
    img.hline(x0 + off, x0 + off + w - 1, y0 + j, c);
  }
}

/** String of light bulbs hanging between two points. */
export function stringLights(img: Img, x0: number, y0: number, x1: number, y1: number, sag: number, cols: RGBA[], every = 8) {
  const n = Math.abs(x1 - x0);
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag);
    img.set(x, y, OUT);
    if (i % every === every >> 1) {
      const c = cols[k++ % cols.length];
      img.rect(x - 2, y + 1, 5, 5, alpha(c, 50));
      img.set(x, y + 1, OUT);
      img.rect(x - 1, y + 2, 3, 3, c);
      img.set(x - 1, y + 2, mix(c, hex('#ffffff'), 0.6));
    }
  }
}

export function signText(img: Img, s: string, cx: number, y: number, c: RGBA) {
  img.text(s, Math.round(cx - Img.textWidth(s) / 2), y, c);
}
