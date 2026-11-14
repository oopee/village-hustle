/**
 * Art preview for iterating on the generators without touching public/:
 *
 *   npx tsx tools/art/preview.ts map   <outDir>   -> map.png (2x) + player.png (6x)
 *   npx tsx tools/art/preview.ts rooms <outDir>   -> rooms.png (2x, every interior with
 *                                                  its host composited) + hosts.png (4x)
 *
 * Open the PNGs with an image viewer (or the Read tool) to check the result.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Img, hex } from '../raster';
import type { Sheet } from './types';

function scaled(src: Img, k: number): Img {
  const out = new Img(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) {
      const i = (Math.floor(y / k) * src.w + Math.floor(x / k)) * 4;
      const o = (y * out.w + x) * 4;
      for (let c = 0; c < 4; c++) out.data[o + c] = src.data[i + c];
    }
  return out;
}

function frameOf(s: Sheet, f: number): Img {
  const out = new Img(s.frameWidth, s.frameHeight);
  for (let y = 0; y < s.frameHeight; y++)
    for (let x = 0; x < s.frameWidth; x++) {
      const c = s.img.get(f * s.frameWidth + x, y);
      if (c[3]) out.set(x, y, c);
    }
  return out;
}

function onBg(src: Img, bg = hex('#3a3046')): Img {
  const out = new Img(src.w, src.h);
  out.rect(0, 0, src.w, src.h, bg);
  out.blit(src, 0, 0);
  return out;
}

const [what, dirArg] = process.argv.slice(2);
const dir = resolve(dirArg ?? '.art-preview');
mkdirSync(dir, { recursive: true });
const write = (name: string, img: Img) => {
  writeFileSync(join(dir, name), img.toPNG());
  console.log('wrote', join(dir, name));
};

if (what === 'map') {
  const { buildMap } = await import('./map');
  const m = buildMap();
  const img = new Img(m.width, m.height);
  img.blit(m.background, 0, 0);
  for (const o of m.overlays.filter((o) => !o.above)) img.blit(frameOf(o.sheet, 0), o.x, o.y);
  const sorted = Object.values(m.buildings).sort((a, b) => a.y + a.img.h - (b.y + b.img.h));
  for (const b of sorted) img.blit(b.img, b.x, b.y);
  // a few players standing on nodes
  const p = frameOf(m.player, m.player.directions.down[0]);
  for (const n of ['station', 'village_shop', 'crossroads']) {
    const [x, y] = m.nodes[n];
    img.blit(p, Math.round(x - p.w / 2), Math.round(y - p.h + 3));
  }
  for (const o of m.overlays.filter((o) => o.above)) img.blit(frameOf(o.sheet, 0), o.x, o.y);
  if (m.foreground) img.blit(m.foreground, 0, 0);
  // node markers
  for (const [x, y] of Object.values(m.nodes)) {
    img.set(x, y, hex('#ff0000'));
    img.set(x + 1, y, hex('#ff0000'));
  }
  write('map.png', scaled(img, 2));
  write('player.png', scaled(onBg(m.player.img), 6));
} else if (what === 'rooms') {
  const { buildRooms } = await import('./rooms');
  const r = buildRooms();
  const ids = Object.keys(r.rooms) as (keyof typeof r.rooms)[];
  const cols = 4;
  const sheet = new Img(cols * (r.width + 4), Math.ceil(ids.length / cols) * (r.height + 4));
  sheet.rect(0, 0, sheet.w, sheet.h, hex('#111111'));
  ids.forEach((id, i) => {
    const room = r.rooms[id];
    const c = new Img(r.width, r.height);
    c.blit(room.back, 0, 0);
    compose(c, room, false, true);
    sheet.blit(c, (i % cols) * (r.width + 4), Math.floor(i / cols) * (r.height + 4));
  });
  write('rooms.png', scaled(sheet, 2));
  // regulars
  const ex = ids.flatMap((id) => r.rooms[id].extras ?? []);
  if (ex.length) {
    const img = new Img(Math.max(...ex.map((e) => e.sheet.img.w)), ex.length * 50);
    ex.forEach((e, i) => img.blit(e.sheet.img, 0, i * 50));
    write('extras.png', scaled(onBg(img), 4));
  }
  const maxW = Math.max(...ids.map((id) => r.rooms[id].host.sheet.img.w));
  const rowH = Math.max(...ids.map((id) => r.rooms[id].host.sheet.frameHeight)) + 2;
  const hosts = new Img(maxW, rowH * ids.length);
  ids.forEach((id, i) => hosts.blit(r.rooms[id].host.sheet.img, 0, i * rowH));
  write('hosts.png', scaled(onBg(hosts), 4));
} else if (what === 'homes') {
  // every home with ALL furniture owned, in the browser's draw order, plus the empty version
  const { buildRooms } = await import('./rooms');
  const r = buildRooms();
  const ids = (Object.keys(r.rooms) as (keyof typeof r.rooms)[]).filter((id) => r.rooms[id].furniture);
  const sheet = new Img(2 * (r.width + 4), ids.length * (r.height + 4));
  sheet.rect(0, 0, sheet.w, sheet.h, hex('#111111'));
  ids.forEach((id, i) => {
    for (const full of [false, true]) {
      const c = new Img(r.width, r.height);
      compose(c, r.rooms[id], full);
      sheet.blit(c, (full ? 1 : 0) * (r.width + 4), i * (r.height + 4));
    }
  });
  write('homes.png', scaled(sheet, 3));
} else {
  console.log('usage: npx tsx tools/art/preview.ts map|rooms|homes <outDir>');
}

/** Same layer order as the browser: back, furniture, host, extras, front, front furniture/extras. */
function compose(c: Img, room: import('./types').RoomsArt['rooms'][import('./types').LocationId], furniture: boolean, props = furniture) {
  const furn = furniture ? Object.values(room.furniture ?? {}) : [];
  const extra = (front: boolean) => {
    for (const e of room.extras ?? []) {
      if (!!e.front !== front) continue;
      let f = frameOf(e.sheet, e.anims.idle[0]);
      if (e.flip) {
        const m = new Img(f.w, f.h);
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) m.set(f.w - 1 - x, y, f.get(x, y));
        f = m;
      }
      c.blit(f, e.x, e.y);
    }
  };
  c.blit(room.back, 0, 0);
  for (const f of furn) if (!f.front) c.blit(f.img, f.x, f.y);
  c.blit(frameOf(room.host.sheet, room.host.anims.idle[0]), room.host.x, room.host.y);
  extra(false);
  if (room.front) c.blit(room.front, 0, 0);
  for (const f of furn) if (f.front) c.blit(f.img, f.x, f.y);
  extra(true);
  // prop hit areas (preview only)
  if (props) for (const p of room.props ?? []) c.frame(p.x, p.y, p.w, p.h, hex('#ff00ff', 160));
}
