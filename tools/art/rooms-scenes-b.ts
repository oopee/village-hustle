/** Interiors 9-15: sauna, village_shop, grill, rental_flat, opisto, library, dance_pavilion. */
import { Img, hex, rng } from '../raster';
import {
  H, Mask, OUT, PAL, W, bookshelf, box, ceiling, cloud, floorPlanks, floorTiles, frameArt, lake, paper,
  ragRug, ramp, roomBox, shadow, shadowRect, signText, skyBands, spruce, stringLights, treeLine, wainscot, wallLogs,
  wallPlanks, wallpaper, windowFrame, type Ramp,
} from './rooms-kit';
import { counter, newScene, type Scene } from './rooms-scenes-a';

// ------------------------------------------------------------------ 9. lakeside smoke sauna
function viewSaunaLake(v: Img) {
  const r = rng(99);
  skyBands(v, ramp('#f8c890', '#f4d8a8', '#f8e8c8'), 0, Math.floor(v.h * 0.45));
  treeLine(v, Math.floor(v.h * 0.45), hex('#3e6a5a'), r, 2);
  lake(v, Math.floor(v.h * 0.45) + 1, v.h, ramp('#7aa8d4', '#5a8ac4', '#4a74b0'), hex('#ffe8c0'), r);
  // little pier
  v.rect(0, v.h - 4, Math.floor(v.w * 0.5), 2, PAL.wood[2]);
  v.hline(0, Math.floor(v.w * 0.5) - 1, v.h - 4, PAL.wood[1]);
}

export function sauna(): Scene {
  const r = rng(909);
  const s = newScene([100, 38]);
  const b = s.back;
  const fy = 98;
  const smoky = ramp('#a06e48', '#7a4e36', '#5a382e', '#3e262a', '#281820');
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallLogs(img, 0, 0, W - 1, fy, smoky, 10, r);
      // soot towards the ceiling
      for (let y = 0; y < 24; y++) img.hline(0, W - 1, y, hex('#1a1018', Math.round(110 - y * 4.5)));
    },
    floor: (img) => floorPlanks(img, fy, ramp('#b88e68', '#94704e', '#70523e', '#4e3832', '#34242a'), r),
    corner: hex('#1a1018', 140),
  });
  // window to the lake
  windowFrame(b, 62, 22, 32, 24, smoky, viewSaunaLake, { cols: 2, rows: 1 });
  for (let y = 48; y < 70; y++) b.hline(54 + Math.round((y - 48) * 0.6), 104 + Math.round((y - 48) * 0.6), y, hex('#ffd890', 14));
  // thermometer
  const th = new Mask(W, H).disc(132, 30, 5);
  th.paint(b, PAL.wood);
  th.outlineOn(b, OUT);
  b.disc(132, 30, 3, hex('#fff8e8'));
  b.line(132, 30, 134, 28, PAL.red[2]);
  // hanging vihta on a peg
  b.line(146, 18, 150, 30, PAL.darkWood[1]);
  const vh = new Mask(W, H).ellipse(152, 38, 5, 8).disc(149, 44, 3).disc(155, 44, 3);
  vh.paint(b, PAL.leaf, { split: 154 });
  vh.outlineOn(b, hex('#1e3a36'));
  for (const [x, y] of [[150, 34], [153, 37], [149, 40], [154, 42], [151, 45], [147, 44], [156, 46]] as const) b.set(x, y, PAL.leaf[3]);
  for (const [x, y] of [[151, 33], [148, 38], [152, 41], [148, 43]] as const) b.set(x, y, PAL.leaf[0]);
  // lauteet (benches): two tiers on the right
  const aspen = ramp('#fff0cc', '#f0d4a0', '#cca878', '#9a7856', '#6a4e42');
  shadowRect(b, 160, fy + 2, 90, 6);
  b.rect(166, 46, 90, 52, hex('#2a1820', 120));
  for (let x = 168; x < W; x += 8) {
    b.rect(x, 50, 6, 48, aspen[2]);
    b.vline(x, 50, fy, aspen[1]);
    b.vline(x + 5, 50, fy, aspen[3]);
  }
  box(b, 164, 40, 92, 12, 7, aspen, aspen);
  for (let x = 166; x < W; x += 6) b.vline(x, 40, 46, aspen[2]);
  box(b, 150, 70, 106, 10, 6, aspen, aspen);
  for (let x = 152; x < W; x += 6) b.vline(x, 70, 75, aspen[2]);
  b.rect(154, 80, 3, 18, aspen[3]);
  // kiuas (smoke-sauna stone stove)
  const sx = 16;
  shadowRect(b, sx - 2, fy + 2, 52, 5);
  box(b, sx, 56, 46, 44, 0, PAL.stone, PAL.stone);
  b.rect(sx + 2, 58, 42, 40, PAL.stone[3]);
  const stones = new Mask(W, H);
  for (let i = 0; i < 26; i++) {
    const x = sx + 4 + ((i * 7) % 40);
    const y = 34 + Math.floor(i / 6) * 6 + (i % 2) * 2;
    stones.disc(x, y, 3.2 + (i % 3) * 0.5);
  }
  for (let i = 0; i < 26; i++) {
    const x = sx + 4 + ((i * 7) % 40);
    const y = 34 + Math.floor(i / 6) * 6 + (i % 2) * 2;
    const m = new Mask(W, H).disc(x, y, 3.2 + (i % 3) * 0.5);
    m.paint(b, i % 4 === 0 ? ramp('#c8b8b0', '#9a8a8c', '#6a5c68', '#46384a') : PAL.stone, { split: x + 2 });
    m.outlineOn(b, hex('#2a1e2a', 160));
  }
  // fire hole
  const fh = new Mask(W, H).rect(sx + 14, 80, 18, 14).ellipse(sx + 23, 80, 9, 5);
  fh.fill(b, hex('#2a1018'));
  const emb = new Mask(W, H).ellipse(sx + 23, 90, 8, 3.5).tri(sx + 17, 92, sx + 23, 92, sx + 20, 82).tri(sx + 22, 92, sx + 29, 92, sx + 26, 80);
  emb.paint(b, ramp('#fff8b0', '#ffd050', '#f08a3a', '#c84a2e'), { split: sx + 27 });
  // steam rising from the stones
  const st = new Mask(W, H).ellipse(30, 22, 8, 4).ellipse(40, 16, 7, 4).ellipse(34, 10, 9, 4).ellipse(48, 6, 7, 3);
  st.fill(b, hex('#ffffff', 60));
  new Mask(W, H).ellipse(30, 21, 5, 2).ellipse(36, 9, 5, 2).fill(b, hex('#ffffff', 60));
  // water bucket by the stove
  // front: low washing bench with kiulu (bucket) and ladle
  const f = s.front;
  shadowRect(b, 70, 112, 104, 4);
  for (const lx of [76, 164]) {
    f.rect(lx, 80, 4, 32, aspen[3]);
    f.frame(lx - 1, 80, 6, 33, OUT);
  }
  // back-rest board under the seat, so it reads as a solid bench
  box(f, 72, 81, 100, 9, 0, aspen, aspen);
  f.hline(73, 170, 85, aspen[3]);
  box(f, 68, 72, 108, 10, 6, aspen, aspen);
  for (let x = 70; x < 176; x += 6) f.vline(x, 72, 77, aspen[2]);
  const bucket = new Mask(W, H).rect(140, 58, 18, 14).ellipse(149, 58, 9, 2.5);
  bucket.paint(f, PAL.wood, { split: 154 });
  bucket.outlineOn(f, OUT);
  for (const y of [61, 68]) f.hline(140, 157, y, PAL.steel[2]);
  new Mask(W, H).ellipse(149, 58, 7, 1.5).fill(f, hex('#5a8ac4'));
  f.line(153, 57, 166, 46, PAL.darkWood[1]);
  f.line(152, 58, 165, 47, OUT);
  const ladle = new Mask(W, H).disc(167, 45, 2.5);
  ladle.paint(f, PAL.wood);
  ladle.outlineOn(f, OUT);
  // towel folded on the bench
  box(f, 92, 66, 18, 6, 3, ramp('#ffffff', '#f2f0f4', '#c8c4d8', '#9490ac'), ramp('#ffffff', '#f2f0f4', '#c8c4d8', '#9490ac'));
  f.hline(92, 109, 69, PAL.red[1]);
  return s;
}

// ------------------------------------------------------------------ 10. village grocery
function grocery(img: Img, x: number, yb: number, w: number, rnd: () => number) {
  const packs: Ramp[] = [PAL.red, PAL.yellow, PAL.blue, PAL.white, PAL.green, PAL.orange, PAL.cream, PAL.pink];
  let px = x;
  while (px < x + w - 4) {
    const c = packs[Math.floor(rnd() * packs.length)];
    const kind = rnd();
    if (kind < 0.35) {
      // carton
      const pw = 5;
      const ph = 9;
      img.rect(px, yb - ph + 1, pw, ph, c[1]);
      img.vline(px, yb - ph + 1, yb, c[0]);
      img.vline(px + pw - 1, yb - ph + 1, yb, c[2]);
      img.set(px + 2, yb - ph, c[1]);
      img.hline(px, px + pw - 1, yb - 3, hex('#ffffff'));
      px += pw + 1;
    } else if (kind < 0.7) {
      // box
      const pw = 6 + Math.floor(rnd() * 3);
      const ph = 7 + Math.floor(rnd() * 3);
      img.rect(px, yb - ph + 1, pw, ph, c[1]);
      img.hline(px, px + pw - 1, yb - ph + 1, c[0]);
      img.vline(px + pw - 1, yb - ph + 1, yb, c[2]);
      img.rect(px + 1, yb - ph + 3, pw - 3, 2, c === PAL.white ? PAL.red[1] : hex('#ffffff'));
      px += pw;
    } else {
      // cans
      for (let k = 0; k < 2; k++) {
        img.rect(px, yb - 4, 4, 5, c[1]);
        img.hline(px, px + 3, yb - 4, PAL.metal[0]);
        img.vline(px + 3, yb - 3, yb, c[2]);
        px += 4;
      }
      px++;
    }
  }
}

export function villageShop(): Scene {
  const r = rng(1010);
  const s = newScene([122, 38]);
  const b = s.back;
  const fy = 96;
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallpaper(img, 0, 0, W - 1, fy, hex('#f4f2ee'), hex('#e8e6e2'), 'none');
      img.rect(0, 0, W, 8, PAL.orange[1]);
      img.hline(0, W - 1, 8, PAL.orange[3]);
      img.hline(0, W - 1, 0, PAL.orange[0]);
      img.hline(0, W - 1, 9, hex('#2a1838', 50));
    },
    floor: (img) => floorTiles(img, fy, hex('#dcdce4'), hex('#c4c8d4'), hex('#a0a4b8'), 16),
    skirt: ramp('#c4c8d4', '#a0a4b8', '#7a7e98'),
  });
  // gondola shelves
  box(b, 14, 14, 64, 84, 0, PAL.metal, PAL.metal);
  b.rect(16, 16, 60, 80, hex('#5a5878'));
  for (let i = 0; i < 5; i++) {
    const y = 30 + i * 16;
    grocery(b, 17, y - 1, 59, r);
    b.rect(16, y, 60, 3, PAL.metal[1]);
    b.hline(16, 75, y, PAL.metal[0]);
    b.rect(18 + ((i * 13) % 40), y + 1, 7, 2, hex('#fff4a0'));
  }
  paper(b, 22, 4, 26, 9, hex('#fff4a0'));
  b.text('TARJOUS', 21, 6, PAL.red[2]);
  // bakery shelf with pulla
  box(b, 172, 16, 66, 46, 0, PAL.wood, PAL.wood);
  b.rect(174, 18, 62, 42, PAL.wood[3]);
  signText(b, 'LEIPÄ', 205, 11, PAL.darkWood[3]);
  for (let row = 0; row < 3; row++) {
    const y = 30 + row * 14;
    b.rect(174, y, 62, 2, PAL.wood[1]);
    b.hline(174, 235, y, PAL.wood[0]);
    for (let i = 0; i < 6; i++) {
      const cx = 179 + i * 10;
      if (row === 2) {
        // rye loaves
        const m = new Mask(W, H).ellipse(cx, y - 3, 4.5, 3);
        m.paint(b, ramp('#b07848', '#7c4a32', '#5a3028', '#3e2026'));
        b.set(cx - 1, y - 4, hex('#c89a6a'));
      } else {
        const m = new Mask(W, H).ellipse(cx, y - 3, 4, 3);
        m.paint(b, ramp('#ffe8b0', '#f0b860', '#c88040', '#8e5430'));
        b.set(cx - 1, y - 5, hex('#ffffff'));
        b.set(cx + 1, y - 4, hex('#ffffff'));
      }
    }
  }
  // bottle-return machine
  shadowRect(b, 196, 98, 40, 4);
  box(b, 198, 64, 36, 34, 2, PAL.steel, ramp('#a8e0c8', '#6ab89a', '#4a8a7a', '#30605a'));
  const hole = new Mask(W, H).disc(210, 78, 5);
  hole.fill(b, hex('#1a1020'));
  hole.outlineOn(b, PAL.steel[1]);
  b.rect(220, 70, 10, 7, hex('#1e2a4a'));
  b.rect(221, 71, 8, 2, hex('#9ae0ff'));
  b.text('PULLOT', 204, 89, hex('#ffffff'));
  // front: checkout with conveyor, groceries, scratch-card stand
  const f = s.front;
  const red = ramp('#ffb07a', '#f0603e', '#c03c34', '#862830');
  counter(s, 62, 70, 124, 40, 9, PAL.steel, red, 3);
  f.rect(64, 71, 76, 6, hex('#3a3448'));
  for (let x = 66; x < 140; x += 6) f.vline(x, 71, 76, hex('#4e4860'));
  // kick plate
  f.rect(64, 106, 120, 2, red[3]);
  // groceries on the belt
  box(f, 84, 63, 7, 10, 0, PAL.white, PAL.white);
  f.rect(85, 67, 5, 2, PAL.blue[1]);
  const loaf = new Mask(W, H).ellipse(102, 70, 6, 3);
  loaf.paint(f, ramp('#ffe8b0', '#e0a050', '#b07038', '#7a4a30'));
  loaf.outlineOn(f, OUT);
  const ap = new Mask(W, H).disc(114, 70, 2.5);
  ap.paint(f, PAL.red);
  ap.outlineOn(f, OUT);
  // card terminal + register screen
  box(f, 160, 64, 10, 8, 0, PAL.black, PAL.black);
  f.rect(162, 66, 6, 2, hex('#9ae0ff'));
  box(f, 170, 50, 14, 12, 0, PAL.black, PAL.black);
  f.rect(172, 52, 10, 7, hex('#3aa86a'));
  f.rect(176, 62, 2, 8, PAL.black[1]);
  // scratch cards
  box(f, 140, 56, 16, 16, 0, PAL.metal, PAL.metal);
  const cardC = [PAL.yellow[1], PAL.pink[1], PAL.teal[1], PAL.orange[1]];
  for (let i = 0; i < 4; i++) {
    f.rect(142 + (i % 2) * 7, 58 + Math.floor(i / 2) * 7, 5, 5, cardC[i]);
    f.set(143 + (i % 2) * 7, 59 + Math.floor(i / 2) * 7, hex('#ffffff'));
  }
  return s;
}

// ------------------------------------------------------------------ 11. Vanha Trokari pub/pizzeria
export function grill(): Scene {
  const r = rng(1111);
  const s = newScene([136, 38]);
  const b = s.back;
  const fy = 96;
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallPlanks(img, 0, 0, W - 1, 62, ramp('#c8885a', '#a0663e', '#7a4a34', '#54302e', '#3a2028'), 8, r, { knots: true });
      wainscot(img, 0, W - 1, 66, fy, PAL.darkWood, 8);
      ceiling(img, 5, PAL.darkWood);
    },
    floor: (img) => floorPlanks(img, fy, ramp('#b07a52', '#8a5a3c', '#683e30', '#48282a', '#301a22'), r),
    skirt: PAL.darkWood,
  });
  // warm pendant lamps
  for (const x of [128, 176]) {
    b.vline(x, 0, 8, OUT);
    const m = new Mask(W, H).tri(x - 6, 14, x + 6, 14, x, 8);
    m.paint(b, PAL.green);
    m.outlineOn(b, OUT);
    b.rect(x - 2, 14, 5, 2, hex('#fff4b0'));
    for (let y = 16; y < 36; y++) b.hline(x - 4 - (y - 16) / 2, x + 4 + (y - 16) / 2, y, hex('#ffe8a0', 16));
  }
  // pizza oven
  const ox = 14;
  shadowRect(b, ox, fy + 2, 58, 5);
  const dome = new Mask(W, H).ellipse(ox + 28, 50, 28, 26).clip((_, y) => y <= 66).rect(ox, 66, 56, 30);
  dome.paint(b, PAL.brick, { split: ox + 44 });
  dome.outlineOn(b, OUT);
  for (let y = 30; y < 96; y += 5)
    for (let x = ox + ((y / 5) % 2 ? 0 : 4); x < ox + 56; x += 8) if (dome.has(x, y)) b.vline(x, y, y + 4, PAL.brick[3]);
  for (let y = 30; y < 96; y += 5) for (let x = ox; x < ox + 56; x++) if (dome.has(x, y)) b.set(x, y, PAL.brick[2]);
  const mouth = new Mask(W, H).rect(ox + 16, 56, 24, 14).ellipse(ox + 28, 56, 12, 8);
  mouth.fill(b, hex('#3a1420'));
  const glow = new Mask(W, H).ellipse(ox + 28, 66, 10, 5).tri(ox + 20, 70, ox + 26, 70, ox + 23, 56).tri(ox + 28, 70, ox + 36, 70, ox + 32, 58);
  glow.paint(b, ramp('#fff8b0', '#ffd050', '#f08a3a', '#c84a2e'), { split: ox + 32 });
  b.rect(ox + 12, 70, 32, 3, PAL.stone[1]);
  b.hline(ox + 12, ox + 43, 70, PAL.stone[0]);
  b.frame(ox + 11, 69, 34, 5, OUT);
  // firewood under the oven
  for (let i = 0; i < 5; i++) {
    const m = new Mask(W, H).disc(ox + 12 + i * 8, 88, 3.5);
    m.paint(b, ramp('#ffe0a8', '#e8b878', '#b88050', '#7a5038'));
    m.outlineOn(b, OUT);
  }
  // chalkboard menu
  box(b, 78, 12, 40, 38, 0, PAL.wood, PAL.wood);
  b.rect(80, 14, 36, 34, hex('#2e3a36'));
  b.text('MENU', 90, 16, hex('#ffffff'));
  const chalk = hex('#e8e8dc');
  // No prices on the board: the real ones are hidden, rolled balance parameters.
  b.text('PIZZA', 82, 24, chalk);
  b.text('KEBAB', 82, 31, chalk);
  b.text('OLUT', 82, 38, chalk);
  // dartboard
  const db = new Mask(W, H).disc(98, 60, 7);
  db.paint(b, PAL.black);
  db.outlineOn(b, OUT);
  b.disc(98, 60, 5, hex('#f4e8c8'));
  b.disc(98, 60, 3.2, PAL.red[1]);
  b.disc(98, 60, 1.5, hex('#3aa86a'));
  b.set(98, 60, PAL.red[2]);
  b.line(101, 57, 104, 54, PAL.yellow[1]);
  // karaoke screen
  box(b, 186, 12, 52, 34, 0, PAL.black, PAL.black);
  b.rect(189, 15, 46, 26, hex('#2a3a9a'));
  b.rect(189, 15, 46, 4, hex('#3a4ab0'));
  b.text('KARAOKE', 197, 16, hex('#f6d050'));
  b.rect(192, 26, 40, 3, hex('#ffffff'));
  b.rect(192, 26, 22, 3, hex('#f8a0e0'));
  b.rect(196, 33, 32, 3, hex('#c8d0ff'));
  b.set(214, 25, hex('#ffffff'));
  b.rect(204, 46, 12, 3, PAL.black[1]);
  // glass shelf
  b.rect(182, 56, 58, 3, PAL.darkWood[1]);
  b.hline(182, 239, 56, PAL.darkWood[0]);
  b.frame(181, 55, 60, 5, OUT);
  for (let i = 0; i < 7; i++) {
    const x = 186 + i * 8;
    b.rect(x, 48, 4, 7, hex('#d8f0ff', 170));
    b.vline(x, 48, 54, hex('#ffffff', 220));
    b.hline(x, x + 3, 54, hex('#a8c8e0'));
  }
  // mölkky set in the corner
  shadow(b, 40, 126, 22, 4);
  for (let i = 0; i < 6; i++) {
    const x = 22 + i * 6;
    const y = 106 + (i % 2) * 4;
    box(b, x, y, 5, 14, 2, PAL.pine, PAL.pine);
    b.text(String(i + 1), x + 1, y + 6, PAL.darkWood[3]);
  }
  b.line(58, 124, 70, 120, PAL.pine[2], 3);
  // front: bar counter with beer taps
  const f = s.front;
  counter(s, 100, 70, 136, 40, 9, PAL.darkWood, ramp('#c8885a', '#a0663e', '#7a4a34', '#54302e'), 4);
  f.rect(100, 104, 136, 2, PAL.yellow[2]);
  // taps
  for (let i = 0; i < 3; i++) {
    const x = 196 + i * 10;
    f.rect(x, 58, 3, 12, PAL.metal[1]);
    f.vline(x, 58, 69, PAL.metal[0]);
    f.frame(x - 1, 57, 5, 14, OUT);
    box(f, x - 1, 48, 5, 9, 0, [PAL.yellow, PAL.red, PAL.green][i], [PAL.yellow, PAL.red, PAL.green][i]);
  }
  f.rect(192, 58, 34, 2, PAL.metal[2]);
  // pint + pizza on the bar
  f.rect(176, 62, 6, 9, hex('#f6c040'));
  f.rect(176, 60, 6, 3, hex('#fffbe8'));
  f.vline(176, 62, 70, hex('#ffe08a'));
  f.frame(175, 59, 8, 12, OUT);
  const pz = new Mask(W, H).ellipse(116, 73, 12, 3.5);
  pz.paint(f, ramp('#ffe0a0', '#f0b860', '#c88040'));
  pz.outlineOn(f, OUT);
  new Mask(W, H).ellipse(116, 72.5, 10, 2.5).fill(f, hex('#e05a3a'));
  for (const [x, y] of [[110, 72], [116, 73], [121, 72], [113, 71], [119, 71]] as const) f.set(x, y, hex('#fff4c0'));
  return s;
}

// ------------------------------------------------------------------ 12. 1970s rental flat
function viewYard(v: Img) {
  skyBands(v, ramp('#9ad0f2', '#b6dcf2', '#d0eaf4'), 0, v.h);
  cloud(v, 10, 8, 3, hex('#ffffff'), hex('#dceef8'));
  // opposite apartment block
  v.rect(14, 18, v.w - 14, 40, hex('#e8dcc4'));
  v.hline(14, v.w - 1, 18, hex('#fff4e0'));
  for (let y = 22; y < 56; y += 8) for (let x = 17; x < v.w; x += 6) v.rect(x, y, 3, 4, hex('#5a7aa0'));
  for (let y = 26; y < 56; y += 8) v.hline(14, v.w - 1, y, hex('#c8b8a0'));
  for (let i = 0; i < 3; i++) spruce(v, 4 + i * 10, 30 + i * 4, 26, PAL.green.slice(1));
  v.rect(0, v.h - 12, v.w, 12, hex('#6ab05a'));
  // balcony railing
  v.rect(0, v.h - 22, v.w, 2, hex('#e8e0d0'));
  for (let x = 1; x < v.w; x += 3) v.vline(x, v.h - 20, v.h - 1, hex('#c8c0c0'));
}

export function rentalFlat(): Scene {
  const r = rng(1212);
  const s = newScene([120, 38]);
  const b = s.back;
  const fy = 96;
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallpaper(img, 0, 0, W - 1, fy, hex('#eab878'), hex('#c4703e'), 'retro', 8, hex('#8e4a32'));
      ceiling(img, 4, ramp('#fff4e0', '#e8dcc0', '#c4b49a', '#8a7a70'));
    },
    floor: (img) => floorPlanks(img, fy, ramp('#e8a868', '#c88448', '#9c5e36', '#6a3c2c', '#44242a'), r),
    skirt: PAL.darkWood,
  });
  // balcony door
  windowFrame(b, 18, 12, 38, 84, PAL.white, viewYard, { cols: 1, rows: 2 });
  b.rect(50, 52, 2, 6, PAL.metal[1]);
  b.frame(49, 51, 4, 8, OUT);
  // teak bookshelf
  bookshelf(b, 62, 18, 34, 78, ramp('#d89a5a', '#b06e3a', '#844a2e', '#58302a'), r, 15);
  // orange pendant lamp
  b.vline(200, 0, 12, OUT);
  const lamp = new Mask(W, H).ellipse(200, 18, 9, 6).clip((_, y) => y <= 20);
  lamp.paint(b, PAL.orange, { split: 205 });
  lamp.outlineOn(b, OUT);
  b.hline(193, 207, 21, hex('#fff4b0'));
  // TV on a teak cabinet
  shadowRect(b, 160, 98, 52, 4);
  box(b, 162, 74, 48, 24, 3, ramp('#d89a5a', '#b06e3a', '#844a2e', '#58302a'), ramp('#d89a5a', '#b06e3a', '#844a2e', '#58302a'));
  b.frame(166, 80, 18, 14, hex('#58302a'));
  b.frame(188, 80, 18, 14, hex('#58302a'));
  box(b, 166, 46, 36, 28, 0, ramp('#c8885a', '#9c5e36', '#6a3c2c', '#44242a'), ramp('#c8885a', '#9c5e36', '#6a3c2c', '#44242a'));
  b.rect(169, 49, 24, 21, hex('#2a3446'));
  b.rect(170, 50, 22, 19, hex('#4a6a8a'));
  b.rect(172, 52, 8, 4, hex('#8ab0d0'));
  for (let i = 0; i < 3; i++) b.set(197, 52 + i * 5, PAL.metal[1]);
  b.line(178, 46, 172, 34, PAL.metal[2]);
  b.line(186, 46, 194, 34, PAL.metal[2]);
  // sauna door
  box(b, 214, 26, 26, 70, 0, PAL.pine, PAL.pine);
  for (let x = 216; x < 238; x += 4) b.vline(x, 28, 94, PAL.pine[2]);
  b.rect(220, 34, 14, 12, hex('#5a4a5a'));
  b.rect(221, 35, 12, 10, hex('#8a7a8a'));
  b.set(222, 36, hex('#d8d0e0'));
  paper(b, 217, 52, 21, 7, hex('#fbf6e6'));
  b.text('SAUNA', 218, 53, PAL.darkWood[3]);
  b.rect(234, 62, 4, 2, PAL.metal[1]);
  // rug
  ragRug(b, 54, 126, 150, 22, [hex('#c4703e'), hex('#e8c070'), hex('#8e4a32'), hex('#e8c070')], r);
  // front: corduroy sofa (Leena stands behind it)
  const f = s.front;
  const sofa = ramp('#f0a050', '#c8742e', '#9a5028', '#6a3424', '#44222a');
  shadowRect(b, 80, 114, 110, 5);
  const back = new Mask(W, H).rect(84, 72, 102, 22).ellipse(84, 78, 4, 6).ellipse(185, 78, 4, 6);
  back.paint(f, sofa, { split: 182 });
  back.outlineOn(f, OUT);
  for (let x = 88; x < 184; x += 3) f.vline(x, 74, 92, sofa[2]);
  f.vline(118, 72, 93, sofa[3]);
  f.vline(152, 72, 93, sofa[3]);
  // arm rests + seat
  for (const ax of [78, 180]) box(f, ax, 82, 14, 30, 4, sofa, sofa);
  box(f, 92, 92, 88, 18, 6, sofa, sofa);
  f.vline(121, 92, 98, sofa[3]);
  f.vline(151, 92, 98, sofa[3]);
  // cushion
  const cu = new Mask(W, H).rect(160, 82, 14, 12);
  cu.paint(f, ramp('#fff4b0', '#f6d050', '#d49a30', '#9c6230'));
  cu.outlineOn(f, OUT);
  return s;
}

// ------------------------------------------------------------------ 13. Ryttylä school classroom (evening classes)
export function opisto(): Scene {
  const r = rng(1313);
  const s = newScene([124, 38]);
  const b = s.back;
  const fy = 96;
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallpaper(img, 0, 0, W - 1, 62, hex('#e4ead0'), hex('#d8dec4'), 'none');
      wainscot(img, 0, W - 1, 66, fy, PAL.pine, 8);
      ceiling(img, 4, ramp('#fffbe8', '#e8e4d0', '#c4c0a8', '#8a8878'));
    },
    floor: (img) => floorPlanks(img, fy, PAL.wood, r),
    skirt: PAL.wood,
  });
  // blackboard
  box(b, 18, 12, 102, 48, 0, PAL.wood, PAL.wood);
  b.rect(20, 14, 98, 44, hex('#2e5a46'));
  for (let i = 0; i < 8; i++) b.hline(22 + i * 12, 26 + i * 12, 16 + ((i * 7) % 38), hex('#3e6a56'));
  const ch = hex('#eef4e8');
  b.text('ILTAKURSSIT', 24, 18, ch);
  b.hline(24, 66, 24, ch);
  b.text('SUOMI', 26, 29, ch);
  b.text('KITARA', 26, 36, ch);
  b.text('ATK', 26, 43, ch);
  b.text('A+B', 84, 30, hex('#f6d050'));
  b.text('2+2', 84, 38, hex('#f8a0a0'));
  b.line(80, 46, 108, 46, ch);
  b.line(96, 42, 106, 51, hex('#9ad0f4'));
  // chalk tray
  b.rect(18, 60, 102, 3, PAL.wood[1]);
  b.hline(18, 119, 60, PAL.wood[0]);
  b.frame(17, 59, 104, 5, OUT);
  b.rect(40, 58, 4, 2, hex('#ffffff'));
  b.rect(52, 58, 3, 2, hex('#f6d050'));
  b.rect(96, 57, 8, 3, PAL.darkWood[1]);
  // wall map
  b.rect(150, 10, 52, 2, PAL.darkWood[1]);
  b.frame(149, 9, 54, 4, OUT);
  box(b, 152, 12, 48, 38, 0, PAL.cream, PAL.cream);
  b.rect(154, 14, 44, 34, hex('#7ab8e4'));
  const land = new Mask(W, H).ellipse(164, 24, 7, 6).ellipse(168, 37, 5, 7).ellipse(182, 22, 10, 6).ellipse(186, 34, 5, 5).ellipse(193, 40, 3, 3);
  land.paint(b, ramp('#d8f0a0', '#a8d07a', '#7aa860'), { split: 190 });
  b.rect(150, 50, 52, 2, PAL.darkWood[1]);
  b.frame(149, 49, 54, 4, OUT);
  // window
  windowFrame(b, 212, 14, 26, 44, PAL.white, (v) => {
    skyBands(v, ramp('#9ad0f2', '#b6dcf2', '#d0eaf4'), 0, v.h);
    spruce(v, 6, 14, 24, PAL.green.slice(1));
    spruce(v, 15, 18, 22, PAL.green.slice(1));
    v.rect(0, v.h - 6, v.w, 6, hex('#6ab05a'));
  }, { cols: 1, rows: 2, sill: PAL.white });
  // globe on a cabinet
  shadowRect(b, 200, 98, 40, 4);
  box(b, 204, 70, 34, 28, 3, PAL.wood, PAL.wood);
  b.vline(221, 74, 96, PAL.wood[3]);
  const gl = new Mask(W, H).disc(221, 58, 8);
  gl.paint(b, PAL.blue, { split: 225 });
  gl.outlineOn(b, OUT);
  new Mask(W, H).ellipse(218, 56, 3, 4).ellipse(224, 61, 3, 2).fill(b, PAL.green[1]);
  b.set(217, 54, hex('#ffffff'));
  b.rect(220, 66, 3, 4, PAL.darkWood[1]);
  // student desks in the foreground (front layer, sides)
  const f = s.front;
  for (const dx of [14, 196]) {
    shadow(b, dx + 22, 152, 26, 4);
    box(f, dx, 130, 44, 12, 6, PAL.pine, PAL.wood);
    f.rect(dx + 3, 142, 3, 16, PAL.steel[2]);
    f.rect(dx + 38, 142, 3, 16, PAL.steel[2]);
    paper(f, dx + 8, 129, 10, 6, hex('#ffffff'));
    f.rect(dx + 26, 130, 8, 2, PAL.yellow[1]);
  }
  // teacher's desk
  counter(s, 92, 70, 92, 38, 8, PAL.wood, PAL.wood, 2);
  // books + apple + pencil cup
  for (let i = 0; i < 3; i++) box(f, 150, 62 + i * 3, 18 - i * 2, 4, 0, [PAL.red, PAL.blue, PAL.yellow][i], [PAL.red, PAL.blue, PAL.yellow][i]);
  const apple = new Mask(W, H).disc(102, 70, 3);
  apple.paint(f, PAL.red);
  apple.outlineOn(f, OUT);
  f.set(102, 66, PAL.green[2]);
  box(f, 172, 64, 6, 8, 0, PAL.teal, PAL.teal);
  f.vline(173, 60, 63, PAL.yellow[1]);
  f.vline(175, 61, 63, PAL.red[1]);
  return s;
}

// ------------------------------------------------------------------ 14. village library (1891 log schoolhouse)
export function library(): Scene {
  const r = rng(1414);
  const s = newScene([116, 38]);
  const b = s.back;
  const fy = 98;
  const oldLog = ramp('#e4b47a', '#c08c58', '#966640', '#684432', '#44282a');
  roomBox(b, {
    floorY: fy,
    wall: (img) => wallLogs(img, 0, 0, W - 1, fy, oldLog, 11, r),
    floor: (img) => floorPlanks(img, fy, ramp('#d8a070', '#b07a4e', '#86563a', '#5c3a30', '#3c2428'), r),
    corner: hex('#44282a'),
  });
  // tall bookshelves
  bookshelf(b, 14, 6, 48, 92, PAL.darkWood, r, 15);
  bookshelf(b, 64, 22, 30, 76, PAL.darkWood, r, 15);
  // hanging lamp
  b.vline(150, 0, 8, OUT);
  const hl = new Mask(W, H).ellipse(150, 13, 8, 5).clip((_, y) => y <= 15);
  hl.paint(b, PAL.green, { split: 154 });
  hl.outlineOn(b, OUT);
  b.hline(144, 156, 16, hex('#fff4b0'));
  // old photo
  frameArt(b, 138, 26, 28, 20, PAL.darkWood, (v) => {
    v.rect(0, 0, v.w, v.h, hex('#e8d8b8'));
    v.rect(0, v.h - 6, v.w, 6, hex('#c8b090'));
    for (let i = 0; i < 6; i++) {
      v.disc(3 + i * 4, 7, 1.5, hex('#6a5040'));
      v.rect(2 + i * 4, 9, 3, 5, hex('#8a7058'));
    }
    v.rect(0, 0, v.w, 3, hex('#d8c8a8'));
  });
  // kakluuni (white tiled stove)
  const kx = 192;
  shadowRect(b, kx - 2, fy + 2, 46, 5);
  const kk = new Mask(W, H).rect(kx, 8, 40, 92).ellipse(kx + 20, 8, 20, 4);
  kk.paint(b, ramp('#ffffff', '#eef0f4', '#c8ccdc', '#9a9cb8'), { split: kx + 30 });
  kk.outlineOn(b, OUT);
  for (let y = 14; y < 98; y += 8) b.hline(kx + 1, kx + 38, y, hex('#c8ccdc'));
  for (let y = 14; y < 98; y += 8) for (let x = kx + ((y / 8) % 2 ? 4 : 8); x < kx + 39; x += 8) b.vline(x, y, y + 7, hex('#c8ccdc'));
  b.rect(kx - 2, 4, 44, 4, PAL.white[1]);
  b.frame(kx - 3, 3, 46, 6, OUT);
  b.rect(kx - 2, 56, 44, 3, PAL.white[1]);
  b.frame(kx - 3, 55, 46, 5, OUT);
  for (const [dy, dh] of [[64, 12], [82, 10]] as const) {
    box(b, kx + 12, dy, 16, dh, 0, PAL.yellow, PAL.yellow);
    b.rect(kx + 18, dy + 3, 4, 2, PAL.yellow[3]);
  }
  // armchair + reading lamp (front, right)
  const f = s.front;
  const ac = ramp('#8ac87a', '#4e9a5a', '#2e6e4a', '#1e4a3a');
  shadow(b, 214, 154, 30, 5);
  const chairBack = new Mask(W, H).rect(192, 104, 44, 30).ellipse(214, 104, 22, 6);
  chairBack.paint(f, ac, { split: 228 });
  chairBack.outlineOn(f, OUT);
  for (const ax of [186, 230]) box(f, ax, 118, 12, 36, 4, ac, ac);
  box(f, 196, 132, 36, 20, 6, ac, ac);
  f.rect(200, 108, 28, 2, ac[2]);
  // floor lamp
  f.rect(180, 96, 2, 58, PAL.darkWood[2]);
  f.frame(179, 95, 4, 60, OUT);
  const shade = new Mask(W, H).tri(172, 96, 190, 96, 184, 84).tri(172, 96, 178, 84, 184, 84);
  shade.paint(f, PAL.cream);
  shade.outlineOn(f, OUT);
  f.rect(175, 154, 12, 3, PAL.darkWood[2]);
  // rag rug
  ragRug(b, 40, 128, 120, 22, [hex('#e86a5a'), hex('#f2c450'), hex('#e8e0d0'), hex('#5a8ad0')], r);
  // desk with stacks of books and a card box
  counter(s, 88, 70, 92, 38, 8, PAL.darkWood, PAL.darkWood, 2);
  box(f, 116, 99, 36, 8, 0, PAL.cream, PAL.cream);
  signText(f, 'KIRJASTO', 134, 101, PAL.darkWood[3]);
  for (let i = 0; i < 4; i++) box(f, 150, 54 + i * 4, 20 - (i % 2) * 3, 4, 0, [PAL.red, PAL.green, PAL.blue, PAL.yellow][i], [PAL.red, PAL.green, PAL.blue, PAL.yellow][i]);
  box(f, 92, 62, 16, 10, 3, PAL.wood, PAL.wood);
  for (let i = 0; i < 5; i++) f.vline(94 + i * 3, 59, 63, hex('#fbf6e6'));
  // a tea cup
  f.rect(172, 67, 5, 4, PAL.white[1]);
  f.frame(171, 66, 7, 6, OUT);
  return s;
}

// ------------------------------------------------------------------ 15. Kolmilammi dance pavilion, summer evening
export function dancePavilion(): Scene {
  const r = rng(1515);
  const s = newScene([124, 38]);
  const b = s.back;
  // evening sky
  skyBands(b, ramp('#3a3a7a', '#5a4a8e', '#8a5a9a', '#c06a8e', '#e8887a', '#f8b07a', '#ffd8a0'), 0, 70);
  // first stars
  for (let i = 0; i < 14; i++) b.set(Math.floor(r() * W), Math.floor(r() * 18), hex('#fff4d0', 200));
  // far shore, spruces
  treeLine(b, 64, hex('#3a2e58'), r, 4);
  for (let i = 0; i < 12; i++) spruce(b, 8 + i * 22 + Math.floor(r() * 8), 38 + Math.floor(r() * 10), 26, ramp('#5a4a7a', '#3a2e58', '#2a2244', '#1e1832'));
  // pond with reflections
  lake(b, 68, 86, ramp('#c87a8a', '#9a6a9a', '#6a5a8e', '#4a4a7a'), hex('#ffd8a0'), r);
  // shore
  b.rect(0, 84, W, 4, hex('#2a3a3a'));
  // pavilion floor
  const pf = new Img(W, H);
  floorPlanks(pf, 88, ramp('#e8b880', '#c89058', '#a0683e', '#744830', '#4a2c2a'), r);
  b.blit(pf.h ? sub(pf, 88) : pf, 0, 88);
  // floor sheen from the lights
  for (let y = 100; y < 150; y++) for (let x = 60; x < 200; x++) if (((x - 130) / 70) ** 2 + ((y - 124) / 22) ** 2 < 1) b.set(x, y, hex('#fff0c0', 22));
  // posts + railing
  const post = PAL.darkWood;
  for (const px of [2, 88, 176, 248]) {
    b.rect(px, 0, 6, 92, post[1]);
    b.vline(px, 0, 91, post[0]);
    b.vline(px + 5, 0, 91, post[3]);
    b.frame(px - 1, -1, 8, 94, OUT);
  }
  for (const [x0, x1] of [[8, 87], [94, 175], [182, 247]] as const) {
    b.rect(x0, 70, x1 - x0 + 1, 3, PAL.wood[1]);
    b.hline(x0, x1, 70, PAL.wood[0]);
    b.hline(x0, x1, 73, OUT);
    for (let x = x0 + 4; x < x1; x += 7) {
      b.rect(x, 74, 3, 14, PAL.wood[2]);
      b.vline(x, 74, 87, PAL.wood[1]);
    }
    b.rect(x0, 86, x1 - x0 + 1, 2, PAL.wood[2]);
  }
  // roof eave with carved trim
  b.rect(0, 0, W, 9, PAL.red[2]);
  b.hline(0, W - 1, 0, PAL.red[1]);
  b.rect(0, 9, W, 3, PAL.white[1]);
  for (let x = 0; x < W; x += 6) {
    b.rect(x + 1, 12, 4, 2, PAL.white[1]);
    b.set(x + 2, 14, PAL.white[2]);
    b.set(x + 3, 14, PAL.white[2]);
  }
  b.hline(0, W - 1, 15, hex('#2a1838', 70));
  // string lights
  const bulbs = [hex('#ffd050'), hex('#ff6a5a'), hex('#7ad0ff'), hex('#9aff8a'), hex('#ffa0e0')];
  stringLights(b, 8, 16, 88, 16, 10, bulbs, 9);
  stringLights(b, 94, 16, 176, 16, 9, bulbs, 9);
  stringLights(b, 182, 16, 248, 16, 10, bulbs, 9);
  // band stage (left)
  const st = PAL.wood;
  shadowRect(b, 8, 116, 74, 4);
  box(b, 8, 98, 74, 18, 5, st, ramp('#a0683e', '#744830', '#4a2c2a', '#30202a'));
  // drum kit
  const bd = new Mask(W, H).disc(56, 88, 8);
  bd.paint(b, PAL.red, { split: 60 });
  bd.outlineOn(b, OUT);
  b.disc(56, 88, 5, hex('#fff4e8'));
  b.disc(56, 88, 2, PAL.red[1]);
  for (const [x, y] of [[44, 84], [68, 84]] as const) {
    const t = new Mask(W, H).rect(x - 4, y - 3, 8, 6);
    t.paint(b, PAL.red);
    t.outlineOn(b, OUT);
    b.hline(x - 4, x + 3, y - 3, hex('#fff4e8'));
  }
  b.vline(74, 72, 98, PAL.metal[2]);
  b.hline(68, 80, 72, PAL.yellow[1]);
  b.hline(69, 79, 71, PAL.yellow[0]);
  // accordion on a chair
  b.rect(16, 80, 2, 18, PAL.darkWood[2]);
  b.rect(32, 80, 2, 18, PAL.darkWood[2]);
  box(b, 14, 86, 22, 4, 2, PAL.darkWood, PAL.darkWood);
  const acc = new Mask(W, H).rect(16, 70, 18, 14);
  acc.paint(b, PAL.red);
  acc.outlineOn(b, OUT);
  for (let x = 20; x < 30; x += 2) b.vline(x, 70, 83, PAL.red[3]);
  b.rect(16, 70, 4, 14, hex('#fff4e8'));
  for (let y = 71; y < 83; y += 2) b.set(17, y, OUT);
  b.rect(30, 70, 4, 14, PAL.black[1]);
  // front: ticket table with a cash box
  const f = s.front;
  shadowRect(b, 100, 112, 70, 5);
  f.rect(104, 82, 3, 30, PAL.darkWood[2]);
  f.rect(162, 82, 3, 30, PAL.darkWood[2]);
  box(f, 98, 70, 74, 12, 6, PAL.wood, PAL.wood);
  const cloth = new Mask(W, H).rect(102, 76, 66, 16);
  cloth.paint(f, ramp('#ffffff', '#f4f0f4', '#d0c8d8'));
  for (let x = 102; x < 168; x += 4) f.set(x + 1, 91, PAL.white[3]);
  signText(f, 'LIPUT', 135, 82, PAL.red[2]);
  box(f, 142, 62, 18, 9, 3, PAL.green, PAL.green);
  f.rect(149, 64, 4, 2, PAL.yellow[1]);
  // roll of tickets
  const tr = new Mask(W, H).disc(116, 67, 3);
  tr.paint(f, PAL.pink);
  tr.outlineOn(f, OUT);
  f.rect(118, 69, 6, 2, PAL.pink[0]);
  return s;
}

/** Bottom part of an image from y0. */
function sub(img: Img, y0: number): Img {
  const o = new Img(img.w, img.h - y0);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, img.get(x, y + y0));
  return o;
}

