/**
 * Things the player can own, drawn into their home interior, plus the regulars who hang out
 * in some rooms and the clickable "props" (cat, clock...) of every room.
 *
 * Furniture pieces are drawn at their final room position on an empty room-sized image and
 * cropped, so every placement gets its own small sprite + top-left position.
 */
import { Img, hex, rng, type RGBA } from '../raster';
import { HOST_ANIMS, hostSheet } from './rooms-hosts';
import { H, Mask, OUT, PAL, W, box, mix, ragRug, ramp, shadow, shadowRect, steam } from './rooms-kit';
import { REGULARS } from './rooms-regulars';
import type { LocationId, RoomExtra, RoomFurniture, RoomProp } from './types';

const TEAK = ramp('#d89a5a', '#b06e3a', '#844a2e', '#58302a');

// ------------------------------------------------------------------ item drawings

function tv(img: Img, x: number, y: number, w = 36, h = 28) {
  // rabbit-ear antenna
  const ax = x + Math.round(w / 2);
  img.line(ax - 3, y + 12, ax - 9, y, PAL.metal[2]);
  img.line(ax + 3, y + 12, ax + 9, y, PAL.metal[2]);
  img.set(ax - 9, y, OUT);
  img.set(ax + 9, y, OUT);
  img.rect(ax - 4, y + 10, 8, 2, PAL.black[1]);
  const ty = y + 12;
  const wood = ramp('#c8885a', '#9c5e36', '#6a3c2c', '#44242a');
  box(img, x, ty, w, h, 0, wood, wood);
  const sw = w - 12;
  const sh = h - 7;
  img.rect(x + 3, ty + 3, sw, sh, hex('#2a3446'));
  // the picture: a hockey game, of course
  img.rect(x + 4, ty + 4, sw - 2, sh - 2, hex('#dce8f4'));
  img.rect(x + 4, ty + 4, sw - 2, 4, hex('#4a6a8a'));
  img.hline(x + 4, x + sw + 1, ty + 4 + Math.floor(sh / 2), hex('#e05a5a'));
  img.vline(x + 4 + Math.floor(sw / 2), ty + 8, ty + sh, hex('#5c94dc'));
  img.set(x + 9, ty + 12, hex('#d84a3e'));
  img.set(x + 9, ty + 13, hex('#d84a3e'));
  img.set(x + sw - 4, ty + 10, hex('#3c60b4'));
  img.set(x + sw - 4, ty + 11, hex('#3c60b4'));
  img.set(x + 12, ty + 14, OUT);
  for (let yy = ty + 5; yy < ty + sh + 2; yy += 2) img.hline(x + 4, x + sw + 1, yy, hex('#ffffff', 30));
  img.set(x + 5, ty + 9, hex('#ffffff', 200));
  // knobs + speaker
  for (let i = 0; i < 2; i++) {
    img.disc(x + w - 5, ty + 6 + i * 6, 1.6, PAL.metal[1]);
    img.set(x + w - 6, ty + 5 + i * 6, PAL.metal[0]);
  }
  for (let yy = ty + 16; yy < ty + h - 3; yy += 2) img.hline(x + w - 7, x + w - 4, yy, wood[3]);
}

function tvStool(img: Img, x: number, y: number) {
  tv(img, x, y, 30, 22);
  // little three-legged stool
  shadow(img, x + 15, y + 44, 13, 2);
  for (const [lx, d] of [[x + 5, -2], [x + 24, 2], [x + 14, 0]] as const) img.line(lx, y + 37, lx + d, y + 44, PAL.pine[3], 2);
  box(img, x + 2, y + 34, 26, 4, 2, PAL.pine, PAL.pine);
}

function fridge(img: Img, x: number, y: number, w = 16, h = 46) {
  // 1970s harvest-gold fridge
  const gold = ramp('#fff0a8', '#ecc860', '#c8983c', '#946234');
  shadowRect(img, x - 1, y + h, w + 3, 3);
  const m = new Mask(W, H).rect(x, y + 2, w, h - 2).rect(x + 1, y + 1, w - 2, 1).rect(x + 2, y, w - 4, 1);
  m.paint(img, gold, { split: x + w - 3 });
  m.outlineOn(img, OUT);
  img.hline(x, x + w - 1, y + 14, gold[3]);
  img.hline(x, x + w - 1, y + 15, gold[0]);
  img.rect(x + w - 4, y + 6, 2, 6, PAL.metal[1]);
  img.rect(x + w - 4, y + 19, 2, 10, PAL.metal[1]);
  img.vline(x + w - 4, y + 19, y + 28, PAL.metal[0]);
  // magnets and a note
  img.rect(x + 3, y + 20, 6, 7, hex('#fbf6e6'));
  img.hline(x + 4, x + 7, y + 22, hex('#9a98b8'));
  img.hline(x + 4, x + 6, y + 24, hex('#9a98b8'));
  img.set(x + 5, y + 20, PAL.red[1]);
  img.set(x + 3, y + 8, PAL.blue[1]);
  img.set(x + 4, y + 8, PAL.blue[1]);
  img.set(x + 6, y + 31, hex('#76b452'));
  // feet
  img.rect(x + 1, y + h, 2, 1, OUT);
  img.rect(x + w - 3, y + h, 2, 1, OUT);
}

function coffeeMaker(img: Img, x: number, y: number) {
  const bl = PAL.black;
  // water tank + head
  box(img, x + 6, y + 3, 5, 12, 0, bl, bl);
  box(img, x, y + 3, 11, 4, 0, bl, bl);
  img.rect(x + 7, y + 6, 2, 6, hex('#9ad0f4', 160));
  // glass jug with coffee
  const jug = new Mask(W, H).rect(x + 1, y + 9, 5, 5).span(y + 8, x + 2, x + 4);
  jug.fill(img, hex('#d8eef8', 150));
  new Mask(W, H).rect(x + 1, y + 11, 5, 3).fill(img, hex('#5a3424'));
  jug.outlineOn(img, OUT);
  img.set(x + 2, y + 9, hex('#ffffff', 200));
  // hot plate base
  box(img, x - 1, y + 14, 13, 2, 0, bl, bl);
  img.set(x + 9, y + 14, hex('#ff5a3a'));
  steam(img, x + 3, y + 5, 2);
}

function hotPlate(img: Img, x: number, y: number) {
  // upturned beer crate, generic yellow plastic
  const cr = ramp('#fff4a0', '#f6d050', '#d49a30', '#9c6230');
  shadowRect(img, x - 1, y + 27, 34, 3);
  box(img, x, y + 12, 32, 16, 0, cr, cr);
  for (let i = 0; i < 4; i++) img.rect(x + 3 + i * 7, y + 17, 5, 3, cr[3]);
  for (let i = 0; i < 4; i++) img.rect(x + 3 + i * 7, y + 22, 5, 3, cr[3]);
  img.rect(x + 12, y + 14, 8, 2, OUT);
  // single hot plate with a glowing coil
  box(img, x + 3, y + 7, 22, 5, 2, PAL.white, PAL.white);
  img.disc(x + 14, y + 8, 1.5, hex('#ff6a3a'));
  img.hline(x + 9, x + 19, y + 8, hex('#c84a2e'));
  img.set(x + 21, y + 10, hex('#f6d050'));
  // a little saucepan of something
  const pan = new Mask(W, H).rect(x + 7, y + 1, 14, 6);
  pan.paint(img, PAL.metal, { split: x + 18 });
  pan.outlineOn(img, OUT);
  img.rect(x + 8, y + 1, 12, 1, hex('#e8a040'));
  img.line(x + 21, y + 2, x + 28, y, PAL.black[1]);
  img.line(x + 21, y + 3, x + 28, y + 1, OUT);
  steam(img, x + 12, y - 2, 3);
  steam(img, x + 16, y - 4, 2);
  // the cord to the wall socket
  img.line(x + 25, y + 10, x + 31, y + 9, OUT);
}

function crt(img: Img, x: number, y: number) {
  const beige = ramp('#fff4dc', '#e8dcc0', '#c4b494', '#8e7e6e');
  box(img, x + 2, y + 15, 14, 3, 0, beige, beige);
  box(img, x, y, 18, 15, 0, beige, beige);
  img.rect(x + 2, y + 2, 14, 10, hex('#1e2a24'));
  for (let i = 0; i < 4; i++) img.hline(x + 3, x + 5 + ((i * 5) % 9), y + 3 + i * 2, hex('#5ae08a'));
  img.set(x + 3 + ((4 * 5) % 9), y + 9, hex('#5ae08a'));
  img.set(x + 14, y + 13, hex('#5ae08a'));
  // keyboard
  box(img, x - 1, y + 19, 20, 3, 1, beige, beige);
  for (let k = 0; k < 9; k++) img.set(x + 1 + k * 2, y + 20, beige[3]);
}

function computerDesk(img: Img, x: number, y: number) {
  // small teak desk with a beige PC, a floppy and a mug
  shadowRect(img, x - 1, y + 38, 44, 3);
  for (const lx of [x + 2, x + 37]) {
    img.rect(lx, y + 22, 3, 17, TEAK[2]);
    img.frame(lx - 1, y + 22, 5, 18, OUT);
  }
  box(img, x + 26, y + 26, 13, 12, 0, TEAK, TEAK);
  img.hline(x + 28, x + 36, y + 31, TEAK[3]);
  img.set(x + 32, y + 29, PAL.metal[1]);
  box(img, x, y + 20, 42, 6, 3, TEAK, TEAK);
  crt(img, x + 6, y);
  // mug + floppy
  img.rect(x + 31, y + 15, 5, 5, PAL.white[1]);
  img.frame(x + 30, y + 14, 7, 7, OUT);
  img.set(x + 37, y + 17, OUT);
  img.rect(x + 31, y + 15, 5, 1, hex('#5a3424'));
  img.rect(x + 27, y + 18, 4, 4, PAL.blue[2]);
  img.set(x + 28, y + 18, PAL.metal[1]);
}

function bicycle(img: Img, x: number, y: number) {
  const fr = ramp('#7ad0c8', '#2fa8a0', '#21787a', '#1a4e58');
  shadow(img, x + 23, y + 28, 22, 2);
  for (const cx of [x + 9, x + 37]) {
    const tyre = new Mask(W, H).disc(cx, y + 19, 8.6);
    tyre.sub(new Mask(W, H).disc(cx, y + 19, 6.6));
    tyre.fill(img, PAL.black[2]);
    tyre.outlineOn(img, OUT);
    const rim = new Mask(W, H).disc(cx, y + 19, 6.6).sub(new Mask(W, H).disc(cx, y + 19, 5.6));
    rim.fill(img, PAL.metal[1]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      img.line(Math.round(cx - Math.cos(a) * 5), Math.round(y + 19 - Math.sin(a) * 5), Math.round(cx + Math.cos(a) * 5), Math.round(y + 19 + Math.sin(a) * 5), PAL.metal[2]);
    }
    img.disc(cx, y + 19, 1, PAL.metal[3]);
  }
  // mudguards
  for (const cx of [x + 9, x + 37]) for (let k = 0; k <= 8; k++) {
    const a = Math.PI * (1.05 + k * 0.1);
    img.set(Math.round(cx + Math.cos(a) * 9.6), Math.round(y + 19 + Math.sin(a) * 9.6), fr[2]);
  }
  // step-through frame
  const f = new Mask(W, H)
    .line(x + 9, y + 19, x + 19, y + 19, 2)
    .line(x + 19, y + 19, x + 16, y + 7, 2)
    .line(x + 9, y + 19, x + 16, y + 8, 2)
    .line(x + 19, y + 19, x + 31, y + 8, 3)
    .line(x + 31, y + 5, x + 37, y + 19, 2);
  f.paint(img, fr);
  f.outlineOn(img, OUT);
  // chain ring + chain
  img.disc(x + 19, y + 19, 2.5, PAL.metal[2]);
  img.hline(x + 10, x + 18, y + 21, PAL.metal[3]);
  // saddle + handlebars
  const sd = new Mask(W, H).ellipse(x + 15, y + 6, 4, 1.6);
  sd.paint(img, PAL.black);
  sd.outlineOn(img, OUT);
  img.line(x + 30, y + 4, x + 27, y + 2, PAL.metal[2]);
  img.rect(x + 25, y + 1, 3, 2, PAL.black[1]);
  // front basket with a loaf in it
  const bk = ramp('#f0c888', '#c8964e', '#9a6a36', '#6a4430');
  const b = new Mask(W, H).rect(x + 33, y + 3, 10, 6);
  const loaf = new Mask(W, H).ellipse(x + 38, y + 3, 4, 2);
  loaf.paint(img, ramp('#b07848', '#7c4a32', '#5a3028'));
  loaf.outlineOn(img, OUT);
  b.paint(img, bk);
  b.outlineOn(img, OUT);
  for (let xx = x + 34; xx < x + 43; xx += 2) img.vline(xx, y + 4, y + 7, bk[2]);
  // bell
  img.set(x + 29, y + 2, PAL.yellow[1]);
}

function rubberPlant(img: Img, cx: number, yb: number, tall: number) {
  const lf = ramp('#8ac87a', '#3e8a4e', '#2a6444', '#1a4034');
  // white 70s ceramic pot
  const ph = 9;
  const pot = new Mask(W, H).tri(cx - 6, yb - ph, cx + 6, yb - ph, cx + 4, yb).tri(cx - 6, yb - ph, cx - 4, yb, cx + 4, yb);
  shadow(img, cx, yb + 1, 8, 2);
  // stem
  img.vline(cx, yb - tall, yb - ph, hex('#6a4a34'));
  img.vline(cx + 1, yb - tall + 6, yb - ph, hex('#4a3028'));
  // big glossy leaves, alternating
  const n = Math.max(3, Math.floor((tall - ph) / 6));
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const ly = yb - ph - 4 - i * ((tall - ph - 6) / n);
    const lx = cx + side * 5;
    const leaf = new Mask(W, H).ellipse(lx, ly, 4.5, 2.4);
    leaf.line(cx, ly + 2, lx, ly, 1);
    leaf.paint(img, lf, { split: lx + 2 });
    leaf.outlineOn(img, hex('#1a3a30'));
    img.set(Math.round(lx - 2), Math.round(ly - 1), lf[0]);
    img.set(Math.round(lx - 1), Math.round(ly - 1), hex('#d4f0c0'));
  }
  // top bud
  const bud = new Mask(W, H).ellipse(cx, yb - tall, 1.6, 3);
  bud.paint(img, ramp('#e8a0a0', '#c86a6a', '#944a50'));
  bud.outlineOn(img, hex('#1a3a30'));
  pot.paint(img, PAL.white, { split: cx + 2 });
  pot.outlineOn(img, OUT);
  img.rect(cx - 7, yb - ph - 1, 14, 2, PAL.white[1]);
  img.frame(cx - 8, yb - ph - 2, 16, 4, OUT);
  img.hline(cx - 4, cx + 3, yb - 5, PAL.orange[1]);
}

function lavaLamp(img: Img, x: number, y: number) {
  // glow
  for (let yy = y; yy < y + 20; yy++) for (let xx = x - 4; xx < x + 12; xx++) {
    const d = ((xx - x - 3.5) / 7) ** 2 + ((yy - y - 10) / 11) ** 2;
    if (d < 1) img.set(xx, yy, hex('#ff9a5a', Math.round(30 * (1 - d))));
  }
  const gold = PAL.yellow;
  // cap
  const cap = new Mask(W, H).rect(x + 2, y, 4, 3).span(y + 3, x + 1, x + 6);
  cap.paint(img, gold);
  cap.outlineOn(img, OUT);
  // glass
  const gl = new Mask(W, H).tri(x + 1, y + 4, x + 6, y + 4, x + 7, y + 14).tri(x + 1, y + 4, x, y + 14, x + 7, y + 14);
  gl.fill(img, hex('#8a4ac8'));
  gl.outlineOn(img, OUT);
  for (const [bx, by, r] of [[3.5, 6.5, 1.4], [4.5, 10, 1.9], [2.5, 13, 1.2]] as const) {
    new Mask(W, H).disc(x + bx, y + by, r).fill(img, hex('#ff8a3a'));
    img.set(Math.floor(x + bx - 0.5), Math.floor(y + by - 0.5), hex('#ffd070'));
  }
  img.vline(x + 1, y + 6, y + 12, hex('#d8a0ff', 160));
  // base
  const base = new Mask(W, H).tri(x, y + 15, x + 7, y + 15, x + 9, y + 21).tri(x, y + 15, x - 2, y + 21, x + 9, y + 21);
  base.paint(img, gold, { split: x + 5 });
  base.outlineOn(img, OUT);
}

/** Ryijy wall rug with a rising-sun pattern (different from the parents' one). */
function ryijyRug(img: Img, x: number, y: number, w: number, h: number) {
  img.rect(x - 4, y - 3, w + 8, 3, PAL.darkWood[1]);
  img.frame(x - 5, y - 4, w + 10, 5, OUT);
  const base = hex('#2c5a6a');
  const cols: RGBA[] = [hex('#f6d050'), hex('#f08a3a'), hex('#d84a3e'), hex('#e8e0c8'), hex('#76b452')];
  img.rect(x, y, w, h, base);
  const cx = x + w / 2;
  const cy = y + h * 0.75;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const px = x + i + 0.5;
      const py = y + j + 0.5;
      const d = Math.hypot(px - cx, (py - cy) * 1.3);
      const a = Math.atan2(py - cy, px - cx);
      let c: RGBA | null = null;
      if (d < 5) c = cols[0];
      else if (d < 7) c = cols[1];
      else if (py < cy && d < w * 0.48 && Math.floor(((a + Math.PI) / Math.PI) * 10) % 2 === 0) c = mix(cols[(Math.floor(d / 4) % 2) + 1], base, 0.15);
      else if (py >= cy && (i + j) % 3 === 0) c = cols[4];
      if (i < 2 || i >= w - 2) c = cols[3];
      if (c) img.set(x + i, y + j, c);
    }
  for (let i = 0; i < w; i += 2) img.vline(x + i, y + h, y + h + 2 + (i % 4 === 0 ? 1 : 0), cols[3]);
  img.frame(x - 1, y - 1, w + 2, h + 2, hex('#2b1d2a', 150));
  img.vline(x + w, y, y + h, hex('#2a1838', 60));
}

// ------------------------------------------------------------------ placements

type Draw = (img: Img) => void;
interface Placement {
  draw: Draw;
  /** Draw above the room's front layer (e.g. things standing on a front-layer table). */
  front?: boolean;
}

const RUG_FLAT = [hex('#c4703e'), hex('#e8c070'), hex('#8e4a32'), hex('#e8c070')];
const RUG_COTTAGE = [hex('#5a8ad0'), hex('#e8e0d0'), hex('#e86a5a'), hex('#e8e0d0'), hex('#68a868')];

const FURNITURE: Partial<Record<LocationId, Record<string, Placement>>> = {
  rental_flat: {
    rag_rug: { draw: (i) => ragRug(i, 54, 126, 150, 22, RUG_FLAT, rng(1)) },
    ryijy: { draw: (i) => ryijyRug(i, 102, 10, 44, 26) },
    rubber_plant: { draw: (i) => rubberPlant(i, 106, 96, 50) },
    tv: { draw: (i) => tv(i, 166, 34) },
    lava_lamp: { draw: (i) => lavaLamp(i, 202, 52) },
    fridge: { draw: (i) => fridge(i, 239, 50) },
    coffee_maker: { draw: (i) => coffeeMaker(i, 242, 34) },
    hot_plate: { draw: (i) => hotPlate(i, 208, 96) },
    computer: { draw: (i) => computerDesk(i, 4, 92) },
    bicycle: { draw: (i) => bicycle(i, 206, 128) },
  },
  cottage: {
    rag_rug: { draw: (i) => ragRug(i, 72, 124, 118, 26, RUG_COTTAGE, rng(1)) },
    ryijy: { draw: (i) => ryijyRug(i, 112, 8, 36, 24) },
    rubber_plant: { draw: (i) => rubberPlant(i, 8, 98, 34) },
    tv: { draw: (i) => tvStool(i, 66, 54) },
    lava_lamp: { draw: (i) => lavaLamp(i, 224, 9) },
    fridge: { draw: (i) => fridge(i, 238, 52) },
    coffee_maker: { draw: (i) => coffeeMaker(i, 186, 15) },
    hot_plate: { draw: (i) => hotPlate(i, 6, 130), front: true },
    computer: { draw: (i) => crt(i, 99, 52), front: true },
    bicycle: { draw: (i) => bicycle(i, 202, 124) },
  },
  parents_house: {
    bicycle: { draw: (i) => bicycle(i, 198, 122) },
  },
};

/** Clickable hit areas over funny objects, in room pixels. */
const PROPS: Partial<Record<LocationId, RoomProp[]>> = {
  parents_house: [
    { id: 'cat', x: 24, y: 96, w: 22, h: 17 },
    { id: 'clock', x: 70, y: 12, w: 21, h: 35 },
  ],
  grill: [
    { id: 'dartboard', x: 90, y: 52, w: 16, h: 16 },
    { id: 'oven', x: 14, y: 24, w: 56, h: 50 },
  ],
  rental_flat: [
    { id: 'lamp', x: 190, y: 0, w: 21, h: 23 },
    { id: 'books', x: 61, y: 17, w: 36, h: 55 },
  ],
  cottage: [
    { id: 'fireplace', x: 184, y: 34, w: 50, h: 64 },
    { id: 'rocking_chair', x: 16, y: 92, w: 50, h: 46 },
  ],
  sauna: [{ id: 'bucket', x: 138, y: 43, w: 33, h: 31 }],
  library: [{ id: 'stove', x: 189, y: 3, w: 46, h: 95 }],
  village_shop: [{ id: 'bottle_machine', x: 197, y: 63, w: 38, h: 36 }],
  station: [{ id: 'pigeon', x: 26, y: 47, w: 17, h: 14 }],
  bank: [{ id: 'clock', x: 75, y: 15, w: 19, h: 19 }],
  sawmill: [{ id: 'saw', x: 14, y: 17, w: 28, h: 15 }],
  dance_pavilion: [{ id: 'accordion', x: 14, y: 69, w: 22, h: 30 }],
};

/** Regulars: [location, regular id (= content action id), x, y, front?, flip?]. */
const EXTRAS: [LocationId, string, number, number, boolean?, boolean?][] = [
  ['grill', 'pekki', 62, 64],
  ['sawmill', 'matti', 218, 62],
  ['library', 'olli', 22, 80],
  ['bank', 'juho', 198, 86, false, true],
];

function crop(img: Img): { img: Img; x: number; y: number } {
  let x0 = img.w;
  let y0 = img.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++)
      if (img.data[(y * img.w + x) * 4 + 3]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { img: new Img(1, 1), x: 0, y: 0 };
  const out = new Img(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) {
      const s = ((y + y0) * img.w + x + x0) * 4;
      const d = (y * out.w + x) * 4;
      for (let k = 0; k < 4; k++) out.data[d + k] = img.data[s + k];
    }
  return { img: out, x: x0, y: y0 };
}

export function furnitureFor(id: LocationId): Record<string, RoomFurniture> | undefined {
  const list = FURNITURE[id];
  if (!list) return undefined;
  const out: Record<string, RoomFurniture> = {};
  for (const [item, p] of Object.entries(list)) {
    const canvas = new Img(W, H);
    p.draw(canvas);
    const c = crop(canvas);
    out[item] = { img: c.img, x: c.x, y: c.y, ...(p.front ? { front: true } : {}) };
  }
  return out;
}

export function propsFor(id: LocationId): RoomProp[] | undefined {
  return PROPS[id];
}

export function extrasFor(id: LocationId): RoomExtra[] | undefined {
  const list = EXTRAS.filter((e) => e[0] === id);
  if (!list.length) return undefined;
  return list.map(([, rid, x, y, front, flip]) => ({
    id: rid,
    sheet: hostSheet(REGULARS[rid]),
    x,
    y,
    // idle is rotated so the regulars do not blink in step with the host
    anims: { idle: [...HOST_ANIMS.idle.slice(5), ...HOST_ANIMS.idle.slice(0, 5)], talk: [...HOST_ANIMS.talk], happy: [...HOST_ANIMS.happy], annoyed: [...HOST_ANIMS.annoyed] },
    ...(front ? { front: true } : {}),
    ...(flip ? { flip: true } : {}),
  }));
}

