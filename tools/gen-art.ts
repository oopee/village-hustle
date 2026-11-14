/**
 * npm run art — generates the "Ryttylä" pixel-art theme into public/themes/ryttyla/
 * (PNG files + theme.json).
 *
 *   tools/art/map.ts    map background, buildings, animated overlays, player sprite
 *   tools/art/rooms.ts  interiors and the owner ("host") of every location
 *   tools/art/types.ts  the contract between the two and this file
 *
 * Artists can replace any PNG by hand and edit theme.json; nothing in the game
 * logic depends on these files.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Img } from './raster';
import { buildMap } from './art/map';
import { buildRooms } from './art/rooms';
import { LOCATIONS } from './art/types';

const OUT = resolve(import.meta.dirname, '../public/themes/ryttyla');

function save(rel: string, img: Img) {
  const file = join(OUT, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, img.toPNG());
  return rel;
}

const map = buildMap();
const rooms = buildRooms();

// Only the generated art is replaced; hand-made files (audio.json, audio/) are kept.
for (const dir of ['buildings', 'interiors', 'hosts', 'overlays']) rmSync(join(OUT, dir), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const locations: Record<string, unknown> = {};
for (const id of LOCATIONS) {
  const b = map.buildings[id];
  const r = rooms.rooms[id];
  locations[id] = {
    sprite: save(`buildings/${id}.png`, b.img),
    x: b.x,
    y: b.y,
    interior: save(`interiors/${id}.png`, r.back),
    interiorFront: r.front ? save(`interiors/${id}-front.png`, r.front) : undefined,
    host: {
      sprite: save(`hosts/${id}.png`, r.host.sheet.img),
      frameWidth: r.host.sheet.frameWidth,
      frameHeight: r.host.sheet.frameHeight,
      x: r.host.x,
      y: r.host.y,
      anims: r.host.anims,
    },
  };
}

const overlays = map.overlays.map((o, i) => ({
  sprite: save(`overlays/${i}.png`, o.sheet.img),
  frameWidth: o.sheet.frameWidth,
  frameHeight: o.sheet.frameHeight,
  frames: Math.max(1, Math.floor(o.sheet.img.w / o.sheet.frameWidth)),
  x: o.x,
  y: o.y,
  fps: o.fps ?? 4,
  above: o.above ?? false,
}));

const theme = {
  name: 'Ryttylä (16-bit placeholder)',
  width: map.width,
  height: map.height,
  background: save('background.png', map.background),
  foreground: map.foreground ? save('foreground.png', map.foreground) : undefined,
  nodes: map.nodes,
  locations,
  interiorSize: [rooms.width, rooms.height],
  overlays,
  player: {
    sprite: save('player.png', map.player.img),
    frameWidth: map.player.frameWidth,
    frameHeight: map.player.frameHeight,
    frames: Math.floor(map.player.img.w / map.player.frameWidth),
    tintKey: '#ff00ff',
    tintShadeKey: '#c000c0',
    directions: map.player.directions,
  },
  playerColors: ['#d83a3a', '#2f6fd6', '#f2c230', '#2fa85a', '#9b4fd1', '#f08a2c', '#20b5b0', '#e85fa8'],
  playerColorNames: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Teal', 'Pink'],
  ui: {
    font: 'VT323',
    panel: '#f3ead2',
    panelDark: '#e2d6b5',
    border: '#3a2a1e',
    text: '#2a1d14',
    muted: '#7a6650',
    accent: '#9e2f22',
    good: '#2f7d3a',
    bad: '#b0302a',
    highlight: '#ffe27a',
  },
};
writeFileSync(join(OUT, 'theme.json'), JSON.stringify(theme, null, 2));
console.log(`Theme written to ${OUT}`);
