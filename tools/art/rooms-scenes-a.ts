/** Interiors 1-8: parents_house, job_centre, station, bank, sawmill, department_store, health_centre, cottage. */
import { Img, hex, rng, type RGBA } from '../raster';
import {
  H, Mask, OUT, PAL, W, alpha, birch, box, ceiling, clock, cloud, floorFlat, floorPlanks, floorTiles, frameArt, lightBeam,
  lines, mix, paper, plant, ragRug, ramp, roomBox, shadow, shadowRect, signText, skyBands, spruce, steam, treeLine, viewSummer,
  wainscot, wallLogs, wallPlanks, wallpaper, windowFrame, type Ramp,
} from './rooms-kit';

export interface Scene {
  back: Img;
  front: Img;
  host: [number, number];
}

export const newScene = (host: [number, number]): Scene => ({ back: new Img(W, H), front: new Img(W, H), host });

/** 3x5 font scaled up k times. */
export function bigText(img: Img, s: string, x: number, y: number, c: RGBA, k = 2) {
  const t = new Img(Img.textWidth(s) + 2, 8);
  t.text(s, 0, 1, c);
  for (let yy = 0; yy < t.h; yy++) for (let xx = 0; xx < t.w; xx++) if (t.get(xx, yy)[3]) img.rect(x + xx * k, y + (yy - 1) * k, k, k, c);
}

/** Generic counter in the front layer with a floor shadow in the back layer. */
export function counter(s: Scene, x: number, y: number, w: number, h: number, top: number, rt: Ramp, rf: Ramp, panels = 0) {
  shadowRect(s.back, x - 2, y + h - 2, w + 6, 5, 70);
  box(s.front, x, y, w, h, top, rt, rf);
  if (panels > 0) {
    const pw = Math.floor((w - 8) / panels);
    for (let i = 0; i < panels; i++) {
      const px = x + 5 + i * pw;
      const py = y + top + 4;
      const ph = h - top - 9;
      s.front.frame(px, py, pw - 3, ph, rf[2]);
      s.front.hline(px + 1, px + pw - 5, py + ph, rf[0]);
      s.front.vline(px + pw - 3, py + 1, py + ph, rf[0]);
    }
  }
}

/** Wooden chair seen from the front (seat + back). */
function chair(img: Img, x: number, yb: number, r: Ramp, seat?: Ramp) {
  shadow(img, x + 9, yb, 12, 3);
  for (const lx of [x + 1, x + 15]) {
    img.rect(lx, yb - 30, 2, 31, r[2]);
    img.vline(lx, yb - 30, yb, r[1]);
  }
  img.rect(x, yb - 32, 18, 3, r[1]);
  img.hline(x, x + 17, yb - 32, r[0]);
  img.rect(x + 1, yb - 25, 16, 2, r[2]);
  box(img, x - 1, yb - 15, 20, 5, 3, seat ?? r, r);
  img.rect(x + 1, yb - 10, 2, 10, r[2]);
  img.rect(x + 15, yb - 10, 2, 10, r[2]);
  img.frame(x, yb - 33, 18, 2, OUT);
}

function cat(img: Img, x: number, y: number) {
  const fur = ramp('#ffc078', '#f08a3a', '#c45a2e', '#86382e');
  const m = new Mask(W, H).ellipse(x + 8, y + 5, 8, 4.5).disc(x + 14, y + 2, 3.5);
  m.paint(img, fur, { split: x + 12 });
  m.outlineOn(img, OUT);
  // ears
  img.set(x + 12, y - 2, fur[1]);
  img.set(x + 16, y - 2, fur[1]);
  img.set(x + 12, y - 3, OUT);
  img.set(x + 16, y - 3, OUT);
  img.set(x + 11, y - 2, OUT);
  img.set(x + 17, y - 2, OUT);
  // sleeping eyes
  img.set(x + 13, y + 2, OUT);
  img.set(x + 15, y + 2, OUT);
  // stripes + tail
  for (const sx of [x + 4, x + 7, x + 10]) img.vline(sx, y + 2, y + 4, fur[2]);
  for (let i = 0; i < 6; i++) img.set(x + 2 + i, y + 9, fur[2]);
  img.set(x + 1, y + 8, fur[2]);
}

function ryijy(img: Img, x: number, y: number, w: number, h: number) {
  // rod
  img.rect(x - 4, y - 3, w + 8, 3, PAL.darkWood[1]);
  img.frame(x - 5, y - 4, w + 10, 5, OUT);
  const base = hex('#9a2a3a');
  const cols = [hex('#f08a3a'), hex('#f6d050'), hex('#3c60b4'), hex('#e8e0c8'), hex('#5a9a5a')];
  img.rect(x, y, w, h, base);
  const cx = x + w / 2;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const dx = Math.abs(x + i - cx + 0.5);
      const dy = j % 16;
      const d = Math.abs(dx - 8) + Math.abs(dy - 8);
      let c: RGBA | null = null;
      if (d === 6 || d === 7) c = cols[Math.floor(j / 16) % 2];
      else if (d < 3) c = cols[2];
      else if (dx < 2 && dy > 12) c = cols[3];
      else if (i < 2 || i >= w - 2) c = cols[4];
      else if ((i + j) % 2 === 0 && d === 9) c = mix(base, cols[0], 0.5);
      if (c) img.set(x + i, y + j, c);
    }
  // shaggy fringe
  for (let i = 0; i < w; i += 2) img.vline(x + i, y + h, y + h + 2 + (i % 4 === 0 ? 1 : 0), cols[3]);
  img.frame(x - 1, y - 1, w + 2, h + 2, alpha(OUT, 150));
  img.vline(x + w, y, y + h, hex('#2a1838', 60));
}

function kitchenStove(img: Img, x: number, y: number) {
  // range: white enamel
  shadowRect(img, x - 2, y + 40, 40, 4);
  box(img, x, y, 34, 42, 5, PAL.white, PAL.white);
  img.rect(x + 4, y + 14, 26, 18, PAL.white[2]);
  img.rect(x + 6, y + 16, 22, 12, hex('#3a3046'));
  img.rect(x + 7, y + 17, 6, 3, hex('#5a5070'));
  img.hline(x + 4, x + 29, y + 11, PAL.metal[2]);
  for (let i = 0; i < 4; i++) {
    img.rect(x + 5 + i * 7, y + 7, 3, 2, OUT);
    img.set(x + 5 + i * 7, y + 7, PAL.metal[1]);
  }
  img.rect(x + 4, y + 34, 26, 4, PAL.white[2]);
  // hotplates
  img.rect(x + 4, y + 1, 9, 2, OUT);
  img.rect(x + 20, y + 1, 9, 2, OUT);
  // coffee pot (kahvipannu)
  const m = new Mask(W, H).tri(x + 19, y + 1, x + 31, y + 1, x + 27, y - 13).tri(x + 19, y + 1, x + 23, y - 13, x + 27, y - 13);
  m.paint(img, PAL.metal, { split: x + 27 });
  m.outlineOn(img, OUT);
  img.rect(x + 22, y - 15, 6, 2, PAL.metal[3]);
  img.set(x + 25, y - 16, OUT);
  img.line(x + 30, y - 2, x + 33, y - 9, PAL.darkWood[2]);
  img.line(x + 18, y - 8, x + 15, y - 12, PAL.metal[2]);
  steam(img, x + 15, y - 15, 5);
  steam(img, x + 24, y - 19, 4);
}

function upperCabinet(img: Img, x: number, y: number, w: number, h: number, r: Ramp) {
  shadowRect(img, x + 2, y + h, w, 3);
  box(img, x, y, w, h, 0, r, r);
  const dw = Math.floor(w / 2);
  for (let i = 0; i < 2; i++) {
    img.frame(x + i * dw + 2, y + 2, dw - 3, h - 4, r[2]);
    img.set(x + i * dw + (i ? 3 : dw - 3), y + h - 6, PAL.metal[1]);
  }
}

// ------------------------------------------------------------------ 1. parents' kitchen
export function parentsHouse(): Scene {
  const r = rng(101);
  const s = newScene([112, 38]);
  const b = s.back;
  const fy = 98;
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallpaper(img, 0, 0, W - 1, 64, hex('#f4e4b4'), hex('#e0a070'), 'flower', 10, hex('#7aa860'));
      wainscot(img, 0, W - 1, 66, fy, ramp('#d0e8b8', '#a8cc90', '#80a470', '#587a58'), 7);
      ceiling(img, 4, PAL.wood);
    },
    floor: (img) => floorPlanks(img, fy, PAL.pine, r),
    skirt: PAL.wood,
  });
  ryijy(b, 22, 14, 34, 44);
  clock(b, 80, 22, 9, PAL.wood, 8, 5);
  b.vline(80, 31, 40, PAL.darkWood[2]);
  b.rect(78, 40, 5, 5, PAL.yellow[1]);
  b.frame(77, 39, 7, 7, OUT);
  windowFrame(b, 150, 14, 46, 38, PAL.white, viewSummer(rng(7), { birches: true }), { cols: 2, rows: 2, curtain: ramp('#ffd0c8', '#f08a8a', '#c85a6a', '#8a3a50'), sill: PAL.white });
  // sill plants
  plant(b, 160, 54, 9, rng(3), 'fern', PAL.brick);
  b.rect(184, 46, 5, 6, hex('#e85a5a'));
  b.frame(183, 45, 7, 8, OUT);
  b.set(185, 47, hex('#ffffff'));
  upperCabinet(b, 202, 12, 38, 22, ramp('#d0e8b8', '#a8cc90', '#80a470', '#587a58'));
  kitchenStove(b, 206, 58);
  // chair with cat
  chair(b, 26, 122, PAL.wood, ramp('#f8b0a0', '#e07060', '#b04a4a', '#7a3040'));
  cat(b, 26, 101);
  ragRug(b, 60, 126, 136, 24, [hex('#e86a5a'), hex('#5a8ad0'), hex('#f2c450'), hex('#e8e0d0'), hex('#68a868')], r);
  ragRug(b, 214, 108, 26, 12, [hex('#5a8ad0'), hex('#e8e0d0')], r);
  // front: kitchen table with a runner, pulla and cups
  const f = s.front;
  shadow(b, 128, 120, 58, 6);
  for (const lx of [80, 172]) {
    f.rect(lx, 88, 4, 30, PAL.wood[2]);
    f.vline(lx, 88, 117, PAL.wood[1]);
    f.frame(lx - 1, 88, 6, 31, OUT);
  }
  box(f, 74, 69, 108, 20, 8, PAL.wood, PAL.wood);
  f.hline(76, 179, 84, PAL.wood[3]);
  // checked runner hanging over the front edge
  f.rect(104, 69, 48, 26, hex('#f4f0e8'));
  for (let x = 104; x < 152; x += 4) for (let y = 69; y < 95; y += 4) f.rect(x + ((y / 4) % 2 ? 2 : 0), y, 2, 2, hex('#d84a4a'));
  f.hline(104, 151, 76, hex('#c8bcc4'));
  f.vline(151, 77, 94, hex('#c8bcc4'));
  for (let x = 104; x < 152; x += 2) f.set(x, 95, hex('#f4f0e8'));
  f.frame(103, 76, 50, 19, OUT);
  f.rect(104, 76, 48, 1, hex('#ffffff'));
  // plate of pulla
  const pl = new Mask(W, H).ellipse(92, 72, 9, 3);
  pl.paint(f, PAL.white);
  pl.outlineOn(f, OUT);
  for (const [px, py] of [[88, 70], [93, 69], [96, 71]] as const) {
    const m = new Mask(W, H).ellipse(px, py, 3, 2);
    m.paint(f, ramp('#ffe0a0', '#e8a85a', '#b8723e'));
    m.outlineOn(f, OUT);
    f.set(px, py - 1, hex('#ffffff'));
  }
  for (const cx of [160, 170]) {
    f.rect(cx, 68, 6, 5, PAL.white[1]);
    f.hline(cx, cx + 5, 68, PAL.white[2]);
    f.frame(cx - 1, 67, 8, 7, OUT);
    f.set(cx + 6, 70, OUT);
    f.set(cx + 7, 70, OUT);
    f.hline(cx - 2, cx + 7, 74, alpha(OUT, 90));
  }
  return s;
}

// ------------------------------------------------------------------ 2. job centre desk in the kylätalo
export function jobCentre(): Scene {
  const r = rng(202);
  const s = newScene([98, 38]);
  const b = s.back;
  const fy = 96;
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallpaper(img, 0, 0, W - 1, 58, hex('#dfe4ec'), hex('#ccd2de'), 'stripes', 12);
      wainscot(img, 0, W - 1, 60, fy, PAL.pine, 8);
      ceiling(img, 5, ramp('#e8ecf0', '#c8ccd8', '#a0a4b8', '#70708c'));
    },
    floor: (img) => floorTiles(img, fy, hex('#b4bccc'), hex('#d8d4c8'), hex('#8a8ca4'), 16),
    skirt: PAL.darkWood,
  });
  // fluorescent light strip
  b.rect(60, 6, 80, 2, hex('#ffffff'));
  b.hline(60, 139, 8, PAL.metal[2]);
  // queue number display
  box(b, 20, 12, 40, 22, 0, PAL.black, PAL.black);
  b.rect(22, 14, 36, 18, hex('#1a1020'));
  bigText(b, '047', 23, 17, hex('#ff5a3a'));
  b.text('NRO', 47, 23, hex('#ff5a3a', 150));
  // job ad board
  box(b, 166, 12, 66, 44, 0, PAL.wood, PAL.wood);
  b.rect(168, 14, 62, 40, hex('#c8955a'));
  for (let i = 0; i < 30; i++) b.set(168 + Math.floor(r() * 62), 14 + Math.floor(r() * 40), hex('#a87a4a'));
  signText(b, 'TYÖPAIKAT', 199, 17, hex('#fff4e0'));
  const ads: [number, number, number, number, RGBA][] = [
    [171, 25, 16, 20, hex('#fbf6e6')],
    [190, 24, 18, 14, hex('#fff4a0')],
    [211, 25, 16, 22, hex('#fbf6e6')],
    [191, 40, 16, 12, hex('#d8ecff')],
  ];
  for (const [x, y, w, h, c] of ads) {
    paper(b, x, y, w, h, c, PAL.red[1]);
    lines(b, x + 2, y + 5, w - 4, Math.floor((h - 6) / 2), hex('#8a8aa8'), r);
  }
  b.text('TYÖ', 173, 28, PAL.red[2]);
  // ficus + waiting chair
  plant(b, 30, 118, 26, rng(5), 'ficus', PAL.brick);
  // coffee machine on a cabinet, with a note
  box(b, 196, 76, 40, 30, 4, PAL.pine, PAL.pine);
  shadowRect(b, 194, 104, 46, 4);
  box(b, 202, 48, 26, 28, 3, PAL.steel, PAL.steel);
  b.rect(205, 54, 20, 8, hex('#3a3046'));
  b.rect(208, 64, 14, 10, hex('#1a1020'));
  b.rect(213, 70, 4, 4, PAL.white[1]);
  paper(b, 204, 56, 22, 7, hex('#fff4a0'));
  b.text('EI', 205, 57, PAL.red[2]);
  b.set(212, 59, PAL.red[2]);
  b.text('OK', 217, 57, hex('#6a6a88'));
  b.line(215, 57, 225, 62, PAL.red[2]);
  // front: desk with computer + name plate
  const f = s.front;
  counter(s, 70, 70, 114, 40, 8, PAL.pine, ramp('#c8ccd8', '#a8acc0', '#80849c', '#5a5c78'), 3);
  // CRT monitor
  shadowRect(f, 142, 74, 34, 3);
  box(f, 142, 46, 32, 28, 0, PAL.cream, PAL.cream);
  f.rect(145, 49, 26, 19, hex('#2a4a6a'));
  f.rect(147, 51, 22, 15, hex('#3a7ab0'));
  for (let i = 0; i < 4; i++) f.hline(149, 149 + 8 + ((i * 5) % 9), 53 + i * 3, hex('#d8f0ff'));
  f.rect(150, 68, 16, 3, PAL.cream[2]);
  f.rect(148, 71, 20, 3, PAL.cream[1]);
  f.frame(147, 70, 22, 5, OUT);
  // keyboard, papers, mug
  box(f, 118, 72, 22, 4, 2, PAL.cream, PAL.cream);
  paper(f, 78, 71, 16, 5, hex('#fbf6e6'));
  paper(f, 80, 70, 16, 5, hex('#ffffff'));
  f.rect(100, 69, 5, 6, PAL.blue[1]);
  f.frame(99, 68, 7, 8, OUT);
  // name plate
  box(f, 112, 90, 30, 9, 0, PAL.cream, PAL.cream);
  signText(f, 'TARJA', 127, 92, PAL.blue[3]);
  return s;
}

// ------------------------------------------------------------------ 3. station waiting room
function viewPlatform(v: Img) {
  const r = rng(33);
  skyBands(v, ramp('#7cc0ec', '#9ad0f2', '#c0e4f4'), 0, 22);
  cloud(v, 14, 6, 4, hex('#ffffff'), hex('#dceef8'));
  treeLine(v, 22, hex('#4c8a64'), r, 4);
  for (let i = 0; i < 6; i++) spruce(v, 8 + i * 13, 8 + (i % 2) * 3, 14, PAL.green.slice(1));
  // catenary pole + wire
  v.rect(52, 0, 2, 30, PAL.steel[2]);
  v.hline(0, v.w - 1, 4, PAL.steel[3]);
  // train: white body, green stripe, dark windows
  const ty = 18;
  v.rect(0, ty, v.w, 22, hex('#f4f4f0'));
  v.hline(0, v.w - 1, ty, hex('#c8ccd8'));
  v.rect(0, ty + 15, v.w, 3, hex('#3aa86a'));
  for (let x = 2; x < v.w; x += 12) {
    v.rect(x, ty + 4, 8, 8, hex('#2a3a5a'));
    v.hline(x, x + 7, ty + 4, hex('#5a7aa0'));
    v.set(x + 1, ty + 5, hex('#a8c8e8'));
  }
  v.rect(38, ty + 3, 8, 14, hex('#5a6a7a'));
  v.vline(42, ty + 3, ty + 16, hex('#2a3a5a'));
  v.rect(0, ty + 22, v.w, 2, hex('#3a3046'));
  // platform
  v.rect(0, ty + 24, v.w, v.h - ty - 24, hex('#a8a4b0'));
  v.hline(0, v.w - 1, ty + 24, hex('#f6d050'));
  v.hline(0, v.w - 1, ty + 25, hex('#c8c4cc'));
}

export function station(): Scene {
  const r = rng(303);
  const s = newScene([136, 38]);
  const b = s.back;
  const fy = 96;
  const ochre = ramp('#fbe4a4', '#ecc878', '#c89a58', '#9a6c44', '#6a4436');
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallPlanks(img, 0, 0, W - 1, 62, ochre, 7, r, { grain: false });
      wainscot(img, 0, W - 1, 66, fy, ramp('#c87a5a', '#a0503e', '#7a3634', '#52242c'), 7);
      ceiling(img, 5, PAL.darkWood);
    },
    floor: (img) => floorPlanks(img, fy, ramp('#d8c4a8', '#b8a088', '#94786c', '#6a5058', '#46323e'), r),
    skirt: PAL.darkWood,
  });
  // timetable board
  box(b, 16, 12, 64, 44, 0, PAL.darkWood, PAL.darkWood);
  b.rect(18, 14, 60, 40, hex('#1e2a4a'));
  signText(b, 'LÄHTEVÄT', 48, 18, hex('#f6d050'));
  b.hline(20, 75, 24, hex('#3a4a7a'));
  const rows = ['10.12 HKI', '10.42 RI', '11.12 HKI', '11.42 RI'];
  rows.forEach((t, i) => {
    const y = 27 + i * 6;
    b.rect(20, y - 1, 5, 6, hex('#f08a3a'));
    b.text('R', 21, y, hex('#ffffff'));
    b.text(t, 28, y, i === 0 ? hex('#ffffff') : hex('#c8d4f0'));
  });
  // station clock
  clock(b, 96, 24, 9, PAL.steel, 10, 8);
  b.rect(95, 12, 3, 3, PAL.steel[3]);
  // station name sign
  box(b, 92, 52, 34, 10, 0, PAL.blue, PAL.blue);
  signText(b, 'RYTTYLÄ', 109, 55, hex('#ffffff'));
  // platform window
  windowFrame(b, 168, 10, 72, 54, PAL.darkWood, viewPlatform, { cols: 3, rows: 2, sill: PAL.darkWood });
  // radiator under window
  box(b, 180, 72, 48, 16, 0, PAL.white, PAL.white);
  for (let x = 183; x < 226; x += 4) b.vline(x, 74, 85, PAL.white[2]);
  // ticket machine
  shadowRect(b, 22, 104, 26, 4);
  box(b, 24, 60, 22, 46, 3, PAL.steel, ramp('#7ad0a8', '#3ea878', '#2e7a62', '#1e544a'));
  b.rect(28, 66, 14, 10, hex('#1e2a4a'));
  b.rect(29, 67, 12, 3, hex('#9ae0ff'));
  b.text('LIPUT', 26, 80, hex('#ffffff'));
  b.rect(28, 88, 14, 3, OUT);
  b.rect(30, 94, 10, 6, PAL.steel[3]);
  // a pigeon that got in and now lives on the ticket machine
  const pg = ramp('#dcdce8', '#a8a8bc', '#7a7a94', '#52526c');
  const pb = new Mask(W, H).ellipse(35, 55, 6, 3.6).disc(30, 51, 2.6).tri(39, 54, 43, 52, 42, 57);
  pb.paint(b, pg, { split: 37 });
  pb.outlineOn(b, OUT);
  for (const [x, y] of [[29, 53], [30, 54], [31, 53]] as const) b.set(x, y, hex('#6ab0a0'));
  for (const [x, y] of [[34, 54], [36, 55], [38, 54]] as const) b.set(x, y, pg[3]);
  b.set(29, 50, OUT);
  b.set(30, 50, hex('#f08a3a'));
  b.set(27, 51, hex('#f6d050'));
  b.set(26, 51, OUT);
  b.set(34, 59, hex('#e86a6a'));
  b.set(37, 59, hex('#e86a6a'));
  // ...and its contribution to the machine
  b.set(41, 61, hex('#ffffff'));
  b.set(42, 62, hex('#ffffff'));
  b.set(41, 63, hex('#e8e8f0'));
  // bench by the wall (left) with a newspaper
  shadowRect(b, 52, 108, 34, 4);
  box(b, 54, 92, 30, 6, 3, PAL.wood, PAL.wood);
  b.rect(56, 98, 3, 10, PAL.wood[3]);
  b.rect(79, 98, 3, 10, PAL.wood[3]);
  paper(b, 60, 89, 10, 4, hex('#e8e8f0'));
  // front: wooden bench with a backrest that Pertti leans on
  const f = s.front;
  shadow(b, 152, 118, 52, 5);
  for (const lx of [106, 194]) {
    f.rect(lx, 70, 4, 48, PAL.darkWood[2]);
    f.vline(lx, 70, 117, PAL.darkWood[1]);
    f.frame(lx - 1, 69, 6, 50, OUT);
  }
  for (const y of [72, 80]) box(f, 100, y, 104, 6, 0, PAL.wood, PAL.wood);
  box(f, 98, 96, 108, 8, 4, PAL.wood, PAL.wood);
  // a thermos cup on the bench seat
  f.rect(184, 91, 5, 5, PAL.red[1]);
  f.frame(183, 90, 7, 7, OUT);
  return s;
}

// ------------------------------------------------------------------ 4. savings bank
export function bank(): Scene {
  const s = newScene([112, 38]);
  const b = s.back;
  const fy = 96;
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallpaper(img, 0, 0, W - 1, 60, hex('#6aa496'), hex('#5a9486'), 'stripes', 8, hex('#7ab4a4'));
      wainscot(img, 0, W - 1, 64, fy, PAL.darkWood, 10);
      ceiling(img, 6, ramp('#fff4d8', '#e8dcc0', '#c4b4a0', '#8a7a7a'));
      // crown moulding
      img.hline(0, W - 1, 7, hex('#fff4d8'));
    },
    floor: (img) => floorTiles(img, fy, hex('#e8dcc4'), hex('#a8805e'), hex('#7a5a4a'), 18),
    skirt: PAL.darkWood,
  });
  // painting (lake landscape)
  frameArt(b, 22, 16, 42, 30, PAL.yellow, viewSummer(rng(9), { lakeLine: 12 }));
  clock(b, 84, 24, 8, PAL.yellow, 1, 50);
  // vault door
  const vx = 206;
  const vy = 54;
  box(b, 184, 16, 46, 80, 0, PAL.steel, PAL.steel);
  b.rect(186, 18, 42, 76, PAL.steel[3]);
  const vd = new Mask(W, H).disc(vx + 1, vy, 19);
  vd.paint(b, ramp('#e8eef4', '#b8c0d0', '#8a90a8', '#5e6080', '#3c3a58'), { split: vx + 10 });
  vd.outlineOn(b, OUT);
  new Mask(W, H).disc(vx + 1, vy, 15).paint(b, PAL.steel);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    b.set(Math.round(vx + 1 + Math.cos(a) * 17), Math.round(vy + Math.sin(a) * 17), PAL.steel[3]);
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    b.line(vx + 1, vy, Math.round(vx + 1 + Math.cos(a) * 10), Math.round(vy + Math.sin(a) * 10), PAL.steel[3]);
    b.disc(Math.round(vx + 1 + Math.cos(a) * 10), Math.round(vy + Math.sin(a) * 10), 1.2, PAL.yellow[1]);
  }
  new Mask(W, H).disc(vx + 1, vy, 3).paint(b, PAL.yellow);
  b.rect(226, 40, 4, 8, PAL.steel[2]);
  b.rect(226, 60, 4, 8, PAL.steel[2]);
  // plant
  plant(b, 34, 116, 22, rng(4), 'monstera', ramp('#f0f0f4', '#c8c8d8', '#9a9ab0', '#6a6a88'));
  // brochure stand
  box(b, 58, 70, 14, 34, 0, PAL.metal, PAL.metal);
  for (let i = 0; i < 3; i++) {
    b.rect(60, 73 + i * 10, 10, 7, [hex('#f6d050'), hex('#7ab4f0'), hex('#f08a8a')][i]);
    b.hline(61, 68, 75 + i * 10, hex('#ffffff'));
  }
  // KASSA plaque
  box(b, 150, 20, 26, 10, 0, PAL.yellow, PAL.yellow);
  signText(b, 'KASSA', 163, 23, PAL.darkWood[3]);
  // front: counter + glass partition
  const f = s.front;
  counter(s, 68, 70, 116, 40, 8, ramp('#e8dcc8', '#c8b8a0', '#a08a7a', '#6a5a5a'), PAL.darkWood, 3);
  // glass
  f.rect(70, 36, 112, 34, hex('#c8f0ff', 34));
  f.hline(70, 181, 36, hex('#ffffff', 170));
  f.hline(70, 181, 35, alpha(OUT, 160));
  f.vline(69, 35, 69, PAL.steel[2]);
  f.vline(182, 35, 69, PAL.steel[2]);
  f.frame(68, 35, 3, 35, alpha(OUT, 200));
  f.frame(181, 35, 3, 35, alpha(OUT, 200));
  for (let k = 0; k < 14; k++) {
    f.set(74 + k, 52 - k, hex('#ffffff', 90));
    f.set(77 + k, 52 - k, hex('#ffffff', 60));
    f.set(164 + k, 68 - k, hex('#ffffff', 90));
  }
  // deal tray slot
  f.rect(112, 66, 30, 3, hex('#3a3046', 160));
  // pen on chain + bell
  f.rect(162, 72, 8, 2, PAL.blue[2]);
  f.set(161, 72, OUT);
  const bell = new Mask(W, H).ellipse(88, 73, 4, 2.5);
  bell.paint(f, PAL.yellow);
  bell.outlineOn(f, OUT);
  f.set(88, 70, PAL.yellow[2]);
  return s;
}

// ------------------------------------------------------------------ 5. sawmill workshop
function viewTower(v: Img) {
  const r = rng(55);
  skyBands(v, ramp('#8ac8ee', '#a6d6f2', '#c8e6f2'), 0, v.h);
  cloud(v, 60, 6, 4, hex('#ffffff'), hex('#dceef8'));
  // ridge
  const ridge = new Mask(v.w, v.h).ellipse(28, v.h + 4, 44, 26);
  ridge.paint(v, ramp('#7ab06a', '#5a9058', '#3e7048', '#2a5040'), { flat: true });
  treeLine(v, v.h - 8, hex('#3e7048'), r, 3);
  for (let i = 0; i < 7; i++) spruce(v, 4 + i * 12, v.h - 20 + (i % 3) * 2, 13, PAL.green.slice(1));
  // lookout tower on the ridge
  const tx = 30;
  const ty = 4;
  const tw = PAL.wood;
  v.line(tx - 4, ty + 26, tx - 1, ty + 6, tw[2]);
  v.line(tx + 6, ty + 26, tx + 3, ty + 6, tw[3]);
  for (let y = ty + 10; y < ty + 26; y += 5) v.hline(tx - 3, tx + 5, y, tw[2]);
  v.line(tx - 3, ty + 25, tx + 4, ty + 11, tw[3]);
  v.rect(tx - 3, ty + 3, 8, 4, tw[1]);
  v.hline(tx - 3, tx + 4, ty + 3, tw[0]);
  v.tri(tx - 4, ty + 3, tx + 6, ty + 3, tx + 1, ty - 2, PAL.red[2]);
}

export function sawmill(): Scene {
  const r = rng(505);
  const s = newScene([112, 38]);
  const b = s.back;
  const fy = 94;
  const barn = ramp('#c8a888', '#9c7c64', '#76584e', '#4e3a40', '#33242e');
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallPlanks(img, 0, 0, W - 1, fy, barn, 9, r, { knots: true });
      // beam
      img.rect(0, 0, W, 7, PAL.darkWood[2]);
      img.hline(0, W - 1, 6, PAL.darkWood[3]);
      img.hline(0, W - 1, 7, hex('#2a1838', 80));
      for (const x of [60, 196]) {
        img.rect(x, 7, 7, fy - 7, PAL.darkWood[1]);
        img.vline(x, 7, fy, PAL.darkWood[0]);
        img.vline(x + 6, 7, fy, PAL.darkWood[3]);
      }
    },
    floor: (img) => {
      floorFlat(img, fy, ramp('#d4c8b8', '#b4a894', '#8a7e74', '#5e5460'), r);
      // sawdust drifts
      for (let i = 0; i < 9; i++) {
        const [cx, cy, rx, ry] = [10 + r() * 236, fy + 12 + r() * 50, 6 + r() * 10, 2 + r() * 2];
        new Mask(W, H).ellipse(cx, cy, rx, ry).fill(img, hex('#f4e0b0', 120));
        new Mask(W, H).ellipse(cx - 1, cy - 1, rx * 0.6, 1).fill(img, hex('#fff4d8', 90));
      }
    },
    skirt: barn,
  });
  // factory window with the lookout tower
  windowFrame(b, 140, 12, 76, 46, ramp('#7a8a9a', '#5a6a7a', '#3e4a5a', '#2a3040'), viewTower, { cols: 4, rows: 2, bar: 2 });
  lightBeam(b, 150, fy + 2, 40, 30, 30, hex('#fff4c0', 34));
  // tool board
  box(b, 14, 14, 42, 40, 0, PAL.pine, PAL.pine);
  for (let y = 18; y < 52; y += 4) for (let x = 17; x < 54; x += 4) b.set(x, y, PAL.pine[3]);
  // saw
  const saw = new Mask(W, H).tri(18, 20, 18, 30, 40, 26);
  saw.paint(b, PAL.metal);
  saw.outlineOn(b, OUT);
  for (let x = 20; x < 40; x += 2) b.set(x, 30 - Math.round((x - 18) * 0.18), OUT);
  box(b, 15, 19, 6, 11, 0, PAL.red, PAL.red);
  // hammer, chisels, clamp
  b.rect(44, 18, 2, 14, PAL.wood[1]);
  b.frame(43, 17, 4, 16, OUT);
  b.rect(41, 16, 8, 4, PAL.steel[1]);
  b.frame(40, 15, 10, 6, OUT);
  for (let i = 0; i < 4; i++) {
    b.rect(18 + i * 5, 38, 2, 6, PAL.wood[1]);
    b.rect(18 + i * 5, 44, 2, 6, PAL.steel[1]);
    b.frame(17 + i * 5, 37, 4, 14, OUT);
  }
  const cl = new Mask(W, H).rect(40, 38, 12, 3).rect(40, 38, 3, 12).rect(40, 47, 12, 3);
  cl.paint(b, PAL.red);
  cl.outlineOn(b, OUT);
  // lathe
  shadowRect(b, 10, 110, 50, 5);
  box(b, 12, 70, 46, 12, 3, ramp('#a8d0b8', '#6a9a88', '#4a7268', '#30504c'), ramp('#a8d0b8', '#6a9a88', '#4a7268', '#30504c'));
  box(b, 16, 82, 8, 28, 0, ramp('#a8d0b8', '#6a9a88', '#4a7268', '#30504c'), ramp('#a8d0b8', '#6a9a88', '#4a7268', '#30504c'));
  box(b, 46, 82, 8, 28, 0, ramp('#a8d0b8', '#6a9a88', '#4a7268', '#30504c'), ramp('#a8d0b8', '#6a9a88', '#4a7268', '#30504c'));
  box(b, 12, 60, 12, 10, 0, ramp('#a8d0b8', '#6a9a88', '#4a7268', '#30504c'), ramp('#a8d0b8', '#6a9a88', '#4a7268', '#30504c'));
  b.rect(24, 64, 26, 3, PAL.wood[1]);
  b.hline(24, 49, 64, PAL.wood[0]);
  b.frame(23, 63, 28, 5, OUT);
  b.rect(48, 60, 8, 10, PAL.steel[2]);
  b.frame(47, 59, 10, 12, OUT);
  // planks leaning on the wall
  for (let i = 0; i < 4; i++) {
    const x = 68 + i * 5;
    b.line(x, 30, x + 8, fy + 2, PAL.pine[i % 2 ? 1 : 2], 4);
  }
  for (let i = 0; i < 4; i++) b.line(66 + i * 5, 29, 74 + i * 5, fy + 2, OUT);
  // half-built chairs
  for (const [cx, cy] of [[196, 130]] as const) {
    shadow(b, cx + 9, cy, 12, 3);
    for (const lx of [cx, cx + 16]) {
      b.rect(lx, cy - 30, 3, 31, PAL.pine[2]);
      b.vline(lx, cy - 30, cy, PAL.pine[1]);
      b.frame(lx - 1, cy - 31, 5, 33, OUT);
    }
    b.rect(cx + 2, cy - 26, 14, 3, PAL.pine[1]);
    b.frame(cx + 1, cy - 27, 16, 5, OUT);
    b.rect(cx + 2, cy - 12, 14, 2, PAL.pine[2]);
  }
  // front: workbench with a vise, plank, plane and shavings
  const f = s.front;
  counter(s, 70, 70, 120, 40, 9, PAL.pine, PAL.wood);
  for (let i = 0; i < 3; i++) {
    const dx = 76 + i * 38;
    f.frame(dx, 84, 32, 10, PAL.wood[3]);
    f.rect(dx + 14, 88, 5, 2, PAL.metal[1]);
  }
  box(f, 92, 66, 60, 6, 3, ramp('#fff0c8', '#f2d8a0', '#cca878', '#9a7856'), ramp('#fff0c8', '#f2d8a0', '#cca878', '#9a7856'));
  box(f, 160, 64, 16, 7, 3, PAL.red, PAL.red);
  f.rect(163, 61, 7, 3, PAL.darkWood[1]);
  f.frame(162, 60, 9, 4, OUT);
  // vise
  box(f, 72, 62, 14, 10, 3, PAL.steel, PAL.steel);
  f.rect(74, 72, 2, 8, PAL.steel[2]);
  f.hline(70, 80, 80, PAL.steel[1]);
  // shavings curls
  for (const [x, y] of [[126, 70], [140, 72], [182, 73]] as const) {
    f.set(x, y, hex('#fff0c0'));
    f.set(x + 1, y - 1, hex('#fff0c0'));
    f.set(x + 2, y, hex('#d8b878'));
    f.set(x + 1, y + 1, hex('#d8b878'));
  }
  return s;
}

// ------------------------------------------------------------------ 6. hardware store + flea-market corner
function hammer(img: Img, x: number, y: number) {
  img.rect(x, y + 3, 2, 12, PAL.wood[1]);
  img.frame(x - 1, y + 2, 4, 14, OUT);
  img.rect(x - 3, y, 8, 4, PAL.steel[1]);
  img.hline(x - 3, x + 4, y, PAL.steel[0]);
  img.frame(x - 4, y - 1, 10, 6, OUT);
}
function wrench(img: Img, x: number, y: number, len: number) {
  img.rect(x, y + 3, 2, len, PAL.steel[1]);
  img.vline(x, y + 3, y + 3 + len, PAL.steel[0]);
  img.rect(x - 1, y, 4, 4, PAL.steel[1]);
  img.set(x + 1, y, OUT);
  img.set(x + 1, y + 1, OUT);
  const m = new Mask(W, H).rect(x - 1, y, 4, len + 4);
  m.outlineOn(img, OUT);
}
function paintCan(img: Img, x: number, y: number, c: Ramp) {
  box(img, x, y, 9, 10, 2, PAL.metal, PAL.metal);
  img.rect(x + 1, y + 4, 7, 4, c[1]);
  img.hline(x + 1, x + 7, y + 4, c[0]);
  img.set(x + 7, y + 6, c[2]);
}

export function departmentStore(): Scene {
  const r = rng(606);
  const s = newScene([104, 38]);
  const b = s.back;
  const fy = 96;
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallpaper(img, 0, 0, W - 1, fy, hex('#f2ead8'), hex('#e6dcc6'), 'none');
      img.rect(0, 0, W, 9, PAL.blue[2]);
      img.hline(0, W - 1, 9, PAL.blue[3]);
      img.hline(0, W - 1, 1, PAL.blue[1]);
      img.hline(0, W - 1, 10, hex('#2a1838', 60));
    },
    floor: (img) => floorFlat(img, fy, ramp('#c8ccd8', '#a8aec0', '#868aa4', '#5e6080'), r),
    skirt: PAL.blue,
  });
  bigText(b, 'RAUTA', 16, 2, hex('#ffffff'), 1);
  // pegboard of tools
  box(b, 14, 14, 58, 40, 0, PAL.cream, PAL.cream);
  for (let y = 17; y < 52; y += 4) for (let x = 17; x < 70; x += 4) b.set(x, y, PAL.cream[3]);
  hammer(b, 22, 18);
  hammer(b, 34, 20);
  wrench(b, 46, 18, 14);
  wrench(b, 52, 18, 11);
  wrench(b, 58, 18, 8);
  const sw = new Mask(W, H).tri(18, 40, 18, 49, 44, 46);
  sw.paint(b, PAL.metal);
  sw.outlineOn(b, OUT);
  box(b, 15, 39, 6, 11, 0, PAL.yellow, PAL.yellow);
  const pl = new Mask(W, H).line(52, 38, 60, 50, 2).line(60, 38, 52, 50, 2);
  pl.paint(b, PAL.red);
  pl.outlineOn(b, OUT);
  // paint can shelf
  box(b, 14, 58, 58, 38, 0, PAL.wood, PAL.wood);
  b.rect(16, 60, 54, 34, PAL.wood[3]);
  b.rect(16, 76, 54, 2, PAL.wood[1]);
  const cans = [PAL.red, PAL.blue, PAL.yellow, PAL.green, PAL.cream, PAL.teal];
  for (let i = 0; i < 5; i++) paintCan(b, 17 + i * 10, 65, cans[i % cans.length]);
  for (let i = 0; i < 5; i++) paintCan(b, 17 + i * 10, 83, cans[(i + 3) % cans.length]);
  // TV and fridge on display
  shadowRect(b, 180, 98, 30, 4);
  box(b, 182, 74, 26, 24, 2, PAL.darkWood, PAL.darkWood);
  box(b, 180, 48, 30, 25, 0, PAL.black, PAL.black);
  b.rect(183, 51, 22, 16, hex('#3a7ab0'));
  b.rect(183, 60, 22, 7, hex('#5aa86a'));
  b.disc(198, 55, 3, hex('#fff4a0'));
  b.hline(183, 204, 51, hex('#8ac8ee'));
  b.rect(203, 69, 3, 2, PAL.red[1]);
  shadowRect(b, 212, 98, 32, 4);
  box(b, 214, 26, 26, 72, 2, PAL.white, PAL.white);
  b.hline(215, 238, 52, PAL.white[3]);
  b.rect(216, 32, 2, 12, PAL.metal[2]);
  b.rect(216, 56, 2, 14, PAL.metal[2]);
  paper(b, 222, 58, 14, 9, hex('#fff4a0'));
  b.text('ALE', 223, 60, PAL.red[2]);
  // front: shop counter with an old cash register
  const f = s.front;
  counter(s, 82, 70, 92, 40, 8, PAL.wood, PAL.wood, 2);
  box(f, 146, 56, 24, 16, 3, PAL.steel, PAL.steel);
  f.rect(150, 51, 14, 6, PAL.black[1]);
  f.text('9', 156, 52, hex('#7aff8a'));
  f.frame(149, 50, 16, 7, OUT);
  for (let i = 0; i < 4; i++) f.rect(149 + i * 5, 63, 3, 2, PAL.cream[1]);
  // rack of overalls & clothes (front, right)
  shadow(b, 220, 152, 30, 4);
  f.rect(196, 98, 52, 2, PAL.steel[1]);
  f.frame(195, 97, 54, 4, OUT);
  f.rect(198, 100, 2, 52, PAL.steel[2]);
  f.rect(244, 100, 2, 52, PAL.steel[2]);
  const clothes: Ramp[] = [PAL.blue, PAL.blue, PAL.red, PAL.green, PAL.orange];
  clothes.forEach((c, i) => {
    const x = 202 + i * 8;
    const m = new Mask(W, H).rect(x, 102, 9, 22).rect(x + 1, 124, 3, 14).rect(x + 5, 124, 3, 14);
    if (i > 1) m.clip((_, y) => y < 126);
    m.paint(f, c, { split: x + 7 });
    m.outlineOn(f, OUT);
    f.set(x + 4, 100, OUT);
    f.set(x + 4, 101, OUT);
    if (i === 2) for (let y = 104; y < 125; y += 3) f.hline(x, x + 8, y, PAL.red[3]);
  });
  // flea-market table (front, left)
  shadow(b, 44, 150, 38, 4);
  f.rect(12, 128, 3, 22, PAL.wood[2]);
  f.rect(72, 128, 3, 22, PAL.wood[2]);
  box(f, 8, 120, 70, 10, 5, PAL.cream, PAL.wood);
  paper(f, 10, 132, 34, 9, hex('#f4e0b0'));
  f.text('KIRPPIS', 13, 134, PAL.red[2]);
  // knick-knacks
  const vase = new Mask(W, H).ellipse(18, 116, 3.5, 4.5).rect(16, 109, 4, 3);
  vase.paint(f, PAL.teal);
  vase.outlineOn(f, OUT);
  const lamp = new Mask(W, H).tri(28, 108, 38, 108, 33, 101);
  lamp.paint(f, PAL.yellow);
  lamp.outlineOn(f, OUT);
  f.rect(32, 109, 2, 10, PAL.darkWood[1]);
  f.rect(29, 118, 8, 2, PAL.darkWood[2]);
  // records
  for (let i = 0; i < 3; i++) {
    box(f, 42 + i * 3, 108 + i, 12, 12, 0, [PAL.red, PAL.blue, PAL.cream][i], [PAL.red, PAL.blue, PAL.cream][i]);
  }
  const tp = new Mask(W, H).ellipse(68, 116, 5, 3.5).rect(66, 111, 4, 2);
  tp.paint(f, PAL.white);
  tp.outlineOn(f, OUT);
  f.line(73, 115, 76, 112, OUT);
  return s;
}

// ------------------------------------------------------------------ 7. health centre
export function healthCentre(): Scene {
  const r = rng(707);
  const s = newScene([116, 38]);
  const b = s.back;
  const fy = 96;
  roomBox(b, {
    floorY: fy,
    wall: (img) => {
      wallpaper(img, 0, 0, W - 1, 58, hex('#e8f0f6'), hex('#dce6f0'), 'none');
      // mint tiles
      for (let y = 58; y <= fy; y++)
        for (let x = 0; x < W; x++) {
          const g = (x % 10 === 0 || (y - 58) % 10 === 0) as boolean;
          img.set(x, y, g ? hex('#9ac8b8') : (y - 58) % 10 === 1 || x % 10 === 1 ? hex('#d8f4ea') : hex('#b8e2d4'));
        }
      img.hline(0, W - 1, 57, hex('#6aa494'));
      ceiling(img, 5, ramp('#ffffff', '#e4eaf0', '#bcc4d4', '#8a90a8'));
    },
    floor: (img) => floorTiles(img, fy, hex('#c8d8d4'), hex('#e4ece8'), hex('#9ab0b0'), 18),
    skirt: ramp('#9ac8b8', '#6aa494', '#4a7a74'),
  });
  b.rect(70, 6, 70, 2, hex('#ffffff'));
  // poster with a heart
  paper(b, 18, 14, 32, 40, hex('#fffbf0'), PAL.blue[1]);
  const heart = new Mask(W, H).disc(30, 24, 4).disc(37, 24, 4).tri(26, 26, 41, 26, 33.5, 35);
  heart.paint(b, PAL.red);
  heart.outlineOn(b, OUT);
  b.text('TERVE', 24, 40, PAL.blue[3]);
  lines(b, 22, 47, 24, 3, hex('#9aa4c0'), r);
  // eye chart
  paper(b, 196, 12, 30, 44, hex('#ffffff'));
  b.text('E', 210, 15, OUT);
  b.text('F P', 206, 23, OUT);
  b.text('T O Z', 202, 31, OUT);
  b.text('LPED', 203, 39, OUT);
  b.text('PECFD', 201, 47, mix(OUT, hex('#ffffff'), 0.3));
  // number display + take-a-number machine
  box(b, 62, 18, 26, 14, 0, PAL.black, PAL.black);
  b.rect(64, 20, 22, 10, hex('#1a1020'));
  bigText(b, '12', 66, 21, hex('#ff5a3a'), 2);
  shadowRect(b, 190, 106, 14, 4);
  b.rect(196, 74, 3, 32, PAL.steel[2]);
  b.frame(195, 73, 5, 34, OUT);
  const tk = new Mask(W, H).ellipse(197, 70, 8, 6);
  tk.paint(b, PAL.red, { split: 201 });
  tk.outlineOn(b, OUT);
  b.rect(194, 68, 8, 3, hex('#ffffff'));
  b.rect(196, 63, 3, 5, hex('#fff4d0'));
  b.frame(195, 62, 5, 6, OUT);
  // waiting chairs
  for (let i = 0; i < 3; i++) {
    const x = 16 + i * 18;
    shadow(b, x + 8, 108, 9, 2);
    b.rect(x + 2, 96, 2, 12, PAL.steel[2]);
    b.rect(x + 12, 96, 2, 12, PAL.steel[2]);
    box(b, x, 70, 16, 18, 0, PAL.blue, PAL.blue);
    box(b, x, 88, 16, 8, 4, PAL.blue, PAL.blue);
  }
  b.rect(16, 96, 52, 2, PAL.steel[1]);
  paper(b, 37, 83, 8, 5, hex('#f8e8a0'));
  // plant
  plant(b, 226, 120, 24, rng(8), 'monstera', PAL.white);
  // front: reception counter
  const f = s.front;
  counter(s, 70, 70, 118, 40, 8, ramp('#fff4dc', '#f0dcb4', '#d0b48a', '#9a8068'), PAL.white, 0);
  f.rect(74, 82, 110, 4, PAL.teal[1]);
  f.hline(74, 183, 82, PAL.teal[0]);
  // plus sign plaque
  const pq = new Mask(W, H).disc(129, 98, 6);
  pq.paint(f, PAL.white);
  pq.outlineOn(f, PAL.teal[3]);
  f.rect(128, 94, 3, 9, PAL.teal[1]);
  f.rect(125, 97, 9, 3, PAL.teal[1]);
  // monitor + hand sanitizer + papers
  box(f, 156, 52, 24, 18, 0, PAL.black, PAL.black);
  f.rect(158, 54, 20, 13, hex('#d8f0ff'));
  for (let i = 0; i < 3; i++) f.hline(160, 172 - i * 3, 57 + i * 3, hex('#6a8ab0'));
  f.rect(166, 70, 4, 2, PAL.black[1]);
  box(f, 78, 62, 6, 9, 0, PAL.white, PAL.white);
  f.rect(79, 59, 4, 3, PAL.teal[1]);
  paper(f, 92, 71, 14, 5, hex('#ffffff'));
  return s;
}

// ------------------------------------------------------------------ 8. little red cottage
function viewApple(v: Img) {
  const r = rng(88);
  skyBands(v, ramp('#7cc0ec', '#9ad0f2', '#c0e4f4'), 0, v.h);
  cloud(v, 26, 5, 3, hex('#ffffff'), hex('#dceef8'));
  treeLine(v, v.h - 10, hex('#4c8a64'), r, 3);
  v.rect(0, v.h - 8, v.w, 8, hex('#7ac05a'));
  v.hline(0, v.w - 1, v.h - 8, hex('#a8dc78'));
  v.rect(14, 14, 3, v.h - 20, PAL.darkWood[1]);
  const m = new Mask(v.w, v.h).ellipse(15, 12, 13, 9).ellipse(8, 15, 7, 5).ellipse(23, 15, 7, 5);
  m.paint(v, PAL.leaf, { split: 20 });
  for (const [x, y] of [[8, 10], [14, 15], [20, 9], [25, 14], [11, 17], [18, 13], [4, 15]] as const) {
    v.set(x, y, hex('#e8303a'));
    v.set(x + 1, y, hex('#a01e32'));
    v.set(x, y - 1, hex('#ff8a80'));
  }
  birch(v, v.w - 6, 2, v.h - 6, PAL.leaf, r);
}

export function cottage(): Scene {
  const r = rng(808);
  const s = newScene([120, 38]);
  const b = s.back;
  const fy = 96;
  roomBox(b, {
    floorY: fy,
    wall: (img) => wallLogs(img, 0, 0, W - 1, fy, PAL.log, 10, r),
    floor: (img) => floorPlanks(img, fy, PAL.pine, r),
    corner: hex('#46242c'),
  });
  // corner log ends
  for (let y = 4; y < fy; y += 10) {
    for (const x of [12, W - 13]) {
      const m = new Mask(W, H).disc(x, y + 1, 4.5);
      m.paint(b, ramp('#ffe0a8', '#f0c080', '#c89058', '#8e5a3e'));
      m.outlineOn(b, PAL.log[4]);
      b.set(x, y + 1, PAL.log[3]);
    }
  }
  // window with the apple tree
  windowFrame(b, 26, 16, 40, 40, PAL.white, viewApple, { cols: 2, rows: 2, sill: PAL.white, curtain: ramp('#ffffff', '#f4f0f4', '#d0c8d8', '#a09ab4') });
  lightBeam(b, 34, fy + 2, 30, 26, 22, hex('#fff4c0', 38));
  // plate shelf
  b.rect(76, 30, 30, 3, PAL.darkWood[1]);
  b.hline(76, 105, 30, PAL.darkWood[0]);
  b.frame(75, 29, 32, 5, OUT);
  for (let i = 0; i < 3; i++) {
    const m = new Mask(W, H).disc(81 + i * 10, 24, 4.5);
    m.paint(b, PAL.white);
    m.outlineOn(b, OUT);
    b.disc(81 + i * 10, 24, 2, [PAL.blue[1], PAL.red[1], PAL.blue[1]][i]);
  }
  // embroidered "KOTI" picture
  frameArt(b, 80, 40, 22, 14, PAL.darkWood, (v) => {
    v.rect(0, 0, v.w, v.h, hex('#fbf6e6'));
    v.text('KOTI', 1, 2, PAL.red[2]);
    for (let x = 0; x < v.w; x += 2) v.set(x, v.h - 2, PAL.green[2]);
  });
  // fireplace (white plastered takka)
  const fx = 184;
  shadowRect(b, fx - 4, fy + 4, 58, 5);
  box(b, fx + 12, 0, 26, 30, 0, PAL.white, PAL.white);
  box(b, fx, 30, 50, 68, 4, PAL.white, PAL.white);
  const opening = new Mask(W, H).rect(fx + 10, 60, 30, 30).ellipse(fx + 25, 60, 15, 8);
  opening.paint(b, PAL.brick);
  opening.outlineOn(b, OUT);
  const fire = new Mask(W, H).rect(fx + 13, 68, 24, 20).ellipse(fx + 25, 68, 12, 7);
  fire.fill(b, hex('#3a1e2a'));
  const flame = new Mask(W, H).tri(fx + 15, 88, fx + 21, 88, fx + 18, 70).tri(fx + 20, 88, fx + 30, 88, fx + 25, 66).tri(fx + 28, 88, fx + 35, 88, fx + 32, 73);
  flame.paint(b, ramp('#fff8b0', '#ffd050', '#f08a3a', '#c84a2e'), { split: fx + 31 });
  b.rect(fx + 14, 86, 22, 3, PAL.darkWood[2]);
  b.hline(fx + 14, fx + 35, 86, PAL.orange[1]);
  // glow on the floor
  shadow(b, fx + 25, fy + 14, 30, 8, 0);
  for (let y = fy + 6; y < fy + 24; y++) for (let x = fx - 6; x < fx + 56; x++) if (((x - fx - 25) / 32) ** 2 + ((y - fy - 10) / 12) ** 2 < 1) b.set(x, y, hex('#ffb050', 28));
  // firewood stack
  for (let i = 0; i < 6; i++) {
    const m = new Mask(W, H).disc(fx - 10 + (i % 3) * 6 - (i > 2 ? -3 : 0), 92 - Math.floor(i / 3) * 6, 3);
    m.paint(b, ramp('#ffe0a8', '#e8b878', '#b88050', '#7a5038'));
    m.outlineOn(b, OUT);
  }
  // rocking chair
  const rc = PAL.darkWood;
  shadow(b, 40, 134, 22, 4);
  b.line(16, 128, 64, 136, rc[1], 2);
  b.line(16, 129, 64, 137, OUT);
  for (const x of [22, 56]) {
    b.rect(x, 96, 3, 36, rc[1]);
    b.vline(x, 96, 131, rc[0]);
    b.frame(x - 1, 95, 5, 38, OUT);
  }
  for (let i = 0; i < 4; i++) b.rect(26 + i * 8, 98, 3, 18, rc[1]);
  b.rect(22, 94, 37, 4, rc[1]);
  b.hline(22, 58, 94, rc[0]);
  b.frame(21, 93, 39, 6, OUT);
  box(b, 20, 116, 41, 6, 3, ramp('#f8b0a0', '#e07060', '#b04a4a', '#7a3040'), rc);
  // front: little round table with a lace cloth, coffee pot and cups
  const f = s.front;
  shadow(b, 136, 118, 36, 5);
  f.rect(133, 82, 6, 34, PAL.darkWood[1]);
  f.frame(132, 82, 8, 35, OUT);
  f.rect(124, 114, 24, 3, PAL.darkWood[2]);
  // lace cloth drape hanging over the edge (hides the host's legs)
  const drape = new Mask(W, H).rect(97, 74, 79, 14).ellipse(136, 88, 39, 5);
  for (let x = 99; x < 175; x += 5) drape.disc(x + 2, 92 - Math.round(((x - 136) / 40) ** 2 * 4), 2.5);
  drape.paint(f, PAL.white, { split: 160 });
  drape.outlineOn(f, OUT);
  for (let x = 101; x < 173; x += 5) {
    const yb = 89 - Math.round(((x - 136) / 40) ** 2 * 4);
    f.set(x + 2, yb, PAL.white[2]);
    f.vline(x, 80, yb - 3, x < 150 ? PAL.white[1] : PAL.white[2]);
  }
  const top = new Mask(W, H).ellipse(136, 74, 40, 7);
  top.paint(f, PAL.white);
  top.outlineOn(f, OUT);
  for (let x = 98; x <= 174; x += 3) {
    f.set(x, 80 + Math.round(Math.abs(x - 136) < 36 ? 1 : 0), PAL.white[1]);
  }
  for (let x = 100; x < 172; x += 6) f.set(x, 74, PAL.white[2]);
  // coffee pot
  const cp = new Mask(W, H).tri(150, 74, 162, 74, 158, 60).tri(150, 74, 154, 60, 158, 60);
  cp.paint(f, PAL.red, { split: 158 });
  cp.outlineOn(f, OUT);
  f.rect(153, 58, 6, 2, PAL.red[3]);
  f.line(162, 72, 165, 64, OUT);
  f.line(149, 64, 146, 61, PAL.red[2]);
  steam(f, 146, 57, 3);
  for (const cx of [112, 126]) {
    f.rect(cx, 69, 6, 4, PAL.white[1]);
    f.hline(cx, cx + 5, 69, PAL.blue[1]);
    f.frame(cx - 1, 68, 8, 6, OUT);
    f.hline(cx - 2, cx + 7, 74, PAL.white[2]);
  }
  return s;
}
