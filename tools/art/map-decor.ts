/** Non-clickable decoration sprites for the town map background. */
import { Img } from '../raster';
import { bigText } from './map-buildings';
import {
  F,
  OUT,
  R,
  SHADOW,
  cornerBoard,
  door,
  roofFront,
  roofHip,
  roofSide,
  selOutline,
  wall,
  windowAt,
  withA,
  pad,
} from './map-kit';

const done = (img: Img) => {
  const out = pad(img);
  selOutline(out);
  return out;
};

/** Simple white 1960s village church: steep front gable, slit windows. */
export function church(): Img {
  const img = new Img(54, 62);
  // nave: steep roof receding, low white walls
  roofFront(img, 0, 53, 44, 6, 9, R.roofDark, R.white);
  wall(img, 1, 44, 52, 16, R.white, 'plaster');
  // gable wall detail: tall cross relief and slit windows
  img.rect(25, 18, 3, 22, R.white[2]);
  img.rect(21, 23, 11, 3, R.white[2]);
  img.vline(25, 18, 39, R.white[4]);
  img.hline(21, 31, 23, R.white[4]);
  for (const wx of [8, 14, 38, 44]) {
    img.rect(wx, 46, 2, 9, R.glass[2]);
    img.set(wx, 46, R.glass[3]);
    img.vline(wx + 1, 47, 54, R.glass[1]);
  }
  for (const wx of [18, 34]) {
    img.rect(wx, 34, 2, 9, R.lit[2]);
    img.set(wx, 34, R.lit[4]);
  }
  door(img, 23, 47, 8, 12, R.wood, { double: true, steps: 1 });
  img.rect(20, 44, 14, 2, R.white[4]);
  img.hline(20, 33, 46, withA(SHADOW, 100));
  return done(img);
}

export function bellTower(): Img {
  const img = new Img(14, 52);
  for (const px of [1, 10]) {
    img.rect(px, 8, 3, 43, R.white[3]);
    img.vline(px, 8, 50, R.white[4]);
    img.vline(px + 2, 8, 50, R.white[1]);
  }
  for (const y of [22, 36]) {
    img.hline(1, 12, y, R.white[3]);
    img.hline(1, 12, y + 1, R.white[1]);
  }
  // bell
  img.rect(5, 12, 4, 5, R.ochre[2]);
  img.hline(4, 9, 16, R.ochre[3]);
  img.vline(5, 12, 15, R.ochre[4]);
  img.set(6, 17, R.ochre[1]);
  roofHip(img, 0, 2, 14, 7, 7, R.roofDark);
  img.vline(7, 0, 2, R.ochre[3]);
  img.hline(6, 8, 1, R.ochre[3]);
  return done(img);
}

/** Red volunteer fire brigade hall with a hose-drying tower. */
export function vpk(): Img {
  const img = new Img(66, 56);
  // hose tower
  roofHip(img, 47, 0, 16, 8, 8, R.roofDark);
  wall(img, 48, 8, 14, 47, R.falu, 'boards', 21);
  cornerBoard(img, 48, 8, 47, R.white, 1);
  cornerBoard(img, 61, 8, 47, R.white, 1);
  windowAt(img, 52, 12, 6, 6, { lit: false, cross: false });
  // hall
  roofSide(img, 0, 16, 49, 15, R.roofDark, 'felt', 4);
  wall(img, 1, 31, 47, 24, R.falu, 'boards', 22);
  cornerBoard(img, 1, 31, 24);
  // garage doors
  for (const dx of [5, 26]) {
    img.rect(dx, 37, 17, 16, R.white[3]);
    img.frame(dx, 37, 17, 16, R.white[1]);
    for (let y = 39; y < 53; y += 3) img.hline(dx + 1, dx + 15, y, R.white[2]);
    for (let x = dx + 2; x < dx + 15; x += 4) img.rect(x, 39, 3, 2, R.glass[2]);
  }
  bigText(img, 'VPK', 14, 32, R.white[4], 1);
  return done(img);
}

export function skateRamp(): Img {
  // small wooden half-pipe seen from the front-top: U profile on the front panel
  const W = 40;
  const H = 22;
  const img = new Img(W, H);
  const depth = 6; // top deck/riding surface receding
  const prof = (x: number) => {
    // height of the riding surface above ground at column x (U shape)
    const t = Math.abs(x - (W - 1) / 2) / ((W - 1) / 2);
    return Math.round(2 + 12 * Math.pow(Math.max(0, (t - 0.25) / 0.75), 1.6));
  };
  const base = H - 1;
  for (let x = 0; x < W; x++) {
    const top = base - prof(x) - 1;
    // riding surface (seen from above, receding) – left transition faces the light
    const left = x < W / 2;
    const steep = prof(x) > 4;
    const surf = steep ? (left ? R.wood[1] : R.wood[4]) : R.wood[3];
    for (let j = 0; j < depth; j++) img.set(x, top - depth + j, j === 0 ? R.wood[4] : surf);
    if (x % 5 === 0) img.set(x, top - depth + 3, steep ? (left ? R.wood[0] : R.wood[3]) : R.wood[2]);
    // front panel below the profile
    for (let y = top; y <= base; y++) img.set(x, y, y === top ? R.metal[4] : (x + y) % 9 === 0 ? R.wood[1] : R.wood[2]);
  }
  // decks + metal coping on both ends
  for (const dx of [0, W - 5]) {
    img.rect(dx, 1, 5, depth - 1, R.wood[3]);
    img.hline(dx, dx + 4, 1, R.wood[4]);
    img.hline(dx, dx + 4, depth - 1 + 1, R.metal[3]);
  }
  // front panel frame posts + graffiti
  for (const px of [0, 9, 19, 20, 30, W - 1]) img.vline(px, base - prof(px), base, R.wood[1]);
  img.hline(0, W - 1, base, R.wood[0]);
  img.hline(4, 6, base - 6, F.lupinePink);
  img.set(5, base - 5, F.lupinePink);
  img.hline(33, 35, base - 4, R.flagBlue[3]);
  img.set(34, base - 5, R.flagBlue[4]);
  return done(img);
}

export function bench(): Img {
  const img = new Img(14, 7);
  img.rect(0, 0, 14, 2, R.wood[2]);
  img.hline(0, 13, 0, R.wood[4]);
  img.rect(0, 3, 14, 2, R.wood[3]);
  img.hline(0, 13, 3, R.wood[4]);
  img.vline(1, 5, 6, R.metal[1]);
  img.vline(12, 5, 6, R.metal[1]);
  return done(img);
}

export function mailboxes(n = 3): Img {
  const img = new Img(n * 5 + 1, 12);
  img.rect(0, 5, n * 5 + 1, 1, R.wood[3]);
  img.vline(Math.floor((n * 5) / 2), 6, 11, R.wood[2]);
  const cols = [R.green, R.flagBlue, R.falu, R.ochre];
  for (let i = 0; i < n; i++) {
    const c = cols[i % cols.length];
    img.rect(i * 5 + 1, 0, 4, 5, c[2]);
    img.hline(i * 5 + 1, i * 5 + 4, 0, c[4]);
    img.vline(i * 5 + 4, 1, 4, c[1]);
    img.set(i * 5 + 2, 2, OUT);
  }
  return done(img);
}

/** White plastic-wrapped silage bale (or straw roll when gold). */
export function bale(gold = false): Img {
  const img = new Img(9, 7);
  const r = gold ? R.cream : R.white;
  img.ellipse(4, 3.5, 4.2, 3.4, r[2]);
  img.ellipse(3.5, 2.8, 3, 2.2, r[3]);
  img.disc(2.5, 2, 1, r[4]);
  img.hline(2, 6, 6, r[1]);
  img.vline(8, 2, 5, r[1]);
  if (gold) {
    img.set(4, 3, r[1]);
    img.set(5, 4, r[1]);
  }
  return done(img);
}

export function planks(): Img {
  const img = new Img(30, 16);
  for (let k = 0; k < 3; k++) {
    const y = 10 - k * 4;
    img.rect(k * 2, y, 28 - k * 4, 4, R.wood[3]);
    img.hline(k * 2, 27 - k * 2, y, R.wood[4]);
    for (let x = k * 2 + 2; x < 28 - k * 2; x += 3) img.vline(x, y + 1, y + 3, R.wood[2]);
    img.hline(k * 2, 27 - k * 2, y + 3, R.wood[1]);
    // stickers
    img.vline(k * 2 + 3, y + 1, y + 3, R.wood[0]);
    img.vline(24 - k * 2, y + 1, y + 3, R.wood[0]);
  }
  img.rect(2, 0, 3, 4, R.ochre[2]);
  return done(img);
}

export function boat(): Img {
  const img = new Img(20, 8);
  img.ellipse(10, 4, 9.5, 3.6, R.falu[2]);
  img.ellipse(10, 4, 8, 2.4, R.wood[3]);
  img.hline(4, 16, 4, R.wood[2]);
  for (const x of [7, 13]) img.vline(x, 2, 6, R.wood[1]);
  img.hline(3, 17, 1, R.falu[4]);
  img.hline(3, 17, 7, R.falu[0]);
  // oars
  img.line(8, 3, 4, -1, R.wood[4]);
  return done(img);
}

export function signpost(): Img {
  const img = new Img(22, 18);
  img.rect(10, 4, 2, 14, R.wood[2]);
  img.vline(10, 4, 17, R.wood[3]);
  img.rect(0, 2, 13, 5, R.flagBlue[2]);
  img.hline(0, 12, 2, R.flagBlue[4]);
  img.set(0, 4, R.flagBlue[2]);
  img.rect(10, 8, 12, 5, R.flagBlue[2]);
  img.hline(10, 21, 8, R.flagBlue[4]);
  img.hline(2, 9, 4, R.white[4]);
  img.hline(12, 19, 10, R.white[4]);
  return done(img);
}

export function lampPost(): Img {
  const img = new Img(5, 16);
  img.vline(2, 3, 15, R.roofDark[2]);
  img.rect(0, 0, 5, 3, R.roofDark[1]);
  img.rect(1, 1, 3, 2, R.lit[3]);
  img.set(1, 1, R.lit[4]);
  return done(img);
}

export function flagpole(h = 40): Img {
  const img = new Img(3, h + 2);
  img.vline(1, 1, h + 1, R.white[3]);
  img.vline(2, 2, h + 1, R.white[1]);
  img.set(1, 0, F.gold);
  img.hline(0, 2, h + 1, R.stone[2]);
  return done(img);
}

export function flowerBed(w: number, h: number, seed = 1): Img {
  const img = new Img(w, h);
  img.ellipse((w - 1) / 2, (h - 1) / 2, w / 2, h / 2, R.wood[1]);
  img.ellipse((w - 1) / 2 - 0.5, (h - 1) / 2 - 0.5, w / 2 - 1.2, h / 2 - 1.2, R.wood[2]);
  const cols = [F.red, F.dandelion, F.lupinePink, F.daisy, F.lupine];
  let k = seed;
  for (let y = 1; y < h - 1; y += 2)
    for (let x = 1 + (y % 4 === 1 ? 1 : 0); x < w - 1; x += 2) {
      const dx = (x - (w - 1) / 2) / (w / 2 - 1);
      const dy = (y - (h - 1) / 2) / (h / 2 - 1);
      if (dx * dx + dy * dy > 1) continue;
      img.set(x, y + 1, R.leaf[1]);
      img.set(x, y, cols[k++ % cols.length]);
    }
  const out = pad(img);
  selOutline(out, R.leaf[0]);
  return out;
}
