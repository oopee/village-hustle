/**
 * Chibi host sprites (32x48 frames) for the interiors. Each host is a HostSpec: colour ramps
 * plus small drawing hooks for hair, clothes, accessories and a held prop. drawHost() renders
 * one pose; hostSheet() renders the full animation strip.
 */
import { Img, hex, type RGBA } from '../raster';
import { Mask, OUT, PAL, mix, ramp, type Ramp } from './rooms-kit';
import type { HostAnim, Sheet } from './types';

export const FW = 32;
export const FH = 48;

type Eyes = 'open' | 'blink' | 'happy' | 'flat' | 'closed';
type Mouth = 'n' | 'open' | 'smile' | 'big' | 'frown' | 'flat';
type Arm = 'rest' | 'gesture' | 'raise' | 'thumb' | 'crossed';
type Brows = 'n' | 'up' | 'flat' | 'sad';
export interface Pose {
  eyes: Eyes;
  mouth: Mouth;
  arm: Arm;
  bob: number;
  brows?: Brows;
  blush?: boolean;
  fx?: 'sweat' | 'sparkle';
}

export interface Ctx {
  img: Img;
  b: number;
  pose: Pose;
  s: HostSpec;
  L: number;
  R: number;
  /** Mask with the bob offset applied to every draw call. */
  m(): Mask;
  /** Set a pixel in body coordinates (bob applied). */
  p(x: number, y: number, c: RGBA): void;
  face: Mask;
}

export interface HostSpec {
  skin: Ramp;
  hair: Ramp;
  eye: RGBA;
  top: Ramp;
  sleeve?: Ramp;
  short?: boolean;
  legs: Ramp;
  shoes: Ramp;
  /** Torso half-width (default 7). */
  hw?: number;
  happyArm?: 'raise' | 'thumb';
  blush?: boolean;
  bald?: boolean;
  lashes?: boolean;
  bigNose?: boolean;
  brow?: RGBA;
  /** Behind everything (bun, long hair, scarf tails). */
  back?(c: Ctx): void;
  /** Clothing details drawn on the torso. */
  over?(c: Ctx): void;
  /** Beard / moustache, drawn on the face before eyes and mouth. */
  beard?(c: Ctx): void;
  /** Front hair; return its mask to cast a 1px shadow on the forehead. */
  fringe?(c: Ctx): Mask | void;
  /** Hats, glasses... after hair. */
  acc?(c: Ctx): void;
  /** Item held in the left hand at chest height. */
  prop?: { hand: [number, number]; draw(c: Ctx): void; handFront?: boolean };
  /** Item in the right hand when gesturing (chalk...). */
  handItem?(c: Ctx, x: number, y: number): void;
  /** Drawn after the arms (towel over shoulder, ponytail...). */
  last?(c: Ctx): void;
}

const MOUTH = hex('#7a3444');
const TONGUE = hex('#e0606a');
const WHITE = hex('#ffffff');
const BLUSH = hex('#f4808a', 150);

// ------------------------------------------------------------------ frame layout

const POSES = (s: HostSpec): Pose[] => {
  const ha = s.happyArm ?? 'raise';
  return [
    { eyes: 'open', mouth: 'n', arm: 'rest', bob: 0 }, // 0 idle
    { eyes: 'open', mouth: 'n', arm: 'rest', bob: 1 }, // 1 breathe
    { eyes: 'blink', mouth: 'n', arm: 'rest', bob: 0 }, // 2 blink
    { eyes: 'open', mouth: 'open', arm: 'rest', bob: 0 }, // 3 talk
    { eyes: 'open', mouth: 'open', arm: 'gesture', bob: 0 }, // 4 talk + gesture
    { eyes: 'happy', mouth: 'big', arm: ha, bob: 0, brows: 'up', blush: true, fx: 'sparkle' }, // 5 happy
    { eyes: 'happy', mouth: 'smile', arm: ha, bob: 1, brows: 'up', blush: true }, // 6 happy bounce
    { eyes: 'flat', mouth: 'frown', arm: 'crossed', bob: 0, brows: 'flat' }, // 7 annoyed
    { eyes: 'closed', mouth: 'flat', arm: 'crossed', bob: 1, brows: 'sad', fx: 'sweat' }, // 8 sigh
    { eyes: 'open', mouth: 'n', arm: 'gesture', bob: 0 }, // 9 talk closed + gesture
  ];
};
export const HOST_ANIMS: Record<HostAnim, number[]> = {
  idle: [0, 0, 0, 1, 1, 0, 0, 2, 0, 1, 1, 0],
  talk: [3, 0, 4, 9],
  happy: [5, 6],
  annoyed: [7, 8],
};

export function hostSheet(s: HostSpec): Sheet {
  const poses = POSES(s);
  const img = new Img(FW * poses.length, FH);
  poses.forEach((p, i) => img.blit(drawHost(s, p), i * FW, 0));
  return { img, frameWidth: FW, frameHeight: FH };
}

// ------------------------------------------------------------------ renderer

export function drawHost(s: HostSpec, pose: Pose): Img {
  const img = new Img(FW, FH);
  const b = pose.bob;
  const hw = s.hw ?? 7;
  const L = 16 - hw;
  const R = 15 + hw;
  const c: Ctx = {
    img,
    b,
    pose,
    s,
    L,
    R,
    m: () => {
      const m = new Mask(FW, FH);
      m.oy = b;
      return m;
    },
    p: (x, y, col) => img.set(x, y + b, col),
    face: new Mask(FW, FH),
  };
  c.face.oy = b;

  s.back?.(c);

  // legs + shoes (never bob)
  const lg = new Mask(FW, FH).rect(L + 1, 38, 14 - L, 7).rect(17, 38, R - 17, 7);
  lg.paint(img, s.legs, { split: 17 });
  new Mask(FW, FH).rect(L, 45, 15 - L, 2).rect(17, 45, R - 16, 2).paint(img, s.shoes);

  // torso + neck
  const t = c.m().span(21, L + 1, R - 1).rect(L, 22, R - L + 1, 16 - b);
  t.paint(img, s.top, { split: R - 2 });
  for (let x = 14; x <= 17; x++) c.p(x, 20, s.skin[2]);
  s.over?.(c);

  // head
  const f = c.face;
  if (s.bald) f.rows([[2, 12, 19], [3, 10, 21], [4, 9, 22]]);
  f.rows([[5, 11, 20], [6, 9, 22], [17, 9, 22], [18, 10, 21], [19, 12, 19]]).rect(8, 7, 16, 10);
  f.rect(7, 12, 1, 3).rect(24, 12, 1, 3);
  f.paint(img, s.skin, { split: 22 });
  // nose
  c.p(16, 14, s.skin[2]);
  if (s.bigNose) {
    c.p(16, 13, s.skin[2]);
    c.p(17, 14, s.skin[3]);
  }
  s.beard?.(c);
  eyes(c, 11, false);
  eyes(c, 19, true);
  mouth(c);
  if (pose.blush || s.blush) {
    for (const x of [10, 11, 20, 21]) c.p(x, 15, BLUSH);
  }

  const hm = s.fringe?.(c);
  if (hm) hairShadow(c, hm);
  brows(c);
  s.acc?.(c);

  arms(c);
  s.last?.(c);
  fx(c);

  img.outline(OUT);
  return img;
}

function eyes(c: Ctx, x0: number, right: boolean) {
  const { p, s } = c;
  const e = s.eye;
  const dark = mix(e, OUT, 0.5);
  const outer = right ? x0 + 2 : x0 - 1;
  switch (c.pose.eyes) {
    case 'open':
      p(x0, 11, OUT);
      p(x0 + 1, 11, OUT);
      p(x0, 12, e);
      p(x0 + 1, 12, WHITE);
      p(x0, 13, dark);
      p(x0 + 1, 13, e);
      if (s.lashes) p(outer, 11, OUT);
      break;
    case 'blink':
      p(x0, 13, OUT);
      p(x0 + 1, 13, OUT);
      p(outer, 12, mix(s.skin[2], OUT, 0.4));
      break;
    case 'happy':
      p(x0, 12, OUT);
      p(x0 + 1, 12, OUT);
      p(x0 - 1, 13, OUT);
      p(x0 + 2, 13, OUT);
      break;
    case 'flat':
      p(x0 - (right ? 0 : 1), 12, OUT);
      p(x0, 12, OUT);
      p(x0 + 1, 12, OUT);
      if (right) p(x0 + 2, 12, OUT);
      p(x0, 13, e);
      p(x0 + 1, 13, dark);
      break;
    case 'closed':
      p(x0 - (right ? 0 : 1), 13, mix(s.skin[3], OUT, 0.3));
      p(x0, 13, OUT);
      p(x0 + 1, 13, OUT);
      if (right) p(x0 + 2, 13, mix(s.skin[3], OUT, 0.3));
      break;
  }
}

function brows(c: Ctx) {
  const col = c.s.brow ?? c.s.hair[3] ?? c.s.hair[2];
  const p = c.p;
  const mode = c.pose.brows ?? 'n';
  for (const [x0, right] of [[11, false], [19, true]] as const) {
    const inner = right ? x0 : x0 + 1;
    const outer = right ? x0 + 1 : x0;
    if (mode === 'n') {
      p(x0, 9, col);
      p(x0 + 1, 9, col);
    } else if (mode === 'up') {
      p(x0, 8, col);
      p(x0 + 1, 8, col);
    } else if (mode === 'flat') {
      p(x0, 10, col);
      p(x0 + 1, 10, col);
      p(right ? x0 + 2 : x0 - 1, 10, col);
    } else {
      p(inner, 8, col);
      p(outer, 9, col);
    }
  }
}

function mouth(c: Ctx) {
  const p = c.p;
  const y = 16;
  switch (c.pose.mouth) {
    case 'n':
      p(15, y, MOUTH);
      p(16, y, MOUTH);
      p(14, y - 1, mix(c.s.skin[2], MOUTH, 0.3));
      p(17, y - 1, mix(c.s.skin[2], MOUTH, 0.3));
      break;
    case 'smile':
      p(14, y - 1, MOUTH);
      p(15, y, MOUTH);
      p(16, y, MOUTH);
      p(17, y - 1, MOUTH);
      break;
    case 'open':
      p(15, y, OUT);
      p(16, y, OUT);
      p(15, y + 1, TONGUE);
      p(16, y + 1, MOUTH);
      break;
    case 'big':
      for (let x = 14; x <= 17; x++) p(x, y, OUT);
      p(14, y + 1, OUT);
      p(15, y + 1, TONGUE);
      p(16, y + 1, TONGUE);
      p(17, y + 1, OUT);
      p(15, y + 2, OUT);
      p(16, y + 2, OUT);
      break;
    case 'frown':
      p(14, y + 1, MOUTH);
      p(15, y, MOUTH);
      p(16, y, MOUTH);
      p(17, y + 1, MOUTH);
      break;
    case 'flat':
      for (let x = 14; x <= 17; x++) p(x, y, MOUTH);
      break;
  }
}

function hairShadow(c: Ctx, hm: Mask) {
  const sh = c.s.skin[2];
  c.face.each((x, y) => {
    if (!hm.has(x, y) && hm.has(x, y - 1)) c.img.set(x, y, sh);
  });
}

/** Arm from the shoulder through pts; short sleeves turn to skin after ~5px. */
function limb(c: Ctx, pts: [number, number][], hand: [number, number] | null, handR = 1.5) {
  const s = c.s;
  const m = c.m();
  for (let i = 0; i < pts.length - 1; i++) m.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 3);
  const sl = new Mask(FW, FH);
  const sk = new Mask(FW, FH);
  const [sx, sy] = pts[0];
  m.each((x, y) => {
    const d = Math.hypot(x - sx, y - c.b - sy);
    (s.short && d > 5 ? sk : sl).add(x, y);
  });
  sl.paint(c.img, s.sleeve ?? s.top);
  sk.paint(c.img, s.skin);
  if (hand) c.m().disc(hand[0], hand[1], handR).paint(c.img, s.skin);
}

function arms(c: Ctx) {
  const { L, R, s } = c;
  const a = c.pose.arm;
  if (a === 'crossed') {
    limb(c, [[L - 2, 22], [L - 2, 29]], null);
    limb(c, [[R + 2, 22], [R + 2, 29]], null);
    // lower forearm (left arm going right), then upper (right arm going left) on top
    const sl = s.sleeve ?? s.top;
    const fore = s.short ? s.skin : sl;
    const m1 = c.m().rect(L - 2, 29, R - L + 3, 3);
    m1.paint(c.img, fore);
    c.m().rect(R - 1, 28, 3, 3).paint(c.img, s.skin);
    const m2 = c.m().rect(L - 1, 26, R - L + 4, 3);
    m2.paint(c.img, fore);
    c.m().rect(L - 3, 26, 3, 3).paint(c.img, s.skin);
    c.m().rect(L - 1, 29, 1, 3).fill(c.img, mix(fore[2], OUT, 0.3));
    return;
  }
  // left arm: rest or holding the prop
  if (s.prop) {
    const [hx, hy] = s.prop.hand;
    limb(c, [[L - 2, 22], [L - 2, 27], [hx - 1, hy]], s.prop.handFront ? null : [hx, hy]);
    s.prop.draw(c);
    if (s.prop.handFront) c.m().disc(hx, hy, 1.5).paint(c.img, s.skin);
  } else limb(c, [[L - 2, 22], [L - 2, 33]], [L - 2, 34.5]);
  // right arm
  if (a === 'rest') limb(c, [[R + 2, 22], [R + 2, 33]], [R + 2, 34.5]);
  else if (a === 'gesture') {
    limb(c, [[R + 2, 22], [R + 3, 28], [R + 5, 21]], [R + 5, 18.5], 1.7);
    s.handItem?.(c, R + 5, 17);
  } else if (a === 'raise') {
    const w = c.b ? 1 : 0;
    limb(c, [[R + 2, 22], [R + 3 + w, 13]], [R + 3 + w, 10], 1.9);
  } else if (a === 'thumb') {
    limb(c, [[R + 2, 22], [R + 2, 28], [19, 28]], null);
    c.m().rect(16, 24, 4, 4).rect(17, 21, 2, 3).paint(c.img, s.skin);
    c.p(16, 25, s.skin[2]);
    c.p(16, 26, s.skin[2]);
  }
}

function fx(c: Ctx) {
  const p = c.p;
  if (c.pose.fx === 'sweat') {
    const lb = hex('#9ad8ff');
    const db = hex('#4c8ad0');
    p(26, 5, lb);
    p(25, 6, lb);
    p(26, 6, lb);
    p(25, 7, WHITE);
    p(26, 7, lb);
    p(27, 7, db);
    p(25, 8, lb);
    p(26, 8, db);
    p(27, 8, db);
    p(26, 9, db);
  } else if (c.pose.fx === 'sparkle') {
    const y = hex('#fff2a0');
    for (const [x, yy] of [[28, 1], [28, 3], [27, 2], [29, 2]] as const) p(x, yy, y);
    p(28, 2, WHITE);
    p(3, 5, y);
  }
}

// ------------------------------------------------------------------ shared bits

export const glasses = (col: RGBA, round = false) => (c: Ctx) => {
  for (const x0 of [10, 18]) {
    for (let x = x0; x <= x0 + 3; x++) {
      if (!(round && (x === x0 || x === x0 + 3))) {
        c.p(x, 10, col);
        c.p(x, 14, col);
      }
    }
    for (let y = 11; y <= 13; y++) {
      c.p(x0, y, col);
      c.p(x0 + 3, y, col);
    }
  }
  c.p(14, 11, col);
  c.p(15, 11, col);
  c.p(16, 11, col);
  c.p(17, 11, col);
  c.p(13, 13, hex('#ffffff', 120));
  c.p(21, 13, hex('#ffffff', 120));
};

export function paintHair(c: Ctx, m: Mask, hl: [number, number][] = [], split = 21) {
  m.paint(c.img, c.s.hair, { split });
  for (const [x, y] of hl) if (m.has(x, y + c.b)) c.p(x, y, c.s.hair[0]);
  return m;
}

export function curls(c: Ctx, m: Mask, pts: [number, number][]) {
  const col = c.s.hair[2];
  for (const [x, y] of pts) {
    if (m.has(x, y + c.b)) c.p(x, y, col);
    if (m.has(x + 1, y + 1 + c.b)) c.p(x + 1, y + 1, col);
  }
}

// ------------------------------------------------------------------ skin & hair ramps

export const SKIN = ramp('#ffe4c8', '#f8c8a0', '#dc9a80', '#a86a70');
export const SKIN_OLD = ramp('#ffe0c8', '#f0bea0', '#d0907e', '#9c6470');
export const SKIN_ROSY = ramp('#ffdcc4', '#f6b898', '#d88878', '#a85a68');
export const EYE_BROWN = hex('#4a2c36');
export const EYE_BLUE = hex('#2c4478');
export const EYE_GREEN = hex('#2e5a4a');

export const leftHold = (hand: [number, number], draw: (c: Ctx) => void, handFront = true) => ({ hand, draw, handFront });

// ------------------------------------------------------------------ the 15 hosts

export const HOSTS: Record<string, HostSpec> = {
  // 1. Mom: curly brown hair, glasses, apron over a cardigan, coffee mug
  mom: {
    skin: SKIN,
    hair: ramp('#b07848', '#7e4c32', '#5a3028', '#3e2026'),
    eye: EYE_BROWN,
    top: ramp('#f4b8c0', '#d8808e', '#a85670', '#7a3a58'),
    legs: ramp('#7a84a8', '#5a6088', '#40446a'),
    shoes: ramp('#8a5a4a', '#5e3a36', '#3e2630'),
    lashes: true,
    back: (c) => {
      const m = c.m().disc(7.5, 13, 3).disc(7, 17.5, 2.8).disc(24, 13, 3).disc(24.5, 17.5, 2.8);
      paintHair(c, m, [], 23);
    },
    over: (c) => {
      // apron: bib + skirt, mustard with white dots
      const ap = ramp('#ffe89a', '#f2c450', '#c8923a', '#8e5e34');
      const m = c.m().rect(11, 24, 10, 6).rect(10, 30, 12, 8 - c.b);
      m.paint(c.img, ap, { split: 20 });
      for (let y = 25; y < 37; y += 3) for (let x = 11 + ((y / 3) % 2); x < 21; x += 3) if (m.has(x, y + c.b)) c.p(x, y, hex('#fff8e0'));
      c.p(11, 23, ap[2]);
      c.p(20, 23, ap[2]);
      c.p(11, 22, ap[2]);
      c.p(20, 22, ap[2]);
      // cardigan buttons peeking at the neck
      c.p(15, 22, hex('#fff0f0'));
    },
    fringe: (c) => {
      const m = c.m()
        .ellipse(15.5, 8, 9.5, 5.5)
        .disc(9, 5, 2.6)
        .disc(13, 3.2, 2.6)
        .disc(18, 3.2, 2.6)
        .disc(22, 5, 2.6)
        .disc(9.5, 7, 2)
        .disc(13.5, 7, 2)
        .disc(18, 7, 2)
        .disc(22, 7.2, 2)
        .rect(6, 8, 3, 8)
        .rect(23, 8, 3, 8);
      m.clip((x, y) => y <= 8 || x <= 8 || x >= 23);
      paintHair(c, m, [[10, 3], [11, 3], [12, 2], [14, 2], [9, 4]], 22);
      curls(c, m, [[11, 5], [16, 4], [19, 6], [8, 9], [24, 11], [7, 13], [14, 6], [21, 3]]);
      return m;
    },
    acc: glasses(hex('#8a3a4a')),
    prop: leftHold([13, 29], (c) => {
      const m = c.m().rect(11, 25, 5, 5);
      m.paint(c.img, ramp('#ffffff', '#e8eef8', '#b8bcd8', '#8a8aac'));
      c.p(11, 27, hex('#4a7ad0'));
      for (let x = 12; x <= 15; x++) c.p(x, 27, hex('#4a7ad0'));
      c.p(10, 26, hex('#c8c8dc'));
      c.p(10, 27, hex('#c8c8dc'));
      // steam
      c.p(13, 22, hex('#ffffff', 140));
      c.p(14, 21, hex('#ffffff', 110));
      c.p(13, 20, hex('#ffffff', 80));
    }),
  },

  // 2. Tarja: case worker, auburn bob, cardigan, lanyard, reading glasses on a chain
  tarja: {
    skin: SKIN,
    hair: ramp('#e08a50', '#b85a34', '#86382e', '#5a2228'),
    eye: EYE_GREEN,
    top: ramp('#c890c8', '#9a5c9c', '#6e3a78', '#4a2658'),
    legs: ramp('#5a5a78', '#424260', '#2e2e48'),
    shoes: ramp('#4a3a4a', '#3a2a3a', '#2a1e2e'),
    lashes: true,
    back: (c) => {
      const m = c.m().rect(6, 8, 4, 12).rect(22, 8, 4, 12).span(20, 7, 10).span(20, 21, 24);
      paintHair(c, m, [], 24);
    },
    over: (c) => {
      // blouse V
      const bl = ramp('#fffaf0', '#f4ead8', '#d4c4b4');
      c.m().tri(12, 21, 19, 21, 15.5, 30).paint(c.img, bl, { noHi: true });
      // cardigan buttons
      for (const y of [31, 34]) c.p(15, y, hex('#f0d8f0'));
      // lanyard + badge
      const ly = hex('#3a6ad0');
      for (let i = 0; i < 9; i++) {
        c.p(12 + Math.floor(i / 3), 21 + i, ly);
        c.p(19 - Math.floor(i / 3), 21 + i, ly);
      }
      c.m().rect(14, 29, 4, 5).paint(c.img, ramp('#ffffff', '#f0f0f8', '#c0c4d8'));
      c.p(15, 31, hex('#3a6ad0'));
      c.p(16, 31, hex('#3a6ad0'));
      c.p(15, 32, hex('#8a8aa0'));
      // glasses hanging on a chain
      const gc = hex('#d0a040');
      c.p(10, 22, gc);
      c.p(10, 23, gc);
      c.p(11, 24, gc);
      c.p(21, 22, gc);
      c.p(21, 23, gc);
      c.p(20, 24, gc);
      const gf = hex('#4a3040');
      for (const x of [10, 11, 12, 18, 19, 20]) c.p(x, 25, gf);
      c.p(10, 26, gf);
      c.p(12, 26, gf);
      c.p(18, 26, gf);
      c.p(20, 26, gf);
      c.p(11, 26, hex('#d8eeff'));
      c.p(19, 26, hex('#d8eeff'));
      c.p(13, 25, gf);
      c.p(17, 25, gf);
    },
    fringe: (c) => {
      const m = c.m().ellipse(15.5, 9, 9.3, 6.6).rect(6, 8, 3, 12).rect(23, 8, 3, 12);
      m.clip((x, y) => x <= 8 || x >= 23 || y <= 9 - (x - 8) * 0.22);
      paintHair(c, m, [[10, 4], [11, 3], [12, 3], [13, 3], [9, 5], [7, 9], [7, 10]], 22);
      // fringe strands
      c.p(14, 6, c.s.hair[2]);
      c.p(18, 5, c.s.hair[2]);
      return m;
    },
    handItem: (c, x, y) => {
      c.p(x, y - 3, hex('#3a6ad0'));
      c.p(x, y - 2, hex('#3a6ad0'));
      c.p(x, y - 1, hex('#f0f0f0'));
    },
  },

  // 3. Pertti: pensioner, flat cap, olive jacket, thermos
  pertti: {
    skin: SKIN_OLD,
    hair: ramp('#f0f0f4', '#c8c8d4', '#9a98ac', '#6c6880'),
    eye: EYE_BLUE,
    top: ramp('#a8b070', '#7c8650', '#566040', '#3a4232'),
    legs: ramp('#7a6c60', '#5a4c48', '#3e3438'),
    shoes: ramp('#6a4a3a', '#4a3030', '#2e1e24'),
    bigNose: true,
    happyArm: 'thumb',
    brow: hex('#9a98ac'),
    over: (c) => {
      // plaid shirt collar + zipper
      const r = hex('#c84a3e');
      c.m().tri(13, 21, 18, 21, 15.5, 25).fill(c.img, r);
      c.p(15, 22, hex('#f0d8c0'));
      c.p(16, 23, hex('#f0d8c0'));
      for (let y = 25; y < 37; y++) c.p(15, y, c.s.top[3]);
      for (let y = 25; y < 37; y += 2) c.p(16, y, c.s.top[0]);
      // pockets
      c.p(11, 31, c.s.top[3]);
      c.p(12, 31, c.s.top[3]);
      c.p(19, 31, c.s.top[3]);
      c.p(20, 31, c.s.top[3]);
    },
    fringe: (c) => {
      const m = c.m().rect(7, 9, 3, 6).rect(22, 9, 3, 6);
      paintHair(c, m, [], 23);
      return m;
    },
    beard: (c) => {
      const g = c.s.hair;
      for (let x = 13; x <= 18; x++) c.p(x, 15, x < 17 ? g[1] : g[2]);
      c.p(12, 16, g[2]);
      c.p(19, 16, g[2]);
      // wrinkles
      c.p(9, 14, c.s.skin[2]);
      c.p(22, 14, c.s.skin[2]);
    },
    acc: (c) => {
      const tw = ramp('#c8b8a0', '#988670', '#6c5c58', '#4a3c44');
      const cap = c.m().ellipse(15.5, 7.5, 9.2, 5).clip((_, y) => y <= 8);
      cap.paint(c.img, tw, { split: 21 });
      for (let y = 3; y <= 8; y += 2) for (let x = 8 + (y % 4 === 1 ? 1 : 0); x < 24; x += 3) if (cap.has(x, y + c.b)) c.p(x, y, tw[2]);
      // brim
      const br = c.m().rows([[9, 7, 24], [10, 9, 23]]);
      br.paint(c.img, ramp('#a89480', '#7a6858', '#5a4a4c', '#3c3040'));
      c.p(12, 4, tw[0]);
      c.p(13, 4, tw[0]);
      c.p(14, 3, tw[0]);
      // shadow under brim
      for (let x = 9; x <= 22; x++) c.p(x, 11, mix(c.s.skin[2], OUT, 0.15));
      c.p(11, 11, OUT);
      c.p(12, 11, OUT);
      c.p(19, 11, OUT);
      c.p(20, 11, OUT);
    },
    prop: leftHold([13, 29], (c) => {
      const th = ramp('#f08a6a', '#c8443c', '#962e3a', '#64203a');
      c.m().rect(11, 21, 5, 11).paint(c.img, th, { split: 15 });
      c.m().rect(11, 19, 5, 3).paint(c.img, PAL.metal);
      c.p(12, 25, hex('#ffd0c0'));
      c.p(12, 26, hex('#ffd0c0'));
      for (let x = 11; x <= 15; x++) c.p(x, 30, PAL.metal[2]);
    }),
  },

  // 4. Marjatta: bank teller, neat dark bun, white blouse, navy jacket, brooch
  marjatta: {
    skin: SKIN,
    hair: ramp('#6a5068', '#463448', '#2e2238', '#1e1628'),
    eye: EYE_BROWN,
    top: ramp('#ffffff', '#eeeaf2', '#c4c0d4', '#9490ac'),
    legs: ramp('#3e4870', '#2c3458', '#20263e'),
    shoes: ramp('#5a3040', '#3e2030', '#2a1622'),
    lashes: true,
    back: (c) => {
      const m = c.m().disc(15.5, 3, 3.6);
      paintHair(c, m, [[14, 1], [15, 1], [13, 2]], 17);
      c.p(13, 4, c.s.hair[3]);
      c.p(18, 4, c.s.hair[3]);
    },
    over: (c) => {
      const nv = ramp('#5a6aa8', '#3a4880', '#2a3460', '#1e2444');
      const j = c.m().rect(c.L, 22, 5, 16 - c.b).rect(c.R - 4, 22, 5, 16 - c.b).span(21, c.L + 1, c.L + 4).span(21, c.R - 4, c.R - 1);
      j.paint(c.img, nv, { split: c.R - 2 });
      // lapels
      for (let i = 0; i < 4; i++) {
        c.p(c.L + 5 + (i > 1 ? 0 : 0), 22 + i, nv[0]);
        c.p(c.R - 5, 22 + i, nv[2]);
      }
      // frilly collar
      c.p(13, 21, WHITE);
      c.p(18, 21, WHITE);
      c.p(14, 22, hex('#d8d4e4'));
      c.p(17, 22, hex('#d8d4e4'));
      // brooch
      c.p(18, 25, hex('#f6d050'));
      c.p(19, 25, hex('#d49a30'));
      c.p(18, 26, hex('#d49a30'));
      c.p(19, 26, hex('#e84a6a'));
      c.p(18, 24, hex('#fff6c0'));
      // buttons
      c.p(15, 28, c.s.top[2]);
      c.p(15, 31, c.s.top[2]);
    },
    fringe: (c) => {
      const m = c.m().ellipse(15.5, 9.3, 8.9, 6.6).rect(7, 8, 2, 6).rect(23, 8, 2, 6);
      m.clip((x, y) => y <= 6.5 + Math.max(0, Math.abs(x - 15.5) - 3.5) * 1.3);
      paintHair(c, m, [[10, 4], [11, 3], [12, 3], [9, 5]], 22);
      for (const [x, y] of [[12, 6], [13, 5], [19, 6], [18, 5]] as const) c.p(x, y, c.s.hair[2]);
      // pearl earrings
      c.p(7, 15, WHITE);
      c.p(24, 15, WHITE);
      return m;
    },
  },

  // 5. Masa: foreman, white hard hat, moustache, hi-vis vest, pencil behind the ear
  masa: {
    skin: SKIN_ROSY,
    hair: ramp('#a06a44', '#74442e', '#523026', '#3a2020'),
    eye: EYE_BROWN,
    top: ramp('#8aa0c0', '#5e7498', '#425274', '#2e3852'),
    legs: ramp('#5a6a88', '#40506e', '#2c3650'),
    shoes: ramp('#8a6040', '#5e3c2c', '#3c2422'),
    happyArm: 'thumb',
    bigNose: true,
    over: (c) => {
      const hv = ramp('#f4ff8a', '#d8f040', '#a8c030', '#6a8a2e');
      const m = c.m().rect(c.L, 22, 6, 16 - c.b).rect(c.R - 5, 22, 6, 16 - c.b).span(21, c.L + 1, c.L + 4).span(21, c.R - 4, c.R - 1);
      m.paint(c.img, hv, { split: c.R - 2 });
      for (const y of [29, 33]) {
        for (let x = c.L; x <= c.L + 5; x++) c.p(x, y, hex('#e8eef4'));
        for (let x = c.R - 5; x <= c.R; x++) c.p(x, y, hex('#e8eef4'));
      }
      // shirt buttons
      c.p(15, 25, c.s.top[3]);
      c.p(15, 29, c.s.top[3]);
      c.p(16, 33, c.s.top[3]);
    },
    fringe: (c) => {
      const m = c.m().rect(7, 10, 2, 5).rect(23, 10, 2, 5);
      paintHair(c, m);
      return m;
    },
    beard: (c) => {
      const m = c.m().rows([[14, 13, 18], [15, 12, 19]]);
      m.paint(c.img, c.s.hair);
      c.p(12, 16, c.s.hair[2]);
      c.p(19, 16, c.s.hair[2]);
    },
    acc: (c) => {
      const wh = ramp('#ffffff', '#f0f0f4', '#c4c4d4', '#8a8aa4');
      const hat = c.m().ellipse(15.5, 8, 9, 5.8).clip((_, y) => y <= 8);
      hat.rows([[9, 5, 26]]);
      hat.paint(c.img, wh, { split: 22 });
      for (let y = 3; y <= 8; y++) c.p(15, y, wh[0]);
      for (let y = 3; y <= 8; y++) c.p(16, y, wh[2]);
      for (let x = 6; x <= 25; x++) c.p(x, 10, mix(c.s.skin[2], OUT, 0.2));
      // pencil behind the ear
      c.p(25, 11, hex('#f4a0b0'));
      c.p(25, 12, hex('#f6d050'));
      c.p(24, 13, hex('#f6d050'));
      c.p(24, 14, hex('#d49a30'));
      c.p(23, 15, OUT);
    },
  },

  // 6. Raimo: hardware dealer, grey side-parted hair, blue work coat, measuring tape
  raimo: {
    skin: SKIN_OLD,
    hair: ramp('#f4f4f8', '#cacad6', '#9c9ab0', '#6e6a86'),
    eye: EYE_BLUE,
    top: ramp('#7ab0f0', '#3e7ad4', '#2c56a8', '#203a78'),
    legs: ramp('#6a6a7c', '#4c4c60', '#343448'),
    shoes: ramp('#6a4a3a', '#4a3030', '#2e1e24'),
    happyArm: 'thumb',
    bigNose: true,
    brow: hex('#8a88a0'),
    over: (c) => {
      // collar + shirt
      c.m().tri(13, 21, 18, 21, 15.5, 25).fill(c.img, hex('#f4f0ec'));
      c.p(12, 21, c.s.top[0]);
      c.p(13, 22, c.s.top[0]);
      c.p(19, 21, c.s.top[2]);
      c.p(18, 22, c.s.top[2]);
      // buttons + breast pocket with pens
      for (const y of [27, 31, 35]) c.p(15, y, hex('#e0e8f8'));
      for (let x = 17; x <= 21; x++) c.p(x, 26, c.s.top[3]);
      c.p(18, 24, hex('#e84a4a'));
      c.p(18, 25, hex('#e84a4a'));
      c.p(20, 25, OUT);
      c.p(20, 24, OUT);
    },
    fringe: (c) => {
      const m = c.m().ellipse(15.5, 8.8, 8.8, 6.2).rect(7, 8, 2, 6).rect(23, 8, 2, 6);
      m.clip((x, y) => x <= 8 || x >= 23 || y <= 7 + (x < 12 ? 1 : 0));
      paintHair(c, m, [[13, 3], [14, 3], [15, 3], [16, 3], [17, 4]], 22);
      for (let y = 3; y <= 6; y++) c.p(11, y, c.s.hair[3]);
      return m;
    },
    prop: leftHold([13, 29], (c) => {
      const y = ramp('#fff4a0', '#f6d050', '#c89a30', '#8a6030');
      c.m().rect(10, 25, 6, 6).paint(c.img, y);
      c.m().disc(12.5, 27.5, 1.2).fill(c.img, OUT);
      c.p(12, 27, PAL.metal[1]);
      // the tape, pulled out and hanging down
      for (let k = 0; k < 4; k++) c.p(16 + k, 26 + (k > 1 ? 1 : 0), y[1]);
      for (let k = 0; k < 6; k++) c.p(19, 27 + k, y[1]);
      for (let k = 0; k < 6; k += 2) c.p(20, 27 + k, OUT);
    }),
  },

  // 7. Sirpa: nurse, short dark hair, white uniform, stethoscope
  sirpa: {
    skin: SKIN,
    hair: ramp('#6a4a58', '#40283a', '#2c1a2c', '#1e1220'),
    eye: EYE_BROWN,
    top: ramp('#ffffff', '#f2f6fa', '#c8d4e4', '#94a4c0'),
    short: true,
    legs: ramp('#ffffff', '#e4eaf2', '#b4bcd0'),
    shoes: ramp('#ffffff', '#d8dce8', '#9ca4bc'),
    lashes: true,
    over: (c) => {
      c.m().tri(13, 21, 18, 21, 15.5, 25).paint(c.img, c.s.skin, { noHi: true });
      c.p(12, 21, c.s.top[2]);
      c.p(19, 21, c.s.top[2]);
      // stethoscope
      const tb = hex('#3a4a6a');
      for (let y = 21; y <= 27; y++) c.p(11, y, tb);
      for (let y = 21; y <= 25; y++) c.p(20, y, tb);
      c.p(12, 28, tb);
      c.p(13, 29, tb);
      c.p(19, 26, tb);
      c.p(19, 27, tb);
      c.m().disc(18.5, 29, 1.6).paint(c.img, PAL.metal);
      // pocket + pen + tag
      for (let x = 11; x <= 14; x++) c.p(x, 32, c.s.top[2]);
      c.p(12, 30, hex('#3a6ad0'));
      c.p(12, 31, hex('#3a6ad0'));
      c.p(19, 33, hex('#3a90c0'));
      c.p(20, 33, hex('#3a90c0'));
    },
    fringe: (c) => {
      const m = c.m().ellipse(15.5, 9.2, 8.9, 6.5).rect(7, 8, 2, 6).rect(23, 8, 2, 5);
      m.clip((x, y) => x <= 8 || x >= 23 || y <= 7 + ((x * 5) % 3 === 0 ? 1 : 0) + (x < 13 ? 1 : 0));
      paintHair(c, m, [[10, 4], [11, 3], [12, 3], [13, 3], [14, 3]], 22);
      // hair clip
      c.p(21, 6, hex('#f08aa0'));
      c.p(22, 6, hex('#f08aa0'));
      return m;
    },
  },

  // 8. Eila: old neighbour, red polka-dot headscarf, blue dress, basket of berries
  eila: {
    skin: SKIN_OLD,
    hair: ramp('#ffffff', '#dcdae6', '#aeaac0', '#7e7894'),
    eye: EYE_BLUE,
    top: ramp('#8ab0e8', '#5a84c8', '#3e5c9e', '#2c3e74'),
    legs: ramp('#5a84c8', '#3e5c9e', '#2c3e74'),
    shoes: ramp('#6a4a3a', '#4a3030', '#2e1e24'),
    blush: true,
    brow: hex('#aeaac0'),
    over: (c) => {
      // white collar
      for (let x = 12; x <= 19; x++) c.p(x, 21, WHITE);
      c.p(13, 22, hex('#e0e4f0'));
      c.p(18, 22, hex('#e0e4f0'));
      for (const y of [25, 29]) c.p(15, y, WHITE);
    },
    fringe: (c) => {
      const sc = PAL.red;
      // grey hair strip under the scarf
      const g = c.m().rows([[8, 9, 22]]);
      paintHair(c, g);
      // scarf: rounded crown, sides tapering along the cheeks to the chin knot
      const m = c.m().ellipse(15.5, 8.5, 10, 7).clip((_, y) => y <= 7).rect(6, 7, 3, 9).rect(23, 7, 3, 9).tri(6, 15, 9, 15, 13, 21).tri(25, 15, 22, 15, 18, 21);
      m.paint(c.img, sc, { split: 22 });
      // a few polka dots
      for (const [x, y] of [[10, 3], [15, 2], [20, 3], [8, 6], [13, 5], [18, 5], [23, 6], [7, 10], [24, 10]] as const) if (m.has(x, y + c.b)) c.p(x, y, hex('#fff4ec'));
      // knot under the chin
      const k = c.m().disc(15.5, 20.5, 1.8).tri(14, 21, 11, 25, 13, 25).tri(17, 21, 20, 25, 18, 25);
      k.paint(c.img, sc);
      return m.union(g);
    },
    prop: {
      hand: [12, 27],
      handFront: true,
      draw: (c) => {
        const wk = ramp('#f0c888', '#c8964e', '#9a6a36', '#6a4430');
        // handle
        for (const [x, y] of [[9, 25], [9, 24], [10, 23], [11, 22], [12, 22], [13, 22], [14, 23], [15, 24], [15, 25]] as const) c.p(x, y, wk[2]);
        // berries
        const bm = c.m().ellipse(12, 25.5, 4, 1.8);
        bm.fill(c.img, hex('#3a3c88'));
        for (const [x, y] of [[10, 25], [12, 24], [14, 25], [11, 26]] as const) c.p(x, y, hex('#7a7ce0'));
        for (const [x, y] of [[13, 25], [9, 26], [15, 26]] as const) c.p(x, y, hex('#e0303a'));
        c.p(12, 25, hex('#ff8a80'));
        // basket
        const m = c.m().rect(8, 27, 9, 5).span(32, 9, 15);
        m.paint(c.img, wk, { split: 15 });
        for (let x = 8; x <= 16; x += 2) for (let y = 28; y <= 31; y += 2) c.p(x + (y % 4 === 0 ? 1 : 0), y, wk[2]);
        for (let x = 8; x <= 16; x++) c.p(x, 27, wk[0]);
      },
    },
  },

  // 9. Kalevi: sauna warden, felt sauna hat, towel round the neck, t-shirt + shorts, vihta
  kalevi: {
    skin: SKIN_ROSY,
    hair: ramp('#e8c890', '#c0965e', '#8e6a44', '#5e4436'),
    eye: EYE_BLUE,
    top: ramp('#b8e0f8', '#7ab8e4', '#5088c0', '#3a5c94'),
    short: true,
    legs: ramp('#5a6ab0', '#3e4a8a', '#2c3466'),
    shoes: ramp('#e8a060', '#b86a3a', '#7a4430'),
    blush: true,
    happyArm: 'thumb',
    over: (c) => {
      // towel round the neck, hanging down both sides
      const tw = ramp('#ffffff', '#f2f0f4', '#c8c4d8', '#9490ac');
      const m = c.m().rect(10, 20, 3, 11).rect(19, 20, 3, 11).span(20, 12, 19).span(21, 12, 13).span(21, 18, 19);
      m.paint(c.img, tw);
      for (const x of [10, 11, 12, 19, 20, 21]) {
        c.p(x, 27, hex('#e05a4a'));
        c.p(x, 28, hex('#e05a4a'));
        c.p(x, 31, x % 2 ? tw[2] : tw[1]);
      }
    },
    fringe: (c) => {
      const m = c.m().rect(7, 10, 2, 4).rect(23, 10, 2, 4);
      paintHair(c, m);
      return m;
    },
    acc: (c) => {
      const fe = ramp('#f8ecd4', '#dcc8a4', '#b09878', '#7c6668');
      const crown = c.m().ellipse(15.5, 6.5, 7.6, 5.5).clip((_, y) => y <= 8);
      const brim = c.m().ellipse(15.5, 9.2, 11, 2.3);
      brim.paint(c.img, fe, { split: 24 });
      crown.paint(c.img, fe, { split: 20 });
      for (let x = 9; x <= 22; x++) c.p(x, 8, fe[2]);
      c.p(11, 3, fe[0]);
      c.p(12, 2, fe[0]);
      c.p(13, 2, fe[0]);
      for (let x = 8; x <= 23; x++) c.p(x, 11, mix(c.s.skin[2], OUT, 0.1));
    },
    prop: leftHold([12, 29], (c) => {
      // vihta (birch whisk): stick + leaf bundle up by the shoulder
      c.p(11, 28, PAL.darkWood[1]);
      c.p(11, 27, PAL.darkWood[1]);
      c.p(10, 26, PAL.darkWood[1]);
      // bundle of individual birch leaves, each shaded on its own
      c.p(9, 26, PAL.darkWood[1]);
      c.p(8, 26, PAL.darkWood[1]);
      for (const [x, y] of [[6, 25], [4, 23.5], [7, 23], [5, 21], [3, 20], [7, 20], [5, 18.5]] as const) {
        const lf = c.m().disc(x, y, 1.6);
        lf.paint(c.img, PAL.leaf, { split: x + 1 });
      }
      for (const [x, y] of [[2, 18], [8, 18], [5, 16], [2, 23]] as const) c.p(x, y, PAL.leaf[1]);
    }),
  },

  // 10. Pirjo: cashier, big blonde perm, orange-red polo, name badge
  pirjo: {
    skin: SKIN,
    hair: ramp('#fff4b0', '#f4d070', '#d4a048', '#a07038'),
    eye: EYE_BLUE,
    top: ramp('#ff9a6a', '#f0603e', '#c03c34', '#862830'),
    short: true,
    legs: ramp('#4a4a68', '#34344e', '#242438'),
    shoes: ramp('#ffffff', '#d8dce8', '#9ca4bc'),
    lashes: true,
    back: (c) => {
      const m = c.m().ellipse(15.5, 11, 11.5, 9.5).disc(5.5, 17, 3).disc(26, 17, 3).disc(7, 20, 2.5).disc(24.5, 20, 2.5);
      m.clip((_, y) => y <= 22);
      paintHair(c, m, [], 25);
      curls(c, m, [[5, 9], [4, 14], [26, 11], [27, 15], [6, 19], [24, 19], [7, 6], [24, 6]]);
    },
    over: (c) => {
      // polo collar + placket
      const t = c.s.top;
      c.m().rows([[21, 11, 14], [22, 12, 14], [21, 17, 20], [22, 17, 19]]).paint(c.img, ramp('#fff0e8', '#ffe0d0', '#e0a898'));
      for (let y = 22; y <= 26; y++) c.p(15, y, t[3]);
      c.p(16, 23, hex('#ffffff'));
      c.p(16, 25, hex('#ffffff'));
      // name badge
      c.m().rect(18, 26, 5, 3).fill(c.img, WHITE);
      c.p(19, 27, t[2]);
      c.p(20, 27, t[2]);
      c.p(21, 27, t[2]);
    },
    fringe: (c) => {
      const m = c.m()
        .ellipse(15.5, 7.5, 10.5, 5.8)
        .disc(8, 4, 3)
        .disc(12.5, 2, 3)
        .disc(18.5, 2, 3)
        .disc(23, 4, 3)
        .disc(9, 7.5, 2)
        .disc(13, 7.4, 2)
        .disc(17.5, 7.4, 2)
        .disc(22, 7.5, 2)
        .rect(5, 8, 4, 10)
        .rect(23, 8, 4, 10);
      m.clip((x, y) => y <= 8 || x <= 8 || x >= 23);
      paintHair(c, m, [[9, 2], [10, 1], [11, 0], [13, 0], [7, 3], [6, 5]], 23);
      curls(c, m, [[10, 5], [15, 3], [20, 5], [6, 10], [25, 9], [6, 14], [24, 14], [17, 6], [12, 6]]);
      // gold hoop earrings
      c.p(7, 16, hex('#f6d050'));
      c.p(24, 16, hex('#f6d050'));
      return m;
    },
  },

  // 11. Rane: burly bald barkeep, big ginger beard, apron, towel over the shoulder
  rane: {
    skin: SKIN_ROSY,
    hair: ramp('#f0a868', '#c87038', '#924a30', '#62302c'),
    eye: EYE_BROWN,
    top: ramp('#6a7090', '#4a4e6c', '#363850', '#262638'),
    short: true,
    hw: 8,
    bald: true,
    legs: ramp('#4a4e6c', '#363850', '#262638'),
    shoes: ramp('#6a4a3a', '#4a3030', '#2e1e24'),
    happyArm: 'thumb',
    bigNose: true,
    brow: hex('#924a30'),
    over: (c) => {
      const ap = ramp('#fffaf0', '#f0e6d4', '#ccbcaa', '#9a8a88');
      const m = c.m().rect(11, 25, 10, 13 - c.b).rect(10, 30, 12, 8 - c.b);
      m.paint(c.img, ap, { split: 20 });
      c.p(11, 24, ap[2]);
      c.p(20, 24, ap[2]);
      c.p(12, 23, ap[2]);
      c.p(19, 23, ap[2]);
      for (let x = 10; x <= 21; x++) c.p(x, 31, ap[2]);
      for (let x = 13; x <= 18; x++) c.p(x, 34, ap[2]);
      c.p(13, 33, ap[2]);
      c.p(18, 33, ap[2]);
    },
    beard: (c) => {
      const m = c.m().ellipse(15.5, 17.5, 8.4, 7).rect(7, 10, 3, 8).rect(22, 10, 3, 8);
      m.clip((x, y) => y >= 15 || x <= 9 || x >= 22);
      m.paint(c.img, c.s.hair, { split: 21 });
      const mo = c.m().rows([[14, 12, 19], [15, 11, 20]]);
      mo.paint(c.img, ramp('#f8b878', '#d88048', '#a85a36', '#703a2e'));
      for (const [x, y] of [[11, 19], [14, 21], [17, 20], [20, 18], [13, 23], [18, 23]] as const) c.p(x, y, c.s.hair[2]);
      // keep a little room for the mouth
      for (let x = 14; x <= 17; x++) c.p(x, 16, c.s.skin[2]);
      for (let x = 14; x <= 17; x++) c.p(x, 17, c.s.hair[2]);
    },
    acc: (c) => {
      // head shine + thick brows
      c.p(11, 4, hex('#fff4ea'));
      c.p(12, 4, hex('#fff4ea'));
      c.p(10, 5, hex('#fff4ea'));
      const br = c.s.hair[2];
      if ((c.pose.brows ?? 'n') === 'n') {
        c.p(10, 9, br);
        c.p(21, 9, br);
      }
    },
    last: (c) => {
      // towel over the right shoulder
      const tw = ramp('#ffffff', '#f2f0f4', '#c8c4d8', '#9490ac');
      const m = c.m().rect(21, 20, 4, 11).span(19, 21, 24);
      m.paint(c.img, tw);
      for (let x = 21; x <= 24; x++) {
        c.p(x, 23, hex('#d84a3e'));
        c.p(x, 27, hex('#d84a3e'));
      }
    },
  },

  // 12. Leena: landlady, tidy short grey hair, teal blazer, clipboard + key ring
  leena: {
    skin: SKIN_OLD,
    hair: ramp('#f6f4f8', '#d0cedc', '#a2a0b8', '#727090'),
    eye: EYE_GREEN,
    top: ramp('#7ed0c4', '#3a9e98', '#2a7276', '#1e4e58'),
    legs: ramp('#4a4a68', '#34344e', '#242438'),
    shoes: ramp('#5a3040', '#3e2030', '#2a1622'),
    lashes: true,
    brow: hex('#8a88a4'),
    over: (c) => {
      c.m().tri(12, 21, 19, 21, 15.5, 28).paint(c.img, ramp('#ffffff', '#f4f0f0', '#d0c8d0'), { noHi: true });
      for (let i = 0; i < 5; i++) {
        c.p(12 + Math.floor(i / 2), 21 + i, c.s.top[0]);
        c.p(19 - Math.floor(i / 2), 21 + i, c.s.top[2]);
      }
      // pearl necklace
      for (const [x, y] of [[13, 22], [14, 23], [15, 23], [16, 23], [17, 22]] as const) c.p(x, y, WHITE);
      c.p(15, 31, c.s.top[3]);
      c.p(15, 34, c.s.top[3]);
    },
    fringe: (c) => {
      const m = c.m().ellipse(15.5, 9.2, 9.4, 7).rect(6, 8, 3, 7).rect(23, 8, 3, 7);
      m.clip((x, y) => x <= 8 || x >= 23 || y <= 7 + (x > 15 ? 1 : 0) - (x > 20 ? 1 : 0));
      m.span(15, 7, 8).span(15, 23, 24);
      paintHair(c, m, [[10, 4], [11, 3], [12, 3], [13, 3], [8, 6], [7, 8]], 22);
      for (const [x, y] of [[14, 5], [17, 6], [20, 5], [9, 10], [24, 10]] as const) c.p(x, y, c.s.hair[2]);
      return m;
    },
    prop: leftHold([14, 30], (c) => {
      c.m().rect(8, 22, 8, 11).paint(c.img, PAL.darkWood);
      c.m().rect(9, 24, 6, 8).fill(c.img, hex('#fbf8f0'));
      for (const y of [25, 27, 29]) for (let x = 10; x <= 13; x++) c.p(x, y, hex('#9a98b8'));
      c.p(14, 29, hex('#d84a3e'));
      c.m().rect(10, 22, 4, 2).paint(c.img, PAL.metal);
      // key ring hanging from the hand
      const k = hex('#f0d060');
      c.p(15, 32, k);
      c.p(16, 33, k);
      c.p(14, 33, k);
      c.p(15, 34, k);
      c.p(14, 35, PAL.metal[1]);
      c.p(14, 36, PAL.metal[1]);
      c.p(16, 35, k);
      c.p(17, 36, k);
    }),
  },

  // 13. Hannele: teacher, round glasses, side ponytail, mustard cardigan, book + chalk
  hannele: {
    skin: SKIN,
    hair: ramp('#a06a4e', '#6e4232', '#4e2a2a', '#361c24'),
    eye: EYE_BROWN,
    top: ramp('#ffe08a', '#e8b440', '#bc8432', '#86562e'),
    legs: ramp('#6a5a8a', '#4c3e6a', '#342a4c'),
    shoes: ramp('#8a4a3a', '#5e3030', '#3e1e24'),
    lashes: true,
    over: (c) => {
      c.m().tri(12, 21, 19, 21, 15.5, 29).paint(c.img, PAL.teal, { noHi: true });
      for (const y of [30, 33]) c.p(15, y, hex('#fff4d0'));
    },
    fringe: (c) => {
      const m = c.m().ellipse(15.5, 9, 9.2, 6.6).rect(6, 8, 3, 9).rect(23, 8, 3, 7);
      m.clip((x, y) => x <= 8 || x >= 23 || y <= 6 + Math.abs(x - 15.5) * 0.45);
      paintHair(c, m, [[10, 4], [11, 3], [12, 3], [9, 5], [8, 7]], 22);
      c.p(15, 3, c.s.hair[3]);
      c.p(16, 3, c.s.hair[3]);
      c.p(15, 4, c.s.hair[3]);
      return m;
    },
    acc: glasses(hex('#5a3a4a'), true),
    last: (c) => {
      // side ponytail over the right shoulder
      const m = c.m().disc(24, 15, 2.2).line(24.5, 16, 24, 27, 3).disc(23.5, 27.5, 1.5);
      m.paint(c.img, c.s.hair, { split: 25 });
      c.p(24, 18, c.s.hair[0]);
      c.p(24, 22, c.s.hair[0]);
      c.p(23, 16, hex('#e84a6a'));
      c.p(24, 16, hex('#e84a6a'));
      c.p(25, 16, hex('#a8304a'));
    },
    prop: leftHold([14, 29], (c) => {
      const bk = ramp('#7ad09a', '#3e9a6a', '#2a6e52', '#1e4a40');
      c.m().rect(8, 23, 7, 9).paint(c.img, bk, { split: 13 });
      for (let y = 24; y <= 30; y++) c.p(8, y, bk[3]);
      for (let x = 10; x <= 13; x++) c.p(x, 25, hex('#f6d050'));
      c.p(15, 24, hex('#fbf8f0'));
      c.p(15, 25, hex('#fbf8f0'));
    }),
    handItem: (c, x, y) => {
      c.p(x + 1, y - 2, WHITE);
      c.p(x + 1, y - 1, WHITE);
      c.p(x + 2, y - 3, hex('#e8e8f0'));
    },
  },

  // 14. Aili: volunteer librarian, grey curly bun, round glasses, lavender cardigan, knitting
  aili: {
    skin: SKIN_OLD,
    hair: ramp('#ffffff', '#e4e2ec', '#b6b2c8', '#827c9a'),
    eye: EYE_BLUE,
    top: ramp('#dcc8f0', '#b49ad8', '#8a6cb4', '#5e4884'),
    legs: ramp('#6a5a7a', '#4c3e5c', '#342a44'),
    shoes: ramp('#5a3a3a', '#3e2828', '#2a1a1e'),
    lashes: true,
    blush: true,
    brow: hex('#a8a4bc'),
    back: (c) => {
      const m = c.m().disc(15.5, 2.5, 4.3).disc(12.5, 3.5, 2).disc(18.5, 3.5, 2);
      paintHair(c, m, [[14, 0], [13, 1], [15, 0]], 18);
      curls(c, m, [[14, 2], [17, 1], [16, 4]]);
    },
    over: (c) => {
      for (let x = 12; x <= 19; x++) c.p(x, 21, WHITE);
      c.p(13, 22, hex('#e8e4f0'));
      c.p(18, 22, hex('#e8e4f0'));
      for (const y of [25, 29, 33]) c.p(15, y, hex('#f4ecff'));
      for (let y = 22; y <= 37; y++) c.p(16, y, c.s.top[2]);
    },
    fringe: (c) => {
      const m = c.m().ellipse(15.5, 9, 9.2, 6.6).disc(8, 9, 2.5).disc(23, 9, 2.5).rect(7, 9, 2, 6).rect(23, 9, 2, 6);
      m.clip((x, y) => x <= 8 || x >= 23 || y <= 6.5 + Math.max(0, Math.abs(x - 15.5) - 3) * 0.8);
      paintHair(c, m, [[10, 4], [11, 3], [12, 3], [13, 3], [8, 7]], 22);
      curls(c, m, [[9, 6], [13, 5], [18, 4], [22, 6], [7, 11], [24, 11]]);
      return m;
    },
    acc: glasses(hex('#c89a40'), true),
    prop: leftHold([12, 29], (c) => {
      // knitting: needles + piece + yarn ball
      const kn = ramp('#ff9a8a', '#e05a5a', '#a83a48', '#702a3a');
      c.m().rect(10, 25, 9, 5).paint(c.img, kn);
      for (let x = 11; x <= 18; x += 2) for (let y = 26; y <= 29; y += 2) c.p(x, y, kn[2]);
      const nd = PAL.metal[1];
      for (let k = 0; k < 9; k++) {
        c.p(8 + k, 22 + Math.floor(k / 2), nd);
        c.p(20 - k, 22 + Math.floor(k / 2), nd);
      }
      c.p(8, 22, hex('#f6d050'));
      c.p(20, 22, hex('#f6d050'));
      c.m().disc(19, 31, 2.2).paint(c.img, ramp('#9ad0f4', '#5c94dc', '#3c60b4', '#2c3c7c'));
      c.p(18, 30, hex('#d8eeff'));
    }),
  },

  // 15. Arvo: pavilion host, slicked-back silver hair, white shirt, suspenders, bow tie
  arvo: {
    skin: SKIN_OLD,
    hair: ramp('#e8e8f2', '#b0b0c4', '#7a7894', '#504c68'),
    eye: EYE_BROWN,
    top: ramp('#ffffff', '#f2f0f4', '#ccc8d8', '#9a96b0'),
    legs: ramp('#5a5068', '#3e364c', '#2a2436'),
    shoes: ramp('#5a4a5a', '#3a2a3a', '#221a26'),
    bigNose: true,
    over: (c) => {
      const su = ramp('#e06a6a', '#b03a48', '#7e2638');
      for (let y = 22; y <= 37; y++) {
        c.p(11, y, su[1]);
        c.p(12, y, su[2]);
        c.p(19, y, su[1]);
        c.p(20, y, su[2]);
      }
      c.p(11, 33, hex('#f6d050'));
      c.p(19, 33, hex('#f6d050'));
      for (const y of [26, 30, 34]) c.p(15, y, c.s.top[2]);
      // bow tie
      const bt = c.m().tri(12, 20, 12, 24, 15.5, 22).tri(19, 20, 19, 24, 15.5, 22);
      bt.paint(c.img, su);
      c.m().rect(15, 21, 2, 2).fill(c.img, su[2]);
    },
    fringe: (c) => {
      const m = c.m().ellipse(15.5, 9.4, 8.9, 6.6).rect(7, 8, 2, 7).rect(23, 8, 2, 7);
      m.clip((x, y) => y <= 6 + Math.max(0, Math.abs(x - 15.5) - 4) * 1.6);
      paintHair(c, m, [], 22);
      // combed-back lines
      for (const y of [4, 6]) for (let x = 9; x <= 21; x++) if (m.has(x, y + c.b) && (x + y) % 4 !== 0) c.p(x, y, c.s.hair[0]);
      for (let x = 10; x <= 21; x++) if (m.has(x, 5 + c.b)) c.p(x, 5, c.s.hair[1]);
      return m;
    },
    beard: (c) => {
      for (let x = 13; x <= 18; x++) c.p(x, 15, c.s.hair[2]);
    },
  },
};
