/**
 * Palette and drawing helpers for the 16-bit town map (tools/art/map.ts).
 * Light comes from the upper left; shadows lean purple/blue, highlights warm.
 * Every ramp is ordered dark -> light (index 0..4).
 */
import { Img, hex, type RGBA } from '../raster';

export type Ramp = RGBA[];
const ramp = (...h: string[]): Ramp => h.map((s) => hex(s));

export const OUT = hex('#2b1d2a');

export const R = {
  grass: ramp('#2c4a36', '#3d6a38', '#4f853b', '#64a043', '#82b94e', '#a8d066'),
  road: ramp('#6b5148', '#94775c', '#b89a74', '#d0b68b', '#e6d0a3'),
  stone: ramp('#3f3d52', '#615f78', '#8a8aa0', '#b5b6c4', '#dfe0e6'),
  water: ramp('#22356a', '#2c4f8c', '#3b6dab', '#5893cb', '#a3d5ee'),
  sand: ramp('#9e7b58', '#c4a271', '#dfc48e', '#efdcab', '#fbf0cf'),
  wood: ramp('#43272a', '#6a4231', '#8f6040', '#b5824f', '#d6a96a'),
  logs: ramp('#3a2228', '#5b3a2e', '#7c543a', '#a0714a', '#c99a66'),
  falu: ramp('#4c1b28', '#76262c', '#9b3631', '#bb4c3a', '#d66e4c'),
  white: ramp('#6f6e8e', '#a5a5bc', '#d2d0d8', '#efebe2', '#fffbee'),
  ochre: ramp('#74452c', '#a86f32', '#cf9a40', '#e8bc5c', '#f8db8c'),
  cream: ramp('#7a6040', '#b89a5a', '#dcc276', '#f0dc98', '#fcf0c4'),
  brick: ramp('#4a1f2a', '#78322f', '#9f4936', '#c06548', '#dc8c66'),
  roofDark: ramp('#1f1b30', '#302d48', '#46435f', '#5f5c7c', '#827fa0'),
  roofRed: ramp('#46192a', '#6f262e', '#953833', '#b85240', '#d6765a'),
  roofGreen: ramp('#1c3633', '#2a5044', '#3c6c53', '#578c64', '#80ad7c'),
  roofBrown: ramp('#33202a', '#4f3130', '#6c473a', '#8c6248', '#ad8460'),
  metal: ramp('#363950', '#555a72', '#7b8199', '#a6acc0', '#d2d6e2'),
  pale: ramp('#6a6378', '#9890a0', '#c2bab6', '#dcd4c6', '#f2ecdc'),
  beige: ramp('#6c584f', '#9e8872', '#c6b192', '#dfceac', '#f3e7c8'),
  bluegrey: ramp('#2e3550', '#46557a', '#62789c', '#86a0bc', '#b4cad8'),
  sage: ramp('#2e4038', '#4a6450', '#6d8a68', '#93ae86', '#bcd1a8'),
  concrete: ramp('#4e4a5c', '#76727f', '#9c98a0', '#bdb8b8', '#dcd7cf'),
  glass: ramp('#1e2244', '#2f4272', '#4f74a8', '#8fbcdc', '#dcf0f8'),
  lit: ramp('#8e4a2c', '#cf8238', '#f0b450', '#fcd77c', '#fff2bc'),
  spruce: ramp('#13262c', '#1c3d34', '#2a573c', '#3d7344', '#5a9050'),
  leaf: ramp('#284c2e', '#3f7334', '#5c963c', '#86b94c', '#b8da70'),
  skin: ramp('#7a3e36', '#b8705a', '#e2a682', '#f6cca6', '#ffe6cc'),
  hair: ramp('#2e1a24', '#4f2c28', '#7a4630', '#a46a40', '#c89058'),
  denim: ramp('#1c2040', '#2a3466', '#3c4e8e', '#5670b0', '#7c98cc'),
  flagBlue: ramp('#14306a', '#1f4796', '#2f62bc', '#4a80d6', '#7aa6ea'),
  orange: ramp('#7a2a1c', '#b8401e', '#e2602a', '#f48a3c', '#fcb466'),
  green: ramp('#123e2c', '#1c6038', '#28844a', '#3fa860', '#74cc86'),
};

export const F = {
  lupine: hex('#8456c4'),
  lupineHi: hex('#b48ae6'),
  lupinePink: hex('#d0609e'),
  lupinePinkHi: hex('#f094c4'),
  dandelion: hex('#f4cc38'),
  dandelionHi: hex('#fff09a'),
  daisy: hex('#f6f2e6'),
  red: hex('#d8443a'),
  redHi: hex('#f47a5c'),
  apple: hex('#d23a34'),
  pink: hex('#f0a0b8'),
  gold: hex('#f6cc4a'),
};

export const SHADOW = hex('#2e2350');

// ------------------------------------------------------------------ color utils
export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ];
}
export const withA = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], a];
const same = (a: RGBA, b: RGBA) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

// ------------------------------------------------------------------ hashing / noise
export function hash(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x: number, y: number, scale: number, s = 0): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, s);
  const b = hash(x0 + 1, y0, s);
  const c = hash(x0, y0 + 1, s);
  const d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ------------------------------------------------------------------ image utils
export function pad(src: Img, p = 1): Img {
  const out = new Img(src.w + p * 2, src.h + p * 2);
  out.blit(src, p, p);
  return out;
}

export const opaque = (img: Img, x: number, y: number) =>
  x >= 0 && y >= 0 && x < img.w && y < img.h && img.data[(y * img.w + x) * 4 + 3] > 0;

/**
 * Selective outline: transparent pixels next to the sprite get the dark outline,
 * except on the lit top/left edges where a darkened version of the neighbour is used.
 */
export function selOutline(img: Img, dark: RGBA = OUT) {
  const copy = new Img(img.w, img.h);
  copy.data.set(img.data);
  const op = (x: number, y: number) => opaque(copy, x, y);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (op(x, y)) continue;
      const r = op(x + 1, y);
      const b = op(x, y + 1);
      const l = op(x - 1, y);
      const t = op(x, y - 1);
      if (!r && !b && !l && !t) continue;
      if ((r || b) && !l && !t) {
        const n = r ? copy.get(x + 1, y) : copy.get(x, y + 1);
        img.set(x, y, mix(withA(n, 255), dark, 0.6));
      } else img.set(x, y, dark);
    }
}

/** Mirror horizontally. */
export function flipX(src: Img): Img {
  const out = new Img(src.w, src.h);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c[3]) out.set(src.w - 1 - x, y, c);
    }
  return out;
}

/** Copy only where the destination pixel already has colour `match` (used for masks). */
export function replace(img: Img, from: RGBA, to: RGBA) {
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (same(img.get(x, y), from)) img.set(x, y, to);
}

/** Draws a pixel grid (strings) with a legend; '.' and ' ' are transparent. */
export function grid(img: Img, x: number, y: number, rows: string[], legend: Record<string, RGBA>) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = legend[row[i]];
      if (c) img.set(x + i, y + j, c);
    }
  });
}

/** Accumulating shadow mask, applied once so overlapping shadows don't stack. */
export class ShadowMask {
  m: Uint8Array;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.m = new Uint8Array(w * h);
  }
  mark(x: number, y: number, v = 1) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (this.m[i] < v) this.m[i] = v;
  }
  /** Shadow of a sprite: its alpha mask shifted down-right. */
  sprite(src: Img, x: number, y: number, dx = 5, dy = 3) {
    for (let j = 0; j < src.h; j++)
      for (let i = 0; i < src.w; i++) if (src.data[(j * src.w + i) * 4 + 3] > 0) this.mark(x + i + dx, y + j + dy, 2);
    // softer fringe one pixel further out
    for (let j = 0; j < src.h; j++)
      for (let i = 0; i < src.w; i++) if (src.data[(j * src.w + i) * 4 + 3] > 0) this.mark(x + i + dx + 1, y + j + dy + 1, 1);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, v = 2) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) this.mark(x, y, d > 0.7 && v > 1 ? 1 : v);
      }
  }
  apply(img: Img, strength = 0.38) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const v = this.m[y * this.w + x];
        if (!v) continue;
        const c = img.get(x, y);
        img.set(x, y, withA(mix(c, SHADOW, v === 2 ? strength : strength * 0.55), 255));
      }
  }
}

// ------------------------------------------------------------------ building parts
export type WallKind = 'boards' | 'logs' | 'brick' | 'plaster' | 'panel' | 'stone';

/** Facade with texture; eave shadow at the top, darker plinth at the bottom. */
export function wall(img: Img, x: number, y: number, w: number, h: number, r: Ramp, kind: WallKind, seed = 1) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let c = r[2];
      if (kind === 'boards') {
        const k = (i + 1) % 4;
        c = k === 0 ? r[1] : k === 1 ? r[3] : r[2];
        if (k !== 0 && hash(Math.floor((i + 1) / 4), j >> 3, seed) < 0.12 && j % 8 === 3) c = r[1];
      } else if (kind === 'panel') {
        const k = j % 3;
        c = k === 2 ? r[1] : k === 0 ? r[3] : r[2];
      } else if (kind === 'logs') {
        const k = j % 4;
        c = k === 0 ? r[3] : k === 3 ? r[1] : r[2];
        if (k === 1 && hash(i >> 2, j >> 2, seed) < 0.08) c = r[3];
      } else if (kind === 'brick') {
        const row = Math.floor(j / 3);
        const k = j % 3;
        const off = row % 2 ? 3 : 0;
        const bi = Math.floor((i + off) / 6);
        if (k === 2) c = r[1];
        else if ((i + off) % 6 === 5) c = r[1];
        else {
          const v = hash(bi, row, seed);
          c = v < 0.18 ? mix(r[2], r[1], 0.45) : v > 0.85 ? r[3] : r[2];
          if (k === 0 && v > 0.5) c = mix(c, r[3], 0.5);
        }
      } else if (kind === 'stone') {
        const row = Math.floor(j / 5);
        const k = j % 5;
        const off = row % 2 ? 5 : 0;
        if (k === 4 || (i + off) % 10 === 9) c = r[1];
        else if (k === 0) c = r[3];
        else c = r[2];
      } else if (kind === 'plaster') {
        c = r[2];
      }
      img.set(x + i, y + j, c);
    }
  // lit left edge, shaded right edge
  img.vline(x, y, y + h - 1, r[3]);
  img.vline(x + w - 1, y, y + h - 1, r[1]);
  // eave shadow
  img.hline(x, x + w - 1, y, mix(r[1], SHADOW, 0.35));
  img.hline(x, x + w - 1, y + 1, r[1]);
  // plinth
  img.rect(x, y + h - 2, w, 2, R.stone[1]);
  img.hline(x, x + w - 1, y + h - 2, R.stone[2]);
}

/** Vertical corner board / pilaster. */
export function cornerBoard(img: Img, x: number, y: number, h: number, r: Ramp = R.white, w = 2) {
  img.rect(x, y, w, h, r[3]);
  img.vline(x, y, y + h - 1, r[4]);
  if (w > 1) img.vline(x + w - 1, y, y + h - 1, r[2]);
}

export interface WinOpts {
  lit?: boolean;
  frame?: Ramp;
  cross?: boolean;
  panes?: number;
  sill?: boolean;
  shutters?: Ramp;
  box?: boolean;
}

export function windowAt(img: Img, x: number, y: number, w: number, h: number, o: WinOpts = {}) {
  const fr = o.frame ?? R.white;
  img.rect(x - 1, y - 1, w + 2, h + 2, fr[3]);
  img.hline(x - 1, x + w, y - 1, fr[4]);
  img.vline(x + w, y, y + h, fr[1]);
  img.hline(x - 1, x + w, y + h, fr[2]);
  if (o.lit) {
    for (let j = 0; j < h; j++) img.hline(x, x + w - 1, y + j, j < h / 2 ? R.lit[3] : R.lit[2]);
    img.hline(x, x + w - 1, y, R.lit[1]);
    img.set(x + 1, y + 1, R.lit[4]);
  } else {
    for (let j = 0; j < h; j++) img.hline(x, x + w - 1, y + j, j < 2 ? R.glass[1] : R.glass[2]);
    img.hline(x, x + w - 1, y, R.glass[0]);
    // diagonal reflection
    for (let k = 0; k < Math.min(w, h); k++) {
      const px = x + w - 2 - k;
      const py = y + 1 + k;
      if (px >= x && py < y + h) img.set(px, py, R.glass[3]);
    }
  }
  if (o.cross ?? true) {
    if (w >= 4) img.vline(x + Math.floor((w - 1) / 2), y, y + h - 1, fr[3]);
    if (h >= 5) img.hline(x, x + w - 1, y + Math.floor(h / 2), fr[3]);
  }
  if (o.panes && o.panes > 2) for (let k = 1; k < o.panes; k++) img.vline(x + Math.round((k * w) / o.panes), y, y + h - 1, fr[3]);
  if (o.sill ?? true) {
    img.hline(x - 2, x + w + 1, y + h + 1, fr[4]);
    img.hline(x - 1, x + w + 1, y + h + 2, mix(fr[1], SHADOW, 0.3));
  }
  if (o.shutters) {
    const s = o.shutters;
    for (const sx of [x - 3, x + w + 1]) {
      img.rect(sx, y - 1, 2, h + 2, s[2]);
      img.vline(sx, y - 1, y + h, s[3]);
      for (let j = y; j < y + h; j += 2) img.set(sx + 1, j, s[1]);
    }
  }
  if (o.box) {
    img.rect(x - 1, y + h + 1, w + 2, 2, R.wood[2]);
    img.hline(x - 1, x + w, y + h + 2, R.wood[1]);
    for (let i = 0; i < w + 2; i += 2) img.set(x - 1 + i, y + h, i % 4 ? F.red : F.pink);
    img.set(x, y + h, R.leaf[3]);
    img.set(x + w - 1, y + h, R.leaf[3]);
  }
}

export interface DoorOpts {
  frame?: Ramp;
  glass?: boolean;
  double?: boolean;
  steps?: number;
  knob?: boolean;
}

export function door(img: Img, x: number, y: number, w: number, h: number, r: Ramp, o: DoorOpts = {}) {
  const fr = o.frame ?? R.white;
  img.rect(x - 1, y - 1, w + 2, h + 1, fr[3]);
  img.hline(x - 1, x + w, y - 1, fr[4]);
  img.vline(x + w, y, y + h - 1, fr[1]);
  img.rect(x, y, w, h, r[2]);
  img.hline(x, x + w - 1, y, r[0]);
  img.vline(x, y, y + h - 1, r[1]);
  if (o.glass) {
    img.rect(x + 1, y + 1, w - 2, h - 3, R.lit[2]);
    img.rect(x + 1, y + 1, w - 2, 2, R.lit[3]);
    if (o.double) img.vline(x + Math.floor(w / 2), y, y + h - 1, r[1]);
  } else {
    // panels
    const pw = o.double ? Math.floor((w - 3) / 2) : w - 3;
    const cols = o.double ? [x + 1, x + 2 + pw] : [x + 1];
    for (const px of cols) {
      img.rect(px + 0, y + 2, pw, Math.floor(h / 2) - 2, r[1]);
      img.rect(px + 0, y + Math.floor(h / 2) + 1, pw, h - Math.floor(h / 2) - 3, r[1]);
      img.hline(px, px + pw - 1, y + 2, r[0]);
      img.vline(px + pw, y + 2, y + h - 3, r[3]);
    }
    if (o.double) img.vline(x + Math.floor(w / 2), y, y + h - 1, r[0]);
  }
  if (o.knob ?? true) img.set(x + w - 2, y + Math.floor(h / 2) + 1, F.gold);
  const steps = o.steps ?? 1;
  for (let s = 0; s < steps; s++) {
    const sy = y + h + s;
    img.hline(x - 2 - s, x + w + 1 + s, sy, R.stone[3]);
    img.set(x + w + 1 + s, sy, R.stone[2]);
  }
}

/** Plank or painted sign board with 3x5 lettering. Returns the board box. */
export function sign(img: Img, cx: number, y: number, text: string, bg: Ramp, fg: RGBA, padX = 3) {
  const tw = Img.textWidth(text);
  const umlaut = /[ÄÖ]/.test(text);
  const w = tw + padX * 2;
  const h = umlaut ? 10 : 9;
  const x = Math.round(cx - w / 2);
  img.rect(x, y, w, h, bg[2]);
  img.hline(x, x + w - 1, y, bg[3]);
  img.hline(x, x + w - 1, y + h - 1, bg[1]);
  img.frame(x - 1, y - 1, w + 2, h + 2, OUT);
  img.text(text, x + padX, y + (umlaut ? 3 : 2), fg);
  // small shadow under the board
  img.hline(x, x + w, y + h + 1, withA(SHADOW, 90));
  return { x, y, w, h };
}

// ------------------------------------------------------------------ roofs
/**
 * Side-gable roof seen from above (ridge runs left-right).
 * x,y,w,h = full roof rectangle; the bottom row is the eave.
 */
export function roofSide(img: Img, x: number, y: number, w: number, h: number, r: Ramp, style: 'tile' | 'shingle' | 'metal' | 'felt' = 'tile', seed = 1) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let c = r[2];
      if (style === 'tile') {
        const row = Math.floor((j - 2) / 4);
        const k = (j - 2 + 400) % 4;
        const off = row % 2 ? 3 : 0;
        if (k === 3) c = r[1];
        else if (k === 0) c = r[3];
        else c = (i + off) % 6 === 0 ? r[1] : r[2];
      } else if (style === 'shingle') {
        const row = Math.floor(j / 3);
        const k = j % 3;
        const off = row % 2 ? 2 : 0;
        if (k === 2) c = r[1];
        else c = (i + off) % 4 === 0 ? r[1] : k === 0 && hash(i >> 2, row, seed) > 0.5 ? r[3] : r[2];
      } else if (style === 'metal') {
        const k = i % 3;
        c = k === 0 ? r[3] : k === 1 ? r[2] : r[1];
        if (j % 12 === 11) c = r[1];
      } else {
        // felt with batten seams
        c = i % 8 === 0 ? r[1] : i % 8 === 1 ? r[3] : r[2];
      }
      img.set(x + i, y + j, c);
    }
  // ridge highlight
  img.hline(x, x + w - 1, y, r[4]);
  img.hline(x, x + w - 1, y + 1, r[3]);
  // barge edges
  img.vline(x, y, y + h - 1, r[3]);
  img.vline(x + w - 1, y, y + h - 1, r[1]);
  // eave
  img.hline(x, x + w - 1, y + h - 1, r[0]);
  img.hline(x + 1, x + w - 2, y + h - 2, r[1]);
}

/**
 * Front-gable roof: gable triangle on the facade (apex at cx, apexY; eave corners at x0/x1, eaveY)
 * and the two slopes receding upward by `depth` pixels. The gable wall itself is filled with `wallR`.
 */
export function roofFront(
  img: Img,
  x0: number,
  x1: number,
  eaveY: number,
  apexY: number,
  depth: number,
  r: Ramp,
  wallR: Ramp | null,
  trim: Ramp = R.white,
) {
  const cx = (x0 + x1) / 2;
  const half = (x1 - x0) / 2;
  const edge = (x: number) => eaveY - (eaveY - apexY) * (1 - Math.abs(x - cx) / half);
  for (let x = x0; x <= x1; x++) {
    const ey = Math.round(edge(x));
    const left = x < cx;
    for (let y = ey - depth; y <= ey; y++) {
      const v = Math.round(y - (ey - depth));
      let c = left ? r[3] : r[1];
      if ((v + (left ? 0 : 2)) % 4 === 0) c = left ? r[2] : r[0];
      if (Math.abs(x - cx) < 1) c = r[4];
      if (y === ey - depth) c = left ? r[4] : r[2];
      img.set(x, y, c);
    }
    // barge board
    img.set(x, ey, trim[left ? 4 : 3]);
    img.set(x, ey + 1, trim[left ? 3 : 2]);
    if (wallR) for (let y = ey + 2; y < eaveY + 2; y++) img.set(x, y, (x - x0) % 4 === 0 ? wallR[1] : wallR[2]);
  }
}

/** Hipped roof (or pyramid when the ridge is empty). x,y,w,h = full bounding box. */
export function roofHip(img: Img, x: number, y: number, w: number, h: number, inset: number, r: Ramp) {
  const ridgeL = x + inset;
  const ridgeR = x + w - 1 - inset;
  for (let j = 0; j < h; j++) {
    const t = j / Math.max(1, h - 1);
    const xl = Math.round(ridgeL - (ridgeL - x) * t);
    const xr = Math.round(ridgeR + (x + w - 1 - ridgeR) * t);
    for (let i = xl; i <= xr; i++) {
      // which face: left triangle, right triangle, or front trapezoid
      const dl = (i - x) / Math.max(1, inset) - j / Math.max(1, h - 1);
      const dr = (x + w - 1 - i) / Math.max(1, inset) - j / Math.max(1, h - 1);
      let c: RGBA;
      if (dl < 0 && i < ridgeL) c = (j % 4 === 3 ? r[3] : r[4]);
      else if (dr < 0 && i > ridgeR) c = j % 4 === 3 ? r[0] : r[1];
      else c = j % 4 === 3 ? r[1] : (i + (Math.floor(j / 4) % 2) * 3) % 6 === 0 ? r[1] : r[2];
      img.set(i, y + j, c);
    }
    // hip lines
    img.set(xl, y + j, r[4]);
    img.set(xr, y + j, r[0]);
  }
  img.hline(ridgeL, ridgeR, y, r[4]);
  img.hline(x, x + w - 1, y + h - 1, r[0]);
}

/** Flat roof seen from above with a parapet. */
export function roofFlat(img: Img, x: number, y: number, w: number, h: number, r: Ramp, seed = 3) {
  img.rect(x, y, w, h, r[2]);
  for (let j = 2; j < h - 2; j++)
    for (let i = 2; i < w - 2; i++) {
      const v = hash(x + i, y + j, seed);
      if (v < 0.05) img.set(x + i, y + j, r[1]);
      else if (v > 0.96) img.set(x + i, y + j, r[3]);
    }
  // parapet
  img.hline(x, x + w - 1, y, r[4]);
  img.vline(x, y, y + h - 1, r[4]);
  img.hline(x, x + w - 1, y + h - 1, r[1]);
  img.vline(x + w - 1, y, y + h - 1, r[1]);
  img.hline(x + 1, x + w - 2, y + h - 2, r[3]);
  // inner shadow of parapet (light from upper left)
  img.hline(x + 1, x + w - 2, y + 1, r[1]);
  img.vline(x + 1, y + 1, y + h - 3, r[1]);
}

export function chimney(img: Img, x: number, y: number, h: number, r: Ramp = R.brick) {
  img.rect(x, y, 5, h, r[2]);
  img.vline(x, y, y + h - 1, r[3]);
  img.vline(x + 4, y, y + h - 1, r[1]);
  for (let j = y + 2; j < y + h; j += 3) img.hline(x + 1, x + 3, j, r[1]);
  img.rect(x - 1, y, 7, 2, R.stone[2]);
  img.hline(x - 1, x + 5, y, R.stone[3]);
  img.rect(x + 1, y, 3, 1, R.stone[0]);
}

// ------------------------------------------------------------------ nature sprites
/** Spruce sprite: layered tiers, lit from the left. s = height in px (16..34). */
export function spruceSprite(s: number, seed = 1): Img {
  const w = Math.round(s * 0.62) | 1;
  const img = new Img(w + 2, s + 2);
  const cx = Math.floor((w + 2) / 2);
  const r = R.spruce;
  const trunkH = Math.max(2, Math.round(s * 0.12));
  const top = 1;
  const base = s + 1 - trunkH;
  img.rect(cx - 1, base, 2, trunkH, R.wood[1]);
  img.set(cx - 1, base, R.wood[2]);
  const tiers = s < 20 ? 3 : 4;
  for (let t = 0; t < tiers; t++) {
    const ty0 = top + Math.round(((base - top) * t) / (tiers + 0.6));
    const ty1 = t === tiers - 1 ? base : top + Math.round(((base - top) * (t + 1.6)) / (tiers + 0.6));
    const hw = (w / 2) * (0.45 + (0.55 * (t + 1)) / tiers);
    for (let y = ty0; y <= ty1; y++) {
      const k = (y - ty0) / Math.max(1, ty1 - ty0);
      const half = Math.max(0.6, hw * Math.min(1, k * 1.15));
      for (let x = Math.round(cx - half); x <= Math.round(cx + half - 1); x++) {
        const rel = (x - cx + 0.5) / Math.max(1, half);
        let c = r[2];
        if (rel < -0.45) c = r[3];
        if (rel < -0.75 && k < 0.85) c = r[4];
        if (rel > 0.35) c = r[1];
        if (k > 0.82) c = rel > -0.2 ? r[0] : r[1];
        img.set(x, y, c);
      }
      // jagged bough tips at the bottom of the tier
      if (k > 0.75 && hash(t, y, seed) > 0.5) {
        img.set(Math.round(cx - half - 1), y, r[k > 0.9 ? 1 : 2]);
        img.set(Math.round(cx + half), y, r[0]);
      }
    }
  }
  img.set(cx - 1, 0, r[3]);
  img.set(cx - 1, 1, r[3]);
  selOutline(img, mix(OUT, r[0], 0.3));
  return img;
}

/** Deciduous (birch / apple) canopy made of rounded clusters. */
export function leafyTree(s: number, kind: 'birch' | 'apple' | 'rowan', seed = 1): Img {
  const w = Math.round(s * 0.85);
  const img = new Img(w + 4, s + 2);
  const cx = (w + 4) / 2;
  const r = kind === 'birch' ? R.leaf : R.grass.slice(1);
  const trunkH = Math.round(s * 0.42);
  const ground = s;
  // trunk
  const bark = kind === 'birch' ? R.white : R.wood;
  img.rect(Math.floor(cx) - 1, ground - trunkH, 2, trunkH + 1, bark[3]);
  img.vline(Math.floor(cx), ground - trunkH, ground, bark[kind === 'birch' ? 2 : 1]);
  if (kind === 'birch')
    for (let y = ground - trunkH + 2; y <= ground; y += 3) img.set(Math.floor(cx) - 1 + (y % 2), y, OUT);
  // canopy blobs
  const rnd = (k: number) => hash(k, seed, 77);
  const canopyR = w / 2;
  const ccy = ground - trunkH - canopyR * 0.55;
  const blobs: [number, number, number][] = [[cx, ccy, canopyR * 0.8]];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rnd(k) * 0.6;
    blobs.push([cx + Math.cos(a) * canopyR * 0.45, ccy + Math.sin(a) * canopyR * 0.38, canopyR * (0.42 + rnd(k + 9) * 0.12)]);
  }
  const inside = (x: number, y: number) => blobs.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 <= br * br);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      // light from upper-left: test offsets
      const lit = !inside(x - 1.5, y - 1.5);
      const shade = !inside(x + 1.5, y + 2);
      const deep = !inside(x + 2.5, y + 3.5);
      // cluster texture: small bumps
      const bump = vnoise(x, y, 3, seed);
      let c = r[2];
      if (bump > 0.62) c = r[3];
      if (y > ccy + canopyR * 0.15) c = bump > 0.7 ? r[2] : r[1];
      if (lit) c = r[4];
      else if (shade) c = deep ? r[0] : r[1];
      img.set(x, y, c);
    }
  if (kind === 'apple')
    for (let k = 0; k < 6; k++) {
      const ax = Math.round(cx - canopyR * 0.6 + rnd(k + 20) * canopyR * 1.2);
      const ay = Math.round(ccy - canopyR * 0.3 + rnd(k + 30) * canopyR * 0.8);
      if (opaque(img, ax, ay)) {
        img.set(ax, ay, F.apple);
        img.set(ax, ay - 1, F.redHi);
      }
    }
  selOutline(img, mix(OUT, r[0], 0.3));
  return img;
}

export function rockSprite(w: number, h: number, seed = 1): Img {
  const img = new Img(w + 2, h + 2);
  const cx = (w + 2) / 2;
  const cy = (h + 2) / 2 + 0.5;
  const r = R.stone;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const d = ((x + 0.5 - cx) / (w / 2)) ** 2 + ((y + 0.5 - cy) / (h / 2)) ** 2;
      if (d > 1) continue;
      const nx = (x + 0.5 - cx) / (w / 2);
      const ny = (y + 0.5 - cy) / (h / 2);
      const l = -nx * 0.6 - ny * 0.8;
      let c = l > 0.45 ? r[4] : l > 0 ? r[3] : l > -0.5 ? r[2] : r[1];
      if (ny < -0.2 && hash(x >> 1, y, seed) > 0.45 && nx > -0.5) c = l > 0.3 ? R.leaf[3] : R.leaf[2];
      img.set(x, y, c);
    }
  selOutline(img);
  return img;
}
