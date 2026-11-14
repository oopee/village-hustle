/**
 * The 15 clickable buildings of the town map. Each builder draws in local
 * (unpadded) coordinates and reports where its door is, plus anchors for overlays.
 */
import { Img, type RGBA } from '../raster';
import type { LocationId } from './types';
import {
  F,
  OUT,
  R,
  SHADOW,
  chimney,
  cornerBoard,
  door,
  hash,
  leafyTree,
  mix,
  roofFlat,
  roofFront,
  roofHip,
  roofSide,
  sign,
  wall,
  windowAt,
  withA,
  type Ramp,
} from './map-kit';

export interface BuildingArt {
  img: Img;
  /** Door centre x and the y just below its step, in local coordinates. */
  door: [number, number];
  anchors: Record<string, [number, number]>;
}

/** 3x5 text scaled up k times. */
export function bigText(img: Img, str: string, x: number, y: number, c: RGBA, k = 2, shadow?: RGBA) {
  const t = new Img(Img.textWidth(str) + 2, 8);
  t.text(str, 0, 1, c);
  for (let j = 0; j < t.h; j++)
    for (let i = 0; i < t.w; i++) {
      if (!t.get(i, j)[3]) continue;
      if (shadow) img.rect(x + i * k + 1, y + (j - 1) * k + 1, k, k, shadow);
    }
  for (let j = 0; j < t.h; j++)
    for (let i = 0; i < t.w; i++) if (t.get(i, j)[3]) img.rect(x + i * k, y + (j - 1) * k, k, k, c);
}

function logEnds(img: Img, x: number, y0: number, y1: number, r: Ramp = R.logs) {
  for (let y = y0; y <= y1 - 2; y += 4) {
    img.rect(x, y, 3, 3, r[3]);
    img.set(x, y, r[4]);
    img.set(x + 2, y + 2, r[1]);
    img.set(x + 1, y + 1, r[2]);
  }
}

function flowerPot(img: Img, x: number, y: number, flower: RGBA) {
  img.rect(x, y + 2, 4, 3, R.brick[3]);
  img.hline(x, x + 3, y + 2, R.brick[4]);
  img.vline(x + 3, y + 2, y + 4, R.brick[1]);
  img.rect(x, y, 4, 2, R.leaf[2]);
  img.set(x + 1, y - 1, flower);
  img.set(x + 2, y, flower);
  img.set(x, y, R.leaf[3]);
}

/** Side-view bicycle, 10x6, top-left at x,y. */
function bicycle(img: Img, x: number, y: number, frame: Ramp) {
  for (const wx of [x + 2, x + 8]) {
    for (const [i, j] of [
      [-1, -2],
      [0, -2],
      [1, -2],
      [-2, -1],
      [2, -1],
      [-2, 0],
      [2, 0],
      [-2, 1],
      [2, 1],
      [-1, 2],
      [0, 2],
      [1, 2],
    ])
      img.set(wx + i, y + 3 + j, OUT);
    img.set(wx, y + 3, R.metal[3]);
  }
  img.line(x + 2, y + 3, x + 5, y + 3, frame[3]);
  img.line(x + 5, y + 3, x + 7, y + 1, frame[3]);
  img.line(x + 4, y + 1, x + 7, y + 1, frame[2]);
  img.line(x + 4, y + 1, x + 5, y + 3, frame[2]);
  img.line(x + 8, y + 3, x + 7, y, frame[2]);
  img.hline(x + 3, x + 4, y, OUT);
  img.hline(x + 7, x + 8, y - 1, OUT);
}

function lamp(img: Img, x: number, y: number) {
  img.set(x, y, R.lit[4]);
  img.set(x, y + 1, R.lit[2]);
  img.set(x - 1, y, OUT);
  img.set(x + 1, y, OUT);
}

// ------------------------------------------------------------------ parents_house
function parentsHouse(): BuildingArt {
  const img = new Img(84, 58);
  // main house
  roofSide(img, 20, 6, 63, 18, R.roofDark, 'tile');
  // dormer (frontespiisi)
  img.rect(42, 15, 16, 9, R.falu[2]);
  wall(img, 42, 15, 16, 9, R.falu, 'boards');
  cornerBoard(img, 42, 15, 9, R.white, 1);
  cornerBoard(img, 57, 15, 9, R.white, 1);
  windowAt(img, 47, 17, 6, 5, { lit: true, sill: false });
  roofFront(img, 40, 59, 15, 9, 3, R.roofDark, null);
  chimney(img, 66, 1, 9);
  wall(img, 22, 24, 58, 30, R.falu, 'boards', 2);
  cornerBoard(img, 22, 24, 30);
  cornerBoard(img, 78, 24, 30);
  windowAt(img, 46, 31, 8, 11, { lit: true, box: true });
  windowAt(img, 64, 31, 8, 11, { lit: false, box: true });
  // glazed porch (lasikuisti), projecting forward
  roofSide(img, 1, 27, 34, 8, R.roofDark, 'tile', 4);
  img.rect(3, 35, 30, 20, R.white[3]);
  // glass band
  img.rect(4, 36, 28, 9, R.lit[3]);
  for (let j = 36; j < 45; j++) if (j > 40) img.hline(4, 31, j, R.lit[2]);
  img.hline(4, 31, 36, R.lit[1]);
  for (let x = 4; x <= 32; x += 4) img.vline(x, 36, 45, R.white[3]);
  img.hline(3, 32, 40, R.white[3]);
  img.vline(32, 35, 54, R.white[1]);
  img.vline(3, 35, 54, R.white[4]);
  // lower boards (white)
  for (let x = 4; x < 32; x++) img.vline(x, 46, 53, x % 3 === 0 ? R.white[2] : R.white[3]);
  img.hline(3, 32, 46, R.white[4]);
  img.hline(3, 32, 54, R.white[1]);
  door(img, 14, 42, 7, 12, R.wood, { glass: true, steps: 2 });
  flowerPot(img, 5, 51, F.red);
  flowerPot(img, 25, 51, F.lupinePink);
  return { img, door: [17, 57], anchors: { smoke: [68, 0] } };
}

// ------------------------------------------------------------------ job_centre
function jobCentre(): BuildingArt {
  const img = new Img(92, 46);
  roofSide(img, 0, 2, 92, 12, R.roofBrown, 'metal');
  wall(img, 2, 14, 88, 30, R.pale, 'panel', 5);
  // coloured band at the plinth
  img.rect(2, 38, 88, 2, R.bluegrey[2]);
  img.hline(2, 89, 38, R.bluegrey[3]);
  const fr = R.bluegrey;
  windowAt(img, 6, 22, 14, 10, { lit: true, frame: fr, panes: 3, cross: false });
  windowAt(img, 72, 22, 14, 10, { lit: false, frame: fr, panes: 3, cross: false });
  windowAt(img, 24, 25, 6, 7, { lit: false, frame: fr, cross: false });
  windowAt(img, 62, 25, 6, 7, { lit: true, frame: fr, cross: false });
  // entrance canopy + glass door
  door(img, 41, 29, 10, 13, R.bluegrey, { glass: true, double: true, frame: fr, steps: 1 });
  img.rect(37, 26, 18, 2, R.concrete[3]);
  img.hline(37, 54, 26, R.concrete[4]);
  img.hline(37, 54, 28, withA(SHADOW, 110));
  sign(img, 46, 15, 'KYLÄTALO', R.flagBlue, R.white[4]);
  // potted plant + bike
  flowerPot(img, 32, 39, F.daisy);
  flowerPot(img, 58, 39, F.dandelion);
  return { img, door: [46, 44], anchors: {} };
}

// ------------------------------------------------------------------ station
function station(): BuildingArt {
  const img = new Img(102, 58);
  // wings
  roofSide(img, 0, 20, 36, 15, R.roofRed, 'tile');
  roofSide(img, 66, 20, 36, 15, R.roofRed, 'tile', 2);
  wall(img, 2, 35, 32, 21, R.ochre, 'boards');
  wall(img, 68, 35, 32, 21, R.ochre, 'boards', 3);
  // central block with front gable + clock
  wall(img, 32, 20, 38, 36, R.ochre, 'boards', 4);
  roofFront(img, 30, 71, 21, 5, 6, R.roofRed, R.ochre);
  // fretwork trim under wing eaves
  for (const [x0, x1] of [
    [2, 33],
    [68, 99],
  ])
    for (let x = x0; x <= x1; x++) {
      img.set(x, 35, R.white[3]);
      if (x % 3 === 0) img.set(x, 36, R.white[2]);
    }
  cornerBoard(img, 2, 35, 21);
  cornerBoard(img, 98, 35, 21);
  cornerBoard(img, 32, 20, 36);
  cornerBoard(img, 68, 20, 36);
  // clock
  img.disc(50.5, 14.5, 4, OUT);
  img.disc(50.5, 14.5, 3.2, R.white[4]);
  img.set(50, 12, OUT);
  img.set(50, 13, OUT);
  img.set(50, 14, OUT);
  img.set(51, 14, OUT);
  img.set(52, 14, OUT);
  img.set(49, 16, R.white[2]);
  // sign
  sign(img, 51, 24, 'RYTTYLÄ', R.white, R.roofRed[1]);
  door(img, 46, 41, 10, 14, R.roofRed, { double: true, steps: 1 });
  windowAt(img, 36, 40, 6, 10, { lit: true });
  windowAt(img, 60, 40, 6, 10, { lit: false });
  windowAt(img, 8, 40, 6, 10, { lit: false });
  windowAt(img, 22, 40, 6, 10, { lit: true });
  windowAt(img, 74, 40, 6, 10, { lit: true });
  windowAt(img, 88, 40, 6, 10, { lit: false });
  return { img, door: [51, 57], anchors: {} };
}

// ------------------------------------------------------------------ bank
function bank(): BuildingArt {
  const img = new Img(66, 52);
  roofHip(img, 0, 2, 66, 19, 14, R.roofGreen);
  wall(img, 2, 21, 62, 29, R.beige, 'stone', 6);
  // frieze + sign
  img.rect(2, 21, 62, 2, R.beige[4]);
  img.hline(2, 63, 23, R.beige[1]);
  sign(img, 33, 25, 'PANKKI', R.roofGreen, R.white[4]);
  // portico
  img.rect(20, 35, 26, 2, R.white[4]);
  img.hline(20, 45, 37, R.white[1]);
  for (const cx of [22, 41]) {
    img.rect(cx, 38, 3, 11, R.white[3]);
    img.vline(cx, 38, 48, R.white[4]);
    img.vline(cx + 2, 38, 48, R.white[1]);
    img.hline(cx - 1, cx + 3, 38, R.white[4]);
  }
  door(img, 29, 38, 8, 11, R.roofGreen, { glass: true, double: true, steps: 1 });
  for (const wx of [6, 13, 49, 56]) {
    windowAt(img, wx, 36, 4, 9, { lit: wx === 13 || wx === 56, cross: false });
    img.set(wx + 1, 35, R.white[4]);
    img.set(wx + 2, 35, R.white[4]);
  }
  return { img, door: [33, 51], anchors: {} };
}

// ------------------------------------------------------------------ sawmill (furniture factory)
function sawmill(): BuildingArt {
  const img = new Img(102, 60);
  // hall with north-light (sawtooth) roof, teeth facing the viewer
  const hx0 = 18;
  const hx1 = 101;
  const wallTop = 30;
  const teeth = 4;
  const T = (hx1 - hx0 + 1) / teeth;
  const depth = 9;
  const P = 9;
  for (let x = hx0; x <= hx1; x++) {
    const k = ((x - hx0) % T) / (T - 1);
    const prof = Math.round(P * k);
    const ey = wallTop - prof;
    for (let y = ey - depth; y <= ey; y++) {
      const v = y - (ey - depth);
      let c = v % 3 === 2 ? R.metal[2] : R.metal[3];
      if (y === ey - depth) c = R.metal[4];
      img.set(x, y, c);
    }
    // glazed north light strip at the high end of each tooth
    if (k > 0.86) for (let y = ey - depth; y <= ey; y++) img.set(x, y, y % 3 === 0 ? R.glass[3] : R.glass[2]);
    img.set(x, ey, R.metal[1]);
    // gable wall (brick) under the profile
    for (let y = ey + 1; y < wallTop; y++) img.set(x, y, (y + x) % 6 === 0 ? R.brick[1] : R.brick[2]);
  }
  wall(img, hx0, wallTop, hx1 - hx0 + 1, 28, R.brick, 'brick', 7);
  for (const wx of [24, 38, 84]) windowAt(img, wx, 36, 10, 8, { lit: wx === 38, panes: 3, cross: false, frame: R.white });
  // big double door + sign
  sign(img, 71, 31, 'HUONEKALU', R.cream, R.brick[0]);
  door(img, 63, 43, 13, 14, R.wood, { double: true, steps: 0, frame: R.wood });
  img.hline(61, 77, 57, R.stone[3]);
  // lookout tower (timber)
  const tw = R.wood;
  for (const px of [2, 14]) {
    img.rect(px, 18, 2, 40, tw[2]);
    img.vline(px, 18, 57, tw[3]);
  }
  for (let y = 22; y < 56; y += 9) {
    img.line(3, y, 14, y + 8, tw[1]);
    img.line(14, y, 3, y + 8, tw[1]);
    img.hline(2, 15, y, tw[3]);
  }
  // cabin
  wall(img, 0, 10, 18, 9, R.wood, 'boards', 9);
  img.rect(2, 12, 14, 3, R.glass[1]);
  img.hline(2, 15, 12, R.glass[3]);
  for (let x = 4; x < 16; x += 4) img.vline(x, 12, 14, R.wood[3]);
  img.rect(-1 + 1, 17, 18, 2, R.wood[3]);
  img.hline(0, 17, 18, R.wood[1]);
  roofHip(img, 0, 1, 18, 10, 9, R.roofDark);
  img.set(8, 0, R.stone[3]);
  return { img, door: [69, 58], anchors: {} };
}

// ------------------------------------------------------------------ department_store (hardware)
function hardware(): BuildingArt {
  const img = new Img(82, 54);
  roofSide(img, 0, 0, 82, 15, R.metal, 'metal');
  wall(img, 2, 15, 78, 34, R.bluegrey, 'panel', 11);
  cornerBoard(img, 2, 15, 34);
  cornerBoard(img, 78, 15, 34);
  // big sign
  img.rect(17, 18, 46, 14, R.falu[2]);
  img.hline(17, 62, 18, R.falu[3]);
  img.hline(17, 62, 31, R.falu[1]);
  img.frame(16, 17, 48, 16, OUT);
  bigText(img, 'RAUTA', 21, 21, R.white[4], 2, R.falu[0]);
  // shop window with goods
  windowAt(img, 6, 35, 34, 11, { lit: true, cross: false, sill: false });
  img.vline(23, 35, 45, R.white[3]);
  // paint cans, shovel
  for (let i = 0; i < 4; i++) {
    img.rect(8 + i * 4, 42, 3, 4, [R.falu[3], R.flagBlue[3], F.dandelion, R.green[3]][i]);
    img.set(8 + i * 4, 42, R.white[4]);
  }
  img.vline(30, 37, 45, R.wood[2]);
  img.rect(29, 43, 3, 3, R.metal[3]);
  img.vline(35, 38, 45, R.wood[2]);
  img.hline(33, 37, 38, R.metal[2]);
  door(img, 66, 34, 9, 14, R.bluegrey, { glass: true, steps: 1 });
  // tools leaning on the wall
  for (const [x, c] of [
    [46, R.wood[3]],
    [49, R.wood[2]],
  ] as [number, RGBA][]) {
    img.vline(x, 34, 48, c);
    img.hline(x - 1, x + 1, 34, R.metal[3]);
  }
  img.rect(52, 40, 3, 8, R.metal[2]); // shovel
  img.vline(53, 33, 40, R.wood[3]);
  // flea-market table
  img.rect(4, 46, 20, 3, R.wood[3]);
  img.hline(4, 23, 46, R.wood[4]);
  img.vline(5, 49, 52, R.wood[1]);
  img.vline(22, 49, 52, R.wood[1]);
  const goods: RGBA[] = [R.white[4], F.red, R.flagBlue[3], F.dandelion, R.green[3], F.pink, R.ochre[3]];
  for (let i = 0; i < 7; i++) img.rect(5 + i * 3 - (i % 2), 44 + (i % 2), 2, 2, goods[i]);
  // wheelbarrow
  img.rect(56, 47, 9, 4, R.green[2]);
  img.hline(56, 64, 47, R.green[4]);
  img.hline(57, 63, 50, R.green[1]);
  img.disc(59, 52, 1.5, OUT);
  img.line(64, 49, 69, 51, R.wood[2]);
  return { img, door: [70, 50], anchors: {} };
}

// ------------------------------------------------------------------ health_centre
function healthCentre(): BuildingArt {
  const img = new Img(76, 46);
  roofFlat(img, 0, 0, 76, 10, R.concrete);
  // rooftop unit
  img.rect(52, 3, 9, 4, R.metal[3]);
  img.hline(52, 60, 3, R.metal[4]);
  img.hline(52, 60, 6, R.metal[1]);
  wall(img, 1, 10, 74, 33, R.white, 'plaster');
  // ribbon window
  img.rect(3, 13, 70, 10, R.concrete[1]);
  for (let x = 4; x < 72; x += 9) windowAt(img, x, 14, 7, 7, { lit: x % 18 === 4, cross: false, sill: false, frame: R.concrete });
  img.hline(2, 73, 24, R.concrete[4]);
  img.hline(2, 73, 25, R.concrete[2]);
  // green cross panel
  img.rect(4, 28, 11, 11, R.white[4]);
  img.frame(3, 27, 13, 13, R.green[1]);
  img.rect(8, 29, 3, 9, R.green[3]);
  img.rect(5, 32, 9, 3, R.green[3]);
  img.hline(8, 10, 29, R.green[4]);
  sign(img, 35, 29, 'TERVEYS', R.green, R.white[4]);
  door(img, 61, 29, 9, 13, R.concrete, { glass: true, double: true, steps: 1 });
  img.rect(58, 26, 15, 2, R.concrete[3]);
  img.hline(58, 72, 26, R.concrete[4]);
  return { img, door: [65, 44], anchors: {} };
}

// ------------------------------------------------------------------ cottage
function cottage(): BuildingArt {
  const img = new Img(98, 52);
  // apple tree behind the woodshed
  const tree = leafyTree(28, 'apple', 5);
  img.blit(tree, 18, 0);
  // little sauna hut
  roofSide(img, 0, 24, 23, 9, R.roofBrown, 'shingle', 3);
  wall(img, 1, 33, 21, 16, R.logs, 'logs', 2);
  logEnds(img, 0, 34, 48);
  logEnds(img, 20, 34, 48);
  door(img, 12, 37, 6, 11, R.wood, { steps: 0 });
  windowAt(img, 5, 37, 3, 3, { lit: true, cross: false, sill: false, frame: R.wood });
  img.rect(5, 19, 2, 6, R.metal[1]);
  img.hline(4, 7, 19, R.metal[3]);
  // woodshed
  img.rect(24, 30, 18, 2, R.wood[1]);
  roofSide(img, 23, 27, 20, 6, R.roofBrown, 'shingle', 6);
  img.rect(25, 33, 16, 15, R.wood[0]);
  for (let y = 34; y < 48; y += 3)
    for (let x = 25 + ((y / 3) % 2); x < 41; x += 3) {
      img.rect(x, y, 2, 2, R.logs[4]);
      img.set(x + 1, y + 1, R.logs[2]);
    }
  for (const px of [24, 41]) {
    img.vline(px, 33, 48, R.wood[3]);
  }
  // flagpole
  img.vline(45, 2, 49, R.white[3]);
  img.vline(46, 3, 49, R.white[1]);
  img.set(45, 1, F.gold);
  img.set(46, 1, F.gold);
  img.hline(43, 48, 49, R.stone[2]);
  // main cottage
  roofSide(img, 48, 14, 50, 17, R.roofBrown, 'shingle', 8);
  chimney(img, 60, 8, 9);
  wall(img, 50, 31, 46, 19, R.falu, 'boards', 8);
  cornerBoard(img, 50, 31, 19);
  cornerBoard(img, 94, 31, 19);
  windowAt(img, 57, 35, 7, 8, { lit: true, box: true });
  windowAt(img, 71, 35, 7, 8, { lit: false, box: true });
  door(img, 84, 37, 7, 12, R.wood, { steps: 1, frame: R.white });
  return { img, door: [87, 51], anchors: { smoke: [62, 7], smoke2: [6, 18], flag: [47, 2] } };
}

// ------------------------------------------------------------------ sauna (Ykslammi beach)
function sauna(): BuildingArt {
  const img = new Img(94, 46);
  // smoke sauna
  roofSide(img, 0, 8, 56, 14, R.roofBrown, 'shingle', 12);
  // smoke vent gap under the ridge
  img.rect(24, 9, 6, 2, R.logs[0]);
  wall(img, 2, 22, 52, 21, R.logs, 'logs', 4);
  // soot stains above the door
  for (let x = 38; x < 48; x++) for (let y = 24; y < 28; y++) if (hash(x, y, 4) > 0.45) img.set(x, y, mix(R.logs[1], R.roofDark[0], 0.5));
  logEnds(img, 0, 23, 43);
  logEnds(img, 53, 23, 43);
  sign(img, 20, 27, 'YKSLAMMI', R.wood, R.cream[4]);
  door(img, 40, 30, 7, 13, R.logs, { steps: 0, frame: R.logs });
  img.hline(38, 49, 43, R.stone[3]);
  // laavu (lean-to)
  const lx = 60;
  // foreshortened roof plane
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 34; i++) {
      const k = j % 3;
      img.set(lx + i, 10 + j, k === 2 ? R.roofBrown[1] : (i + (Math.floor(j / 3) % 2) * 2) % 4 === 0 ? R.roofBrown[1] : k === 0 ? R.roofBrown[3] : R.roofBrown[2]);
    }
  img.hline(lx, lx + 33, 10, R.roofBrown[4]);
  img.vline(lx, 10, 17, R.roofBrown[3]);
  // front beam of the high open side
  img.rect(lx, 18, 34, 2, R.logs[3]);
  img.hline(lx, lx + 33, 18, R.logs[4]);
  // roof underside, warmly lit, sloping down to the low back wall
  for (let j = 0; j < 7; j++) img.hline(lx + 2, lx + 31, 20 + j, j % 2 ? R.wood[2] : R.wood[3]);
  for (let x = lx + 5; x < lx + 31; x += 6) img.vline(x, 20, 26, R.wood[1]);
  img.rect(lx + 2, 27, 30, 7, R.logs[1]);
  for (let y = 27; y < 34; y += 3) img.hline(lx + 2, lx + 31, y, R.logs[0]);
  img.hline(lx + 2, lx + 31, 28, R.logs[2]);
  // bench
  img.rect(lx + 3, 33, 28, 3, R.wood[3]);
  img.hline(lx + 3, lx + 30, 33, R.wood[4]);
  img.hline(lx + 3, lx + 30, 35, R.wood[1]);
  // side walls seen edge-on + corner posts
  for (const px of [lx, lx + 32]) {
    img.rect(px, 18, 2, 20, R.logs[2]);
    img.vline(px, 18, 37, R.logs[3]);
  }
  // campfire ring
  const fx = lx + 17;
  const fy = 41;
  for (let a = 0; a < 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    const sx = Math.round(fx + Math.cos(t) * 6);
    const sy = Math.round(fy + Math.sin(t) * 3);
    img.rect(sx - 1, sy - 1, 2, 2, R.stone[2]);
    img.set(sx - 1, sy - 1, R.stone[4]);
  }
  img.ellipse(fx, fy, 4, 1.6, R.roofDark[0]);
  img.line(fx - 3, fy + 1, fx + 3, fy - 1, R.wood[2]);
  img.line(fx - 3, fy - 1, fx + 3, fy + 1, R.wood[1]);
  img.set(fx, fy, F.redHi);
  // stump seats
  for (const [x, y] of [
    [lx + 4, 40],
    [lx + 28, 40],
  ]) {
    img.rect(x, y, 4, 3, R.wood[2]);
    img.hline(x, x + 3, y, R.wood[4]);
  }
  return { img, door: [43, 44], anchors: { smoke: [26, 6], fire: [fx, fy] } };
}

// ------------------------------------------------------------------ village_shop (Sale)
function shop(): BuildingArt {
  const img = new Img(74, 48);
  roofFlat(img, 0, 0, 74, 9, R.concrete, 5);
  wall(img, 1, 9, 72, 36, R.white, 'plaster');
  // awning band with lettering
  img.rect(1, 9, 72, 12, R.orange[2]);
  img.hline(1, 72, 9, R.orange[4]);
  img.hline(1, 72, 10, R.orange[3]);
  img.hline(1, 72, 20, R.orange[0]);
  bigText(img, 'SALE', 22, 12, R.white[4], 2, R.orange[0]);
  img.hline(1, 72, 21, withA(SHADOW, 120));
  // glass front with shelves inside
  img.rect(3, 23, 52, 18, R.white[3]);
  for (let j = 24; j < 40; j++) img.hline(4, 53, j, j < 30 ? R.lit[3] : R.lit[2]);
  for (let y = 28; y < 40; y += 5)
    for (let x = 5; x < 53; x += 2) img.set(x, y, [F.red, R.green[3], F.dandelion, R.flagBlue[3], R.white[4]][Math.floor(hash(x, y, 2) * 5)]);
  for (let x = 4; x < 54; x += 10) img.vline(x, 24, 39, R.white[2]);
  // bottle return sign
  img.rect(57, 25, 5, 7, R.flagBlue[2]);
  img.frame(56, 24, 7, 9, OUT);
  img.vline(59, 26, 30, R.white[4]);
  img.rect(58, 28, 3, 3, R.white[4]);
  door(img, 63, 28, 9, 14, R.concrete, { glass: true, double: true, steps: 1 });
  // bicycle rack with bikes
  for (let x = 4; x < 30; x += 5) {
    img.vline(x, 42, 46, R.metal[3]);
    img.set(x, 42, R.metal[4]);
  }
  img.hline(4, 29, 46, R.metal[1]);
  bicycle(img, 6, 40, R.flagBlue);
  bicycle(img, 18, 40, R.falu);
  return { img, door: [67, 46], anchors: {} };
}

// ------------------------------------------------------------------ grill (Vanha Trokari)
function grill(): BuildingArt {
  const img = new Img(88, 62);
  // rooftop terrace deck
  for (let j = 0; j < 16; j++)
    for (let i = 0; i < 88; i++) img.set(i, j, j % 3 === 2 ? R.wood[2] : (i + (Math.floor(j / 3) % 2) * 5) % 10 === 0 ? R.wood[2] : R.wood[3]);
  img.hline(0, 87, 0, R.white[4]);
  img.vline(0, 0, 15, R.white[3]);
  img.vline(87, 0, 15, R.white[1]);
  // parasols seen from above (shadow first)
  // café parasols seen from the side: striped dome canopy, scalloped hem, pole, table
  const umbrella = (cx: number, a: Ramp) => {
    img.ellipse(cx + 3, 11, 6, 1.6, mix(R.wood[2], SHADOW, 0.45));
    img.vline(cx, 4, 11, R.metal[1]);
    img.hline(cx - 3, cx + 3, 9, R.white[4]);
    img.hline(cx - 3, cx + 3, 10, R.white[1]);
    img.vline(cx - 3, 10, 11, R.metal[1]);
    img.vline(cx + 3, 10, 11, R.metal[1]);
    for (let y = 0; y <= 5; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - ((5 - y) / 5.6) ** 2)) * 7);
      for (let x = cx - half; x <= cx + half; x++) {
        const stripe = Math.floor((x - cx + 7 + 1) / 3) % 2 === 0;
        const ramp = stripe ? a : R.white;
        const side = x - cx;
        let c = ramp[3];
        if (side < -half + 2 && y < 4) c = ramp[4];
        if (side > half - 3) c = ramp[2];
        if (y === 5) c = ramp[1];
        if (y === 5 && (x - cx) % 2 !== 0) continue; // scalloped hem
        img.set(x, y, c);
      }
    }
    img.set(cx, 0, R.white[4]);
    img.set(cx - 2, 1, a[4]);
  };
  umbrella(15, R.falu);
  umbrella(44, R.green);
  umbrella(72, R.falu);
  // railing along the front of the terrace
  img.hline(0, 87, 13, R.white[4]);
  for (let x = 0; x < 88; x += 3) img.vline(x, 13, 15, R.white[3]);
  img.hline(0, 87, 16, R.white[2]);
  // two storeys
  wall(img, 1, 17, 86, 42, R.sage, 'boards', 13);
  cornerBoard(img, 1, 17, 42);
  cornerBoard(img, 85, 17, 42);
  for (let k = 0; k < 6; k++) windowAt(img, 9 + k * 13, 21, 6, 9, { lit: k % 3 !== 1, shutters: undefined });
  // cornice between floors
  img.rect(1, 34, 86, 3, R.white[3]);
  img.hline(1, 86, 34, R.white[4]);
  img.hline(1, 86, 37, withA(SHADOW, 110));
  sign(img, 44, 36, 'TROKARI', R.roofDark, F.dandelionHi);
  // ground floor
  windowAt(img, 6, 44, 13, 9, { lit: true, panes: 3, cross: false });
  windowAt(img, 23, 44, 10, 9, { lit: true, cross: false });
  windowAt(img, 55, 44, 10, 9, { lit: true, cross: false });
  windowAt(img, 69, 44, 13, 9, { lit: true, panes: 3, cross: false });
  door(img, 40, 46, 9, 13, R.roofDark, { glass: true, steps: 0 });
  img.hline(37, 51, 59, R.stone[3]);
  // chalkboard menu stand
  img.rect(54, 54, 6, 7, R.roofDark[1]);
  img.frame(53, 53, 8, 9, R.wood[2]);
  img.hline(55, 58, 56, R.white[3]);
  img.hline(55, 57, 58, R.white[2]);
  img.set(58, 58, F.dandelion);
  // molkky pins
  for (let k = 0; k < 6; k++) {
    const px = 3 + (k % 3) * 3 + (k > 2 ? 1 : 0);
    const py = 56 + (k > 2 ? 2 : 0);
    img.rect(px, py, 2, 3, R.cream[3]);
    img.set(px, py, R.cream[4]);
    img.set(px + 1, py + 2, R.cream[1]);
  }
  img.hline(14, 18, 60, R.cream[2]);
  img.set(14, 60, R.cream[4]);
  return { img, door: [44, 60], anchors: {} };
}

// ------------------------------------------------------------------ rental_flat (1970s block)
function rentalFlat(): BuildingArt {
  const img = new Img(82, 56);
  roofFlat(img, 0, 0, 82, 8, R.concrete, 9);
  wall(img, 1, 8, 80, 46, R.beige, 'plaster');
  // element joints
  for (let y = 22; y < 50; y += 14) img.hline(1, 80, y, R.beige[1]);
  for (let x = 21; x < 80; x += 20) img.vline(x, 8, 51, R.beige[1]);
  // stairwell column
  img.rect(3, 9, 11, 43, R.beige[3]);
  img.vline(13, 9, 51, R.beige[1]);
  for (let y = 12; y < 36; y += 14) windowAt(img, 6, y, 5, 8, { cross: false, sill: false, lit: y > 20 });
  img.rect(2, 38, 13, 2, R.concrete[3]);
  img.hline(2, 14, 38, R.concrete[4]);
  door(img, 5, 41, 7, 11, R.orange, { glass: true, steps: 1, frame: R.concrete });
  // floors: balconies + windows
  for (let f = 0; f < 3; f++) {
    const y = 10 + f * 14;
    for (let b = 0; b < 2; b++) {
      const bx = 18 + b * 32;
      // balcony door + window behind
      windowAt(img, bx + 2, y + 1, 5, 9, { cross: false, sill: false, lit: (f + b) % 2 === 0 });
      windowAt(img, bx + 9, y + 1, 7, 5, { cross: false, sill: false, lit: (f + b) % 2 === 0 });
      // slab + railing panel
      img.rect(bx - 1, y + 7, 22, 5, R.orange[1]);
      for (let x = bx; x < bx + 20; x += 2) img.vline(x, y + 8, y + 10, R.orange[2]);
      img.hline(bx - 1, bx + 20, y + 7, R.orange[3]);
      img.hline(bx - 1, bx + 20, y + 12, R.concrete[4]);
      img.hline(bx - 1, bx + 20, y + 13, withA(SHADOW, 110));
    }
    windowAt(img, 47, y + 2, 6, 6, { cross: false, lit: f === 1 });
  }
  // rug-beating rack
  img.vline(66, 42, 53, R.metal[2]);
  img.vline(79, 42, 53, R.metal[2]);
  img.hline(66, 79, 42, R.metal[3]);
  img.rect(69, 43, 8, 7, R.falu[2]);
  img.frame(69, 43, 8, 7, F.dandelion);
  img.hline(70, 75, 46, R.falu[4]);
  return { img, door: [8, 54], anchors: {} };
}

// ------------------------------------------------------------------ opisto (school)
function school(): BuildingArt {
  const img = new Img(84, 54);
  roofSide(img, 0, 2, 84, 17, R.roofDark, 'tile', 5);
  wall(img, 2, 19, 80, 33, R.brick, 'brick', 9);
  // white band between floors
  img.hline(2, 81, 33, R.white[3]);
  img.hline(2, 81, 34, R.white[1]);
  for (const wx of [22, 32, 62, 72]) windowAt(img, wx, 22, 6, 8, { lit: wx === 32 || wx === 72 });
  for (const wx of [22, 32, 42, 52, 62, 72]) windowAt(img, wx, 38, 6, 9, { lit: wx === 42 || wx === 62 });
  sign(img, 47, 22, 'KOULU', R.white, R.brick[0]);
  // entrance with small gable canopy
  door(img, 4, 39, 8, 12, R.flagBlue, { glass: true, double: true, steps: 1 });
  roofFront(img, 1, 14, 37, 31, 3, R.roofDark, null);
  return { img, door: [8, 53], anchors: {} };
}

// ------------------------------------------------------------------ library (1891 schoolhouse)
function library(): BuildingArt {
  const img = new Img(68, 52);
  roofSide(img, 0, 8, 68, 17, R.roofRed, 'shingle', 14);
  // bell cupola
  img.rect(41, 4, 8, 7, R.white[3]);
  img.vline(41, 4, 10, R.white[4]);
  img.vline(48, 4, 10, R.white[1]);
  img.rect(43, 6, 4, 3, R.roofDark[0]);
  img.set(44, 7, F.gold);
  roofHip(img, 39, 0, 12, 5, 6, R.roofRed);
  wall(img, 2, 25, 64, 25, R.cream, 'logs', 5);
  logEnds(img, 0, 26, 48, R.cream);
  logEnds(img, 65, 26, 48, R.cream);
  sign(img, 40, 27, 'KIRJASTO', R.wood, R.cream[4]);
  for (const wx of [22, 35, 48, 59]) windowAt(img, wx, 39, 5, 7, { lit: wx !== 35 });
  door(img, 6, 35, 7, 13, R.falu, { steps: 1 });
  img.rect(4, 32, 11, 2, R.roofRed[2]);
  img.hline(4, 14, 32, R.roofRed[4]);
  return { img, door: [9, 50], anchors: {} };
}

// ------------------------------------------------------------------ dance_pavilion (Kolmilammi lava)
function pavilion(): BuildingArt {
  const img = new Img(84, 58);
  // floor + interior seen through the open sides
  img.rect(2, 26, 62, 24, R.wood[1]);
  for (let y = 27; y < 50; y += 3) img.hline(2, 63, y, R.wood[2]);
  img.rect(2, 26, 62, 4, R.wood[0]);
  // warm glow on the floor
  img.ellipse(33, 40, 20, 6, R.wood[3]);
  img.ellipse(33, 40, 12, 3, R.wood[4]);
  // back posts
  for (const px of [12, 33, 54]) img.vline(px, 26, 38, R.wood[0]);
  // skirt
  img.rect(1, 48, 64, 4, R.falu[2]);
  img.hline(1, 64, 48, R.falu[3]);
  for (let x = 2; x < 64; x += 3) img.vline(x, 49, 51, R.falu[1]);
  // railing
  img.hline(14, 63, 40, R.white[4]);
  img.hline(14, 63, 41, R.white[2]);
  for (let x = 14; x < 64; x += 3) img.vline(x, 42, 47, R.white[3]);
  // front posts
  for (const px of [1, 13, 32, 52, 63]) {
    img.rect(px, 25, 2, 24, R.white[3]);
    img.vline(px, 25, 48, R.white[4]);
    img.vline(px + 1, 25, 48, R.white[1]);
  }
  // roof
  roofHip(img, 0, 2, 66, 23, 24, R.roofRed);
  img.vline(33, 0, 2, R.white[3]);
  img.set(33, 0, F.gold);
  // eave trim
  img.hline(0, 65, 25, R.white[3]);
  for (let x = 1; x < 65; x += 2) img.set(x, 26, R.white[2]);
  // string light bulbs (static, overlay blinks)
  for (let x = 3; x < 64; x += 4) img.set(x, 27 + (x % 8 === 3 ? 1 : 0), R.lit[4]);
  sign(img, 33, 29, 'LAVA', R.falu, R.white[4]);
  // entrance stairs on the left
  for (let s = 0; s < 3; s++) img.hline(2 - s + 1, 11 + s, 49 + s * 2, R.wood[4 - s]);
  img.rect(3, 50, 9, 5, R.wood[2]);
  for (let s = 0; s < 3; s++) img.hline(3, 11, 50 + s * 2, R.wood[3]);
  img.rect(2, 41, 11, 8, R.wood[1]);
  img.rect(3, 41, 9, 8, R.wood[0]);
  // ice-cream kiosk
  const kx = 68;
  roofFlat(img, kx - 1, 30, 17, 5, R.white);
  wall(img, kx, 35, 15, 17, R.white, 'panel');
  img.rect(kx + 2, 38, 11, 6, R.lit[3]);
  img.hline(kx + 1, kx + 13, 44, R.white[4]);
  for (let x = kx; x < kx + 15; x++) img.vline(x, 35, 36, Math.floor(x / 2) % 2 ? F.pink : R.white[4]);
  // cone on the roof
  img.tri(kx + 5, 24, kx + 9, 24, kx + 7, 30, R.ochre[3]);
  img.disc(kx + 7, 22, 2.6, F.pink);
  img.set(kx + 6, 21, R.white[4]);
  return { img, door: [8, 56], anchors: { lightsFrom: [2, 26], lightsTo: [64, 26] } };
}

export const BUILDERS: Record<LocationId, () => BuildingArt> = {
  parents_house: parentsHouse,
  job_centre: jobCentre,
  station,
  bank,
  sawmill,
  department_store: hardware,
  health_centre: healthCentre,
  cottage,
  sauna,
  village_shop: shop,
  grill,
  rental_flat: rentalFlat,
  opisto: school,
  library,
  dance_pavilion: pavilion,
};

export { lamp };
