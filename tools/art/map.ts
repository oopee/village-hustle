/**
 * 16-bit SNES-JRPG style town map of Ryttylä: background, buildings, animated
 * overlays, foreground canopies and the walking player sprite.
 * Pure function; nothing runs at import time.
 */
import { Img, rng, type RGBA } from '../raster';
import { BUILDERS } from './map-buildings';
import * as D from './map-decor';
import { buildPlayer } from './map-player';
import {
  F,
  R,
  ShadowMask,
  hash,
  leafyTree,
  mix,
  pad,
  rockSprite,
  selOutline,
  spruceSprite,
  vnoise,
  withA,
} from './map-kit';
import { EDGES, LOCATIONS, LOCATION_NODE, type LocationId, type MapArt, type Overlay } from './types';

const W = 640;
const H = 360;
const ROAD_HW = 7;

export const NODES: Record<string, [number, number]> = {
  parents_house: [36, 112],
  job_centre: [168, 112],
  station: [320, 112],
  bank: [456, 112],
  sawmill: [604, 112],
  department_store: [604, 178],
  health_centre: [604, 246],
  cottage: [604, 312],
  sauna: [440, 312],
  village_shop: [320, 312],
  grill: [176, 312],
  rental_flat: [36, 312],
  opisto: [36, 246],
  library: [36, 178],
  crossroads: [320, 200],
};

/** How each building sits relative to its node (door faces the road). */
type Place = 'above' | 'rightOf' | 'leftOf' | 'cornerRight' | 'cornerLeft';
const PLACE: Record<LocationId, Place> = {
  parents_house: 'above',
  job_centre: 'above',
  station: 'above',
  bank: 'above',
  sawmill: 'above',
  department_store: 'leftOf',
  health_centre: 'leftOf',
  cottage: 'cornerLeft',
  sauna: 'above',
  village_shop: 'cornerLeft',
  grill: 'above',
  rental_flat: 'cornerRight',
  opisto: 'rightOf',
  library: 'rightOf',
  dance_pavilion: 'rightOf',
};

interface Placed {
  id: LocationId;
  img: Img;
  x: number;
  y: number;
  door: [number, number];
  anchors: Record<string, [number, number]>;
}

// ------------------------------------------------------------------ geometry helpers
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

class Mask {
  m: Uint8Array;
  constructor() {
    this.m = new Uint8Array(W * H);
  }
  get(x: number, y: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    return x < 0 || y < 0 || x >= W || y >= H ? 1 : this.m[y * W + x];
  }
  set(x: number, y: number, v = 1) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < W && y < H) this.m[y * W + x] = v;
  }
  rect(x: number, y: number, w: number, h: number, v = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, v);
  }
  anyIn(x: number, y: number, w: number, h: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.get(x + i, y + j)) return true;
    return false;
  }
}

// ------------------------------------------------------------------ placement
function placeBuildings(): Placed[] {
  return LOCATIONS.map((id) => {
    const art = BUILDERS[id]();
    const img = pad(art.img);
    selOutline(img);
    const [nx, ny] = NODES[LOCATION_NODE[id]];
    const dx = art.door[0] + 1;
    let x = 0;
    let y = 0;
    switch (PLACE[id]) {
      case 'above':
        x = nx - dx;
        y = ny - 4 - img.h;
        break;
      case 'rightOf':
        x = nx + ROAD_HW + 2;
        y = ny - 1 - img.h;
        break;
      case 'leftOf':
        x = nx - ROAD_HW - 1 - img.w;
        y = ny - 1 - img.h;
        break;
      case 'cornerRight':
        x = nx + ROAD_HW + 2;
        y = ny - 4 - img.h;
        break;
      case 'cornerLeft':
        x = nx - ROAD_HW - 1 - img.w;
        y = ny - 4 - img.h;
        break;
    }
    const anchors: Record<string, [number, number]> = {};
    for (const [k, [ax, ay]] of Object.entries(art.anchors)) anchors[k] = [x + ax + 1, y + ay + 1];
    return { id, img, x, y, door: [x + dx, y + art.door[1] + 1], anchors };
  });
}

// ------------------------------------------------------------------ ground layers
const G = R.grass;
// gentle patch tones between the ramp steps, so meadows don't read as camouflage
const G_LIGHT = mix(G[3], G[4], 0.5);
const G_DARK = mix(G[3], G[2], 0.5);

function grass(bg: Img) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = vnoise(x, y, 34, 11) * 0.7 + vnoise(x, y, 13, 12) * 0.3;
      bg.set(x, y, n > 0.66 ? G_LIGHT : n < 0.3 ? G_DARK : G[3]);
    }
}

function isGrass(c: RGBA): boolean {
  const same = (a: RGBA) => a[0] === c[0] && a[1] === c[1] && a[2] === c[2];
  return same(G[3]) || same(G_LIGHT) || same(G_DARK);
}

/** Small grass tufts on a jittered grid. */
function tufts(bg: Img, free: (x: number, y: number) => boolean) {
  for (let cy = 0; cy < H / 7; cy++)
    for (let cx = 0; cx < W / 8; cx++) {
      const h = hash(cx, cy, 5);
      if (h > 0.5) continue;
      const x = cx * 8 + Math.floor(hash(cx, cy, 6) * 6);
      const y = cy * 7 + Math.floor(hash(cx, cy, 7) * 5);
      if (!free(x, y) || !free(x + 3, y + 2)) continue;
      if (!isGrass(bg.get(x, y))) continue;
      const dark = G[2];
      const lite = G[4];
      if (h < 0.25) {
        // "vv" tuft
        bg.set(x, y, dark);
        bg.set(x + 2, y, dark);
        bg.set(x + 1, y + 1, dark);
        bg.set(x + 3, y + 1, dark);
        bg.set(x + 1, y, lite);
      } else {
        // blade pair
        bg.set(x, y, lite);
        bg.set(x, y + 1, dark);
        bg.set(x + 2, y + 1, lite);
        bg.set(x + 2, y + 2, dark);
      }
    }
}

function flowers(bg: Img, free: (x: number, y: number) => boolean, r: () => number) {
  // meadow clusters
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(r() * W);
    const y = 46 + Math.floor(r() * (H - 46));
    if (vnoise(x, y, 46, 21) < 0.52) continue;
    const kind = r();
    const n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const fx = x + Math.floor((r() - 0.5) * 9);
      const fy = y + Math.floor((r() - 0.5) * 6);
      if (!free(fx - 1, fy - 3) || !free(fx + 1, fy + 2)) continue;
      if (kind < 0.35) {
        // lupine spike
        const pink = r() < 0.4;
        bg.set(fx, fy - 2, pink ? F.lupinePinkHi : F.lupineHi);
        bg.set(fx, fy - 1, pink ? F.lupinePink : F.lupine);
        bg.set(fx, fy, pink ? F.lupinePink : F.lupine);
        bg.set(fx, fy + 1, G[1]);
        bg.set(fx - 1, fy + 1, G[2]);
        bg.set(fx + 1, fy + 1, G[2]);
      } else if (kind < 0.7) {
        bg.set(fx, fy, F.dandelion);
        bg.set(fx, fy - 1, F.dandelionHi);
        bg.set(fx + 1, fy + 1, G[1]);
      } else {
        // clover: white flower with leaves
        bg.set(fx, fy, F.daisy);
        bg.set(fx - 1, fy + 1, G[2]);
        bg.set(fx + 1, fy + 1, G[2]);
        bg.set(fx, fy + 1, G[1]);
      }
    }
  }
}

// ------------------------------------------------------------------ water
interface WaterOpts {
  inside: (x: number, y: number) => boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  beach?: (x: number, y: number) => boolean;
}

function water(bg: Img, wm: Mask, o: WaterOpts) {
  const Wt = R.water;
  if (o.beach)
    for (let y = o.y0 - 10; y <= o.y1 + 10; y++)
      for (let x = o.x0 - 10; x <= o.x1 + 10; x++) {
        if (!o.beach(x, y) || o.inside(x, y)) continue;
        const sx = o.beach(x - 1, y - 1);
        let c = R.sand[2];
        if (!sx) c = R.sand[3];
        if (o.inside(x, y + 1) || o.inside(x, y + 2)) c = R.sand[1];
        if (hash(x, y, 31) < 0.03) c = R.sand[1];
        bg.set(x, y, c);
      }
  for (let y = o.y0; y <= o.y1; y++)
    for (let x = o.x0; x <= o.x1; x++) {
      if (!o.inside(x, y)) continue;
      wm.set(x, y);
      // distance to shore (cheap, capped)
      let d = 9;
      for (let k = 1; k < 9 && d === 9; k++)
        if (!o.inside(x, y - k) || !o.inside(x - k, y) || !o.inside(x + k, y) || !o.inside(x, y + k)) d = k;
      const shoreAbove = !o.inside(x, y - 1) || !o.inside(x, y - 2);
      let c = d <= 2 ? Wt[3] : d <= 5 ? Wt[2] : Wt[1];
      if (shoreAbove) c = Wt[1];
      if (!o.inside(x, y - 1)) c = Wt[0];
      if (d === 1 && !shoreAbove) c = Wt[4];
      bg.set(x, y, c);
    }
  // ripple highlights
  for (let y = o.y0 + 3; y <= o.y1; y += 3)
    for (let x = o.x0; x <= o.x1; x++) {
      if (hash(Math.floor(x / 5), y, 41) > 0.16) continue;
      if (!o.inside(x - 3, y - 3) || !o.inside(x + 6, y + 3)) continue;
      const len = 2 + Math.floor(hash(x, y, 42) * 4);
      for (let k = 0; k < len; k++) bg.set(x + k, y, Wt[3]);
      x += 12;
    }
}

// ------------------------------------------------------------------ roads
function roads(bg: Img, rm: Mask, placed: Placed[]) {
  const segs = EDGES.map(([a, b]) => [...NODES[a], ...NODES[b]] as [number, number, number, number]);
  // short paths from side doors to the road
  const paths: [number, number, number, number][] = [];
  for (const p of placed) {
    if (PLACE[p.id] === 'rightOf' || PLACE[p.id] === 'leftOf') {
      const [nx, ny] = NODES[LOCATION_NODE[p.id]];
      paths.push([p.door[0], p.door[1] - 2, p.door[0], ny]);
      paths.push([p.door[0], ny, nx, ny]);
    }
  }
  const [cx, cy] = NODES.crossroads;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let d = 99;
      for (const s of segs) d = Math.min(d, segDist(x, y, ...s));
      if (d <= ROAD_HW - 0.5) rm.set(x, y, 1);
      else if (Math.hypot(x - cx, y - cy) <= 11.5) rm.set(x, y, 1);
      else {
        for (const s of paths) if (segDist(x, y, ...s) <= 3.5) rm.set(x, y, 2);
      }
    }
  const Rd = R.road;
  const isR = (x: number, y: number) => rm.get(x, y) > 0 && !(x < 0 || y < 0 || x >= W || y >= H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (isR(x, y)) {
        let c = Rd[3];
        const h = hash(x, y, 7);
        if (h < 0.03) c = Rd[4];
        else if (h > 0.97) c = Rd[2];
        if (!isR(x, y - 1)) c = Rd[1];
        else if (!isR(x, y - 2)) c = Rd[2];
        else if (!isR(x - 1, y)) c = Rd[2];
        else if (!isR(x, y + 1) || !isR(x + 1, y)) c = Rd[4];
        bg.set(x, y, c);
        if (h < 0.03 && isR(x + 1, y + 1)) bg.set(x + 1, y + 1, Rd[1]);
      } else {
        // grass lip around the road
        if (isR(x, y - 1) || isR(x - 1, y)) bg.set(x, y, G[4]);
        else if (isR(x, y + 1) || isR(x + 1, y)) bg.set(x, y, G[1]);
      }
    }
  // wheel tracks on long straight runs
  for (const [ax, ay, bx, by] of segs) {
    if (ay === by) {
      for (let x = Math.min(ax, bx) + 9; x <= Math.max(ax, bx) - 9; x++)
        for (const ty of [ay - 3, ay + 2]) if (hash(x >> 2, ty, 9) > 0.18 && bg.get(x, ty)[0] === Rd[3][0]) bg.set(x, ty, Rd[2]);
    } else if (ax === bx) {
      for (let y = Math.min(ay, by) + 9; y <= Math.max(ay, by) - 9; y++)
        for (const tx of [ax - 3, ax + 2]) if (hash(tx, y >> 2, 9) > 0.18 && bg.get(tx, y)[0] === Rd[3][0]) bg.set(tx, y, Rd[2]);
    }
  }
  // edge stones
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (rm.get(x, y) !== 1) continue;
      const edge = !isR(x, y + 1) || !isR(x + 1, y) || !isR(x, y - 1) || !isR(x - 1, y);
      if (!edge || hash(x, y, 13) > 0.025) continue;
      if (rm.get(x + 2, y) === 2 || rm.get(x - 2, y) === 2) continue;
      bg.set(x, y, mix(R.stone[3], Rd[4], 0.5));
      bg.set(x + 1, y, mix(R.stone[2], Rd[2], 0.5));
      bg.set(x, y + 1, mix(R.stone[2], Rd[2], 0.5));
      bg.set(x + 1, y + 1, Rd[1]);
    }
}

/** Lupine clumps lining the verges (classic Finnish roadside). */
function roadsideLupines(bg: Img, rm: Mask, free: (x: number, y: number) => boolean) {
  for (const [a, b] of EDGES) {
    const [ax, ay] = NODES[a];
    const [bx, by] = NODES[b];
    const len = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    for (let t = 16; t < len - 16; t += 14) {
      for (const side of [-1, 1]) {
        if (hash(Math.round(t), ax + ay + side, 17) > 0.45) continue;
        const off = ROAD_HW + 3 + Math.floor(hash(t, side, 18) * 3);
        const cx = Math.round(ax + ux * t - uy * off * side);
        const cy = Math.round(ay + uy * t + ux * off * side);
        for (let k = 0; k < 4; k++) {
          const fx = cx + (k % 2) * 2 - 1 + (k > 1 ? 1 : 0);
          const fy = cy + (k > 1 ? 2 : 0);
          if (!free(fx, fy - 3) || !free(fx, fy + 1) || rm.get(fx, fy + 1)) continue;
          const pink = hash(fx, fy, 19) < 0.3;
          bg.set(fx, fy - 3, pink ? F.lupinePinkHi : F.lupineHi);
          bg.set(fx, fy - 2, pink ? F.lupinePinkHi : F.lupineHi);
          bg.set(fx, fy - 1, pink ? F.lupinePink : F.lupine);
          bg.set(fx, fy, pink ? F.lupinePink : F.lupine);
          bg.set(fx, fy + 1, G[1]);
          bg.set(fx - 1, fy + 1, G[2]);
          bg.set(fx + 1, fy, G[2]);
        }
      }
    }
  }
}

/** Warm summer-evening split tone: honeyed highlights, violet shadows. */
function eveningGrade(img: Img) {
  const hi = [255, 217, 160];
  const lo = [58, 42, 90];
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    let t = 0;
    let c = hi;
    if (lum > 0.5) t = (lum - 0.5) * 0.25;
    else if (lum < 0.35) {
      t = (0.35 - lum) * 0.3;
      c = lo;
    }
    if (t <= 0) continue;
    for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] + (c[k] - d[i + k]) * t);
  }
}

// ------------------------------------------------------------------ fields
function potatoField(bg: Img, x0: number, y0: number, w: number, h: number) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y % 5;
      let c = k === 4 ? R.wood[1] : k === 3 ? R.wood[2] : R.wood[2];
      if (k <= 2) {
        // leafy row
        const v = hash((x + (y % 10 < 5 ? 0 : 2)) >> 1, Math.floor(y / 5), 51);
        c = k === 0 ? (v > 0.3 ? G[4] : G[3]) : k === 1 ? (v > 0.2 ? G[3] : G[2]) : G[1];
        if (k === 0 && hash(x, y, 52) < 0.06) c = F.daisy;
      }
      bg.set(x0 + x, y0 + y, c);
    }
  bg.hline(x0, x0 + w - 1, y0 + h, R.wood[0]);
}

function hayField(bg: Img, x0: number, y0: number, w: number, h: number) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = (y + Math.floor(x / 40)) % 6;
      let c = k < 3 ? mix(G[4], R.cream[3], 0.35) : G[4];
      if (k === 2) c = mix(G[4], R.cream[2], 0.4);
      if (k === 5 && hash(x >> 1, y, 61) < 0.25) c = G[3];
      bg.set(x0 + x, y0 + y, c);
    }
}

function grainField(bg: Img, x0: number, y0: number, w: number, h: number) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y % 3;
      // neat rows of ripening barley: lit ear tops, mid stalks, shaded furrow
      let c = k === 0 ? R.ochre[4] : k === 1 ? R.ochre[3] : R.ochre[2];
      if (k === 0 && (x + y) % 4 === 0) c = R.ochre[3];
      if (k === 2 && (x + (y >> 1)) % 5 === 0) c = R.ochre[1];
      if (y < 1) c = mix(R.ochre[4], R.cream[4], 0.5);
      bg.set(x0 + x, y0 + y, c);
    }
  bg.hline(x0, x0 + w - 1, y0 + h, R.ochre[1]);
}

// ------------------------------------------------------------------ top band (forest, rails, platform)
function topBand(bg: Img) {
  bg.rect(0, 0, W, 20, R.spruce[1]);
  for (let y = 18; y < 42; y++)
    for (let x = 0; x < W; x++) {
      const h = hash(x, y, 81);
      bg.set(x, y, h < 0.3 ? R.stone[1] : h > 0.85 ? R.stone[3] : R.stone[2]);
    }
  for (const [r0, r1] of [
    [23, 29],
    [33, 39],
  ]) {
    for (let x = 0; x < W; x += 4) bg.rect(x, r0, 2, r1 - r0 + 1, R.wood[1]);
    for (const ry of [r0 + 1, r1 - 1]) {
      bg.hline(0, W - 1, ry, R.stone[4]);
      bg.hline(0, W - 1, ry + 1, R.stone[0]);
    }
  }
  // catenary masts
  for (let x = 12; x < W; x += 96) {
    bg.rect(x, 14, 2, 28, R.concrete[2]);
    bg.vline(x, 14, 41, R.concrete[3]);
    bg.hline(x - 2, x + 8, 21, R.metal[1]);
  }
  // platform
  bg.rect(244, 40, 156, 8, R.concrete[3]);
  bg.hline(244, 399, 40, R.concrete[4]);
  bg.hline(244, 399, 41, F.dandelion);
  for (let x = 244; x < 400; x += 6) bg.vline(x, 43, 47, R.concrete[2]);
  bg.hline(244, 399, 48, R.concrete[1]);
  // fence along the rails
  for (let x = 0; x < W; x++) {
    if (x >= 240 && x < 404) continue;
    bg.set(x, 43, R.wood[3]);
    bg.set(x, 45, R.wood[2]);
    if (x % 6 === 0) bg.vline(x, 42, 47, R.wood[1]);
  }
  // forest band behind the rails
  const r = rng(7);
  const trees: [number, number, number][] = [];
  for (let i = 0; i < 120; i++) trees.push([Math.floor(r() * (W + 20)) - 10, 4 + Math.floor(r() * 16), 18 + Math.floor(r() * 10)]);
  trees.sort((a, b) => a[1] - b[1]);
  for (const [x, y, s] of trees) {
    const sp = spruceSprite(s, x);
    bg.blit(sp, x - Math.floor(sp.w / 2), y - sp.h + 2);
  }
}

// ------------------------------------------------------------------ overlays
function sheetOf(frames: Img[]): { img: Img; frameWidth: number; frameHeight: number } {
  const fw = frames[0].w;
  const fh = frames[0].h;
  const img = new Img(fw * frames.length, fh);
  frames.forEach((f, i) => img.blit(f, i * fw, 0));
  return { img, frameWidth: fw, frameHeight: fh };
}

function smokeSheet(big = false): Img[] {
  const fw = big ? 14 : 10;
  const fh = big ? 22 : 20;
  const out: Img[] = [];
  const light: RGBA = [236, 232, 240, 0];
  const mid: RGBA = [200, 194, 214, 0];
  for (let f = 0; f < 4; f++) {
    const img = new Img(fw, fh);
    for (let k = 0; k < 4; k++) {
      const p = ((k + f / 4) / 4) % 1;
      const cx = 3 + p * (fw - 7) + Math.sin(p * 6 + k) * 0.8;
      const cy = fh - 3 - p * (fh - 6);
      const rr = (big ? 1.8 : 1.2) + p * (big ? 3 : 2.2);
      const a = Math.round(220 * (1 - p * 0.85));
      img.disc(cx, cy, rr, withA(mid, a));
      img.disc(cx - rr * 0.35, cy - rr * 0.35, rr * 0.6, withA(light, a));
    }
    out.push(img);
  }
  return out;
}

function flagSheet(): Img[] {
  const out: Img[] = [];
  for (let f = 0; f < 4; f++) {
    const img = new Img(13, 10);
    for (let i = 0; i < 12; i++) {
      const wave = Math.sin(i * 0.7 - f * (Math.PI / 2));
      const off = Math.round(wave * (i / 11) * 1.4);
      const slope = Math.cos(i * 0.7 - f * (Math.PI / 2));
      for (let j = 0; j < 7; j++) {
        const blue = i === 3 || i === 4 || j === 3;
        const ramp = blue ? R.flagBlue : R.white;
        const c = slope > 0.4 ? ramp[blue ? 3 : 4] : slope < -0.4 ? ramp[blue ? 1 : 2] : ramp[blue ? 2 : 3];
        img.set(i, j + 1 + off, c);
      }
    }
    out.push(img);
  }
  return out;
}

function lightsSheet(w: number): Img[] {
  const out: Img[] = [];
  const cols: RGBA[] = [R.lit[4], F.pink, F.dandelionHi, R.flagBlue[4]];
  for (let f = 0; f < 3; f++) {
    const img = new Img(w, 6);
    for (let x = 0; x < w; x++) {
      const seg = x % 16;
      const sag = Math.round(Math.sin((seg / 16) * Math.PI) * 2);
      img.set(x, 1 + sag, withA(R.roofDark[0], 200));
      if (x % 4 === 2) {
        const k = Math.floor(x / 4);
        const on = (k + f) % 3 !== 0;
        const c = cols[k % cols.length];
        img.set(x, 2 + sag, on ? c : mix(c, R.roofDark[1], 0.6));
        if (on) {
          img.set(x, 3 + sag, withA(c, 110));
          img.set(x - 1, 2 + sag, withA(c, 70));
          img.set(x + 1, 2 + sag, withA(c, 70));
        }
      }
    }
    out.push(img);
  }
  return out;
}

function fireSheet(): Img[] {
  const shapes = [
    ['..y..', '.yYy.', '.YoY.', 'yOoOy', '.ror.'],
    ['.y...', '..Y..', '.yYy.', 'yOoOy', '.ror.'],
    ['...y.', '..Y..', '.yYy.', 'yOoOy', '.ror.'],
  ];
  const leg: Record<string, RGBA> = { y: F.dandelion, Y: F.dandelionHi, o: R.orange[3], O: R.orange[2], r: F.red };
  return shapes.map((rows) => {
    const img = new Img(5, 5);
    rows.forEach((row, j) => {
      for (let i = 0; i < 5; i++) if (leg[row[i]]) img.set(i, j, leg[row[i]]);
    });
    return img;
  });
}

function shimmerSheet(wm: Mask, x0: number, y0: number, w: number, h: number, seed: number): Img[] {
  const r = rng(seed);
  const out: Img[] = [];
  for (let f = 0; f < 3; f++) {
    const img = new Img(w, h);
    let n = 0;
    for (let tries = 0; tries < 400 && n < Math.max(4, Math.floor((w * h) / 260)); tries++) {
      const x = Math.floor(r() * (w - 6));
      const y = Math.floor(r() * (h - 2)) + 1;
      if (!wm.get(x0 + x - 2, y0 + y - 2) || !wm.get(x0 + x + 6, y0 + y + 2)) continue;
      const len = 2 + Math.floor(r() * 3);
      for (let k = 0; k < len; k++) img.set(x + k, y, withA(R.water[4], 230));
      img.set(x + 1, y - 1, withA(R.white[4], 200));
      n++;
    }
    out.push(img);
  }
  return out;
}

function butterflySheet(): Img[] {
  const out: Img[] = [];
  const cols: [RGBA, RGBA][] = [
    [R.white[4], R.white[2]],
    [F.dandelion, R.ochre[2]],
  ];
  for (let f = 0; f < 4; f++) {
    const img = new Img(24, 14);
    for (let b = 0; b < 2; b++) {
      const t = (f / 4) * Math.PI * 2 + b * 2;
      const x = Math.round(8 + b * 8 + Math.cos(t) * 4);
      const y = Math.round(6 + Math.sin(t * 2) * 3);
      const [c, d] = cols[b];
      if (f % 2 === 0) {
        img.set(x - 1, y, c);
        img.set(x + 1, y, c);
        img.set(x - 1, y + 1, d);
        img.set(x + 1, y + 1, d);
      } else {
        img.set(x, y - 1, c);
        img.set(x, y, d);
      }
      img.set(x, y + (f % 2 === 0 ? 0 : 1), R.roofDark[1]);
    }
    out.push(img);
  }
  return out;
}

// ------------------------------------------------------------------ main
export function buildMap(): MapArt {
  const r = rng(1938);
  const placed = placeBuildings();
  const bg = new Img(W, H);
  const fg = new Img(W, H);
  const blocked = new Mask();
  const roadM = new Mask();
  const waterM = new Mask();
  const shadow = new ShadowMask(W, H);

  for (const p of placed) blocked.rect(p.x - 2, p.y, p.img.w + 4, p.img.h + 3);

  grass(bg);
  topBand(bg);
  blocked.rect(0, 0, W, 50);

  // ---- fields
  potatoField(bg, 136, 200, 172, 36);
  blocked.rect(134, 198, 176, 40);
  hayField(bg, 336, 206, 168, 44);
  blocked.rect(334, 204, 172, 48);
  grainField(bg, 112, 328, 138, 32);
  blocked.rect(110, 326, 142, 34);

  // ---- water: Ykslammi lake (bottom, by the sauna) and Kolmilammi pond
  const lake = (x: number, y: number) => ((x - 468) / 104) ** 2 + ((y - 372) / 46) ** 2 + (vnoise(x, y, 14, 91) - 0.5) * 0.18 < 1;
  const beach = (x: number, y: number) =>
    y > 319 && (((x - 468) / 112) ** 2 + ((y - 370) / 52) ** 2 + (vnoise(x, y, 14, 91) - 0.5) * 0.18 < 1 || (x > 404 && x < 486 && y < 330));
  water(bg, waterM, { inside: lake, x0: 360, y0: 320, x1: 575, y1: 359, beach });
  const pond = (x: number, y: number) => ((x - 464) / 40) ** 2 + ((y - 163) / 27) ** 2 + (vnoise(x, y, 10, 92) - 0.5) * 0.25 < 1;
  // grassy bank ring around the pond
  for (let y = 128; y < 200; y++)
    for (let x = 418; x < 512; x++)
      if (!pond(x, y) && ((x - 464) / 43) ** 2 + ((y - 163) / 30) ** 2 < 1) bg.set(x, y, y < 163 ? G[2] : G[4]);
  water(bg, waterM, { inside: pond, x0: 420, y0: 132, x1: 508, y1: 194 });
  blocked.rect(360, 318, 216, 42);
  blocked.rect(418, 128, 94, 72);
  // lily pads
  for (const [lx, ly, fl] of [
    [446, 170, 1],
    [452, 174, 0],
    [478, 152, 1],
    [486, 168, 0],
    [470, 180, 0],
    [440, 158, 0],
  ] as [number, number, number][]) {
    // round pad, dark rim below, lit top-left, wedge notch showing water
    bg.ellipse(lx, ly + 0.4, 2.8, 2.0, R.green[1]);
    bg.ellipse(lx - 0.3, ly - 0.2, 2.4, 1.6, R.green[2]);
    bg.hline(lx - 2, lx - 1, ly - 1, R.green[3]);
    bg.set(lx - 1, ly - 2, R.green[4]);
    bg.set(lx + 1, ly, R.water[2]);
    bg.set(lx + 2, ly, R.water[2]);
    bg.set(lx + 2, ly - 1, R.water[2]);
    if (fl) {
      bg.set(lx - 1, ly - 1, F.pink);
      bg.set(lx, ly - 1, R.white[4]);
      bg.set(lx - 1, ly - 2, R.white[4]);
    }
  }
  // reeds on the pond shore
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const rx = Math.round(464 + Math.cos(a) * 41);
    const ry = Math.round(163 + Math.sin(a) * 28);
    if (Math.sin(a) < -0.3 && r() < 0.5) continue;
    bg.vline(rx, ry - 3, ry, R.sage[2]);
    bg.set(rx, ry - 3, R.wood[1]);
    bg.set(rx + 1, ry - 1, R.sage[3]);
  }

  // ---- roads
  roads(bg, roadM, placed);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (roadM.get(x, y)) blocked.set(x, y);

  // ---- pier + boat on Ykslammi
  for (let y = 320; y < 354; y++) {
    bg.hline(452, 459, y, y % 3 === 0 ? R.wood[2] : R.wood[3]);
    bg.set(452, y, R.wood[4]);
    bg.set(459, y, R.wood[1]);
  }
  bg.hline(452, 459, 354, R.wood[0]);
  for (const py of [330, 342, 353]) {
    bg.set(451, py, R.wood[0]);
    bg.set(460, py, R.wood[0]);
  }
  for (let x = 452; x < 460; x++) bg.set(x, 355, R.water[0]);

  // ---- decoration sprites: [img, x, y] (all go to the background, y-sorted)
  const deco: { img: Img; x: number; y: number; shadow?: boolean }[] = [];
  const add = (img: Img, x: number, y: number, sh = true) => {
    deco.push({ img, x, y, shadow: sh });
    blocked.rect(x - 1, y, img.w + 2, img.h + 2);
  };
  add(D.church(), 140, 126);
  add(D.bellTower(), 202, 138);
  add(D.vpk(), 236, 126);
  add(D.skateRamp(), 222, 84);
  add(D.mailboxes(2), 104, 94);
  add(D.mailboxes(3), 614, 290);
  add(D.mailboxes(2), 12, 164);
  add(D.planks(), 496, 90);
  add(D.bench(), 380, 98);
  add(D.bench(), 428, 197);
  add(D.flowerBed(18, 7, 1), 150, 192);
  add(D.flowerBed(16, 7, 2), 394, 82);
  add(D.flowerBed(14, 6, 3), 270, 186);
  add(D.signpost(), 288, 184);
  add(D.lampPost(), 262, 28, false);
  add(D.lampPost(), 380, 28, false);
  add(D.flagpole(40), 132, 194);
  add(D.boat(), 500, 336, false);
  // bales on the hay field
  for (const [bx, by, gold] of [
    [350, 214, 0],
    [366, 228, 0],
    [392, 216, 0],
    [420, 236, 1],
    [446, 214, 0],
    [470, 230, 0],
    [486, 212, 1],
    [380, 240, 0],
  ] as [number, number, number][])
    deco.push({ img: D.bale(!!gold), x: bx, y: by, shadow: true });

  // ---- trees
  const trees: { img: Img; x: number; y: number }[] = [];
  const treeFits = (img: Img, x: number, y: number) => !blocked.anyIn(x, y, img.w, img.h + 1);
  const plantTree = (bx: number, by: number, kind: number, force = false) => {
    const img =
      kind < 0.55 ? spruceSprite(20 + Math.floor(hash(bx, by, 3) * 12), bx * 7 + by) : leafyTree(18 + Math.floor(hash(bx, by, 4) * 8), 'birch', bx + by * 3);
    const x = bx - Math.floor(img.w / 2);
    const y = by - img.h + 1;
    if (!force && !treeFits(img, x, y)) return false;
    trees.push({ img, x, y });
    blocked.rect(x + 2, y + 2, img.w - 4, img.h - 2);
    return true;
  };
  // forest edges: left strip, right strip, bottom corners
  const forestZones: [number, number, number, number, number][] = [
    [0, 120, 26, 360, 70],
    [614, 118, 640, 360, 60],
    [0, 322, 112, 360, 40],
    [250, 322, 360, 360, 30],
    [576, 322, 640, 360, 30],
  ];
  for (const [x0, y0, x1, y1, n] of forestZones)
    for (let i = 0; i < n * 3 && n > 0; i++) {
      const bx = x0 + Math.floor(r() * (x1 - x0));
      const by = y0 + Math.floor(r() * (y1 - y0 + 14));
      plantTree(bx, by, r());
    }
  // scattered village trees
  for (let i = 0; i < 500; i++) {
    const bx = 30 + Math.floor(r() * (W - 60));
    const by = 60 + Math.floor(r() * (H - 60));
    plantTree(bx, by, r() * 1.6);
  }
  // rocks
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(r() * W);
    const y = 50 + Math.floor(r() * (H - 50));
    const rk = rockSprite(5 + Math.floor(r() * 4), 4 + Math.floor(r() * 2), i);
    if (blocked.anyIn(x - 1, y - 1, rk.w + 2, rk.h + 2)) continue;
    deco.push({ img: rk, x, y, shadow: true });
    blocked.rect(x, y, rk.w, rk.h);
  }

  // ---- ground detail (after everything big is blocked)
  const free = (x: number, y: number) => !blocked.get(x, y) && !waterM.get(x, y) && y > 48;
  roadsideLupines(bg, roadM, free);
  tufts(bg, free);
  flowers(bg, free, r);

  // ---- shadows
  for (const p of placed) shadow.sprite(p.img, p.x, p.y, 5, 3);
  for (const d of deco) if (d.shadow) shadow.sprite(d.img, d.x, d.y, 3, 2);
  for (const t of trees) shadow.ellipse(t.x + t.img.w / 2 + 3, t.y + t.img.h - 2, t.img.w / 2 - 1, 3);
  shadow.ellipse(509, 342, 9, 3);
  shadow.apply(bg);

  // ---- y-sorted sprites into the background
  const sprites = [...deco, ...trees].sort((a, b) => a.y + a.img.h - (b.y + b.img.h));
  for (const s of sprites) bg.blit(s.img, s.x, s.y);

  // ---- foreground canopies (player walks behind them)
  const fgTrees: [number, number, number][] = [
    [22, 296, 0],
    [618, 160, 1],
    [262, 344, 0],
    [574, 348, 1],
  ];
  for (const [x, y, k] of fgTrees) {
    const img = k ? leafyTree(26, 'birch', x) : spruceSprite(34, x);
    fg.blit(img, x - Math.floor(img.w / 2), y - img.h + 1);
  }

  // ---- overlays
  const overlays: Overlay[] = [];
  const at = (id: LocationId) => placed.find((p) => p.id === id)!;
  const smoke = sheetOf(smokeSheet());
  const bigSmoke = sheetOf(smokeSheet(true));
  for (const [id, key] of [
    ['parents_house', 'smoke'],
    ['cottage', 'smoke'],
    ['cottage', 'smoke2'],
  ] as [LocationId, string][]) {
    const [ax, ay] = at(id).anchors[key];
    overlays.push({ sheet: smoke, x: ax - 3, y: ay - smoke.frameHeight + 2, fps: 3 });
  }
  {
    const [ax, ay] = at('sauna').anchors.smoke;
    overlays.push({ sheet: bigSmoke, x: ax - 4, y: ay - bigSmoke.frameHeight + 4, fps: 3 });
  }
  const flag = sheetOf(flagSheet());
  const [fx, fy] = at('cottage').anchors.flag;
  overlays.push({ sheet: flag, x: fx, y: fy - 1, fps: 5 });
  overlays.push({ sheet: flag, x: 134 + 1, y: 194, fps: 5 });
  const pav = at('dance_pavilion');
  const [lx0, ly0] = pav.anchors.lightsFrom;
  const [lx1] = pav.anchors.lightsTo;
  overlays.push({ sheet: sheetOf(lightsSheet(lx1 - lx0 + 1)), x: lx0, y: ly0 - 1, fps: 2 });
  const [cfx, cfy] = at('sauna').anchors.fire;
  overlays.push({ sheet: sheetOf(fireSheet()), x: cfx - 2, y: cfy - 4, fps: 6 });
  overlays.push({ sheet: sheetOf(shimmerSheet(waterM, 368, 324, 200, 34, 5)), x: 368, y: 324, fps: 3 });
  overlays.push({ sheet: sheetOf(shimmerSheet(waterM, 426, 138, 76, 52, 6)), x: 426, y: 138, fps: 3 });
  overlays.push({ sheet: sheetOf(butterflySheet()), x: 400, y: 208, fps: 4 });
  overlays.push({ sheet: sheetOf(butterflySheet()), x: 180, y: 196, fps: 4 });

  const buildings = {} as MapArt['buildings'];
  for (const p of placed) buildings[p.id] = { img: p.img, x: p.x, y: p.y };

  // one shared evening light over everything except the (runtime-tinted) player
  eveningGrade(bg);
  eveningGrade(fg);
  for (const p of placed) eveningGrade(p.img);
  for (const sh of new Set(overlays.map((o) => o.sheet.img))) eveningGrade(sh);

  return {
    width: W,
    height: H,
    background: bg,
    foreground: fg,
    nodes: { ...NODES },
    buildings,
    overlays,
    player: buildPlayer(),
  };
}
