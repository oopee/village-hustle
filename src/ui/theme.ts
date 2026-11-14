/**
 * Themes are pure presentation: public/themes/<id>/theme.json + images.
 * The game logic never reads anything from here. A theme maps logical map nodes
 * and location ids (from /content) to pixel positions and sprites.
 */

export type HostAnim = 'idle' | 'talk' | 'happy' | 'annoyed';
export type Direction = 'down' | 'up' | 'left' | 'right';

export interface HostDef {
  sprite: string;
  frameWidth: number;
  frameHeight: number;
  /** Top-left of the host frame inside the interior image. */
  x: number;
  y: number;
  /** Frame indices per animation. Missing animations fall back to idle. */
  anims: Partial<Record<HostAnim, number[]>>;
}

/** A regular who hangs around an interior (drawn like a host, without owning the place). */
export interface ExtraDef extends HostDef {
  /** The content id it belongs to: the action done with them, and the location's pokes key. */
  id: string;
  /** Mirror horizontally. */
  flip?: boolean;
  /** Drawn above the interiorFront layer (e.g. sitting in front of a counter). */
  front?: boolean;
}

/** A piece of furniture shown in the player's own home when they own the item of that id. */
export interface FurnitureDef {
  sprite: string;
  x: number;
  y: number;
  /** Drawn above the interiorFront layer. */
  front?: boolean;
}

/** A clickable hit area in an interior (the content location's pokes say what happens). */
export interface PropDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LocationArt {
  sprite?: string;
  x: number;
  y: number;
  interior?: string;
  interiorFront?: string;
  host?: HostDef;
  extras?: ExtraDef[];
  furniture?: Record<string, FurnitureDef>;
  props?: PropDef[];
}

export interface ThemeDef {
  name: string;
  width: number;
  height: number;
  background: string;
  /** Optional layer drawn above buildings and the player. */
  foreground?: string;
  nodes: Record<string, [number, number]>;
  locations: Record<string, LocationArt>;
  /** Pixel size of the interior images (default 200x120). */
  interiorSize?: [number, number];
  /** Animated map decorations (horizontal frame strips). */
  overlays?: { sprite: string; x: number; y: number; frameWidth: number; frameHeight: number; frames: number; fps?: number; above?: boolean }[];
  player: {
    sprite: string;
    frameWidth: number;
    frameHeight: number;
    frames: number;
    tintKey: string;
    tintShadeKey?: string;
    /** Walk cycle frame indices per direction; [0] is the standing pose. Without it, frames are mirrored for left/right. */
    directions?: Record<Direction, number[]>;
  };
  playerColors: string[];
  playerColorNames?: string[];
  ui?: Record<string, string>;
}

export interface HostArt {
  def: HostDef;
  sheet: HTMLImageElement;
}

export interface ExtraArt {
  def: ExtraDef;
  sheet: HTMLImageElement;
}

export interface FurnitureArt {
  def: FurnitureDef;
  img: HTMLImageElement;
}

export interface OverlayArt {
  img: HTMLImageElement;
  x: number;
  y: number;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;
  above: boolean;
}

export interface BuildingSprite {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  img: HTMLCanvasElement;
  hover: HTMLCanvasElement;
  alpha: Uint8ClampedArray;
}

export interface Theme {
  def: ThemeDef;
  base: string;
  background: HTMLImageElement;
  foreground: HTMLImageElement | null;
  buildings: Map<string, BuildingSprite>;
  interiors: Map<string, string>;
  interiorFronts: Map<string, string>;
  interiorSize: [number, number];
  hosts: Map<string, HostArt>;
  /** Per location id. */
  extras: Map<string, ExtraArt[]>;
  /** Per location id, then item id. */
  furniture: Map<string, Map<string, FurnitureArt>>;
  props: Map<string, PropDef[]>;
  overlays: OverlayArt[];
  /** [colorIndex][frame] */
  playerFrames: HTMLCanvasElement[][];
  warnings: string[];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image ${url}`));
    img.src = url;
  });
}

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function parseHex(s: string): [number, number, number] {
  const v = s.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/** Builds a highlighted copy of a sprite: edge pixels become the highlight color. */
function makeHover(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const [c, ctx] = canvasOf(src.width + 2, src.height + 2);
  const sctx = src.getContext('2d')!;
  const data = sctx.getImageData(0, 0, src.width, src.height).data;
  const [r, g, b] = parseHex(color);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= src.width || y >= src.height ? 0 : data[(y * src.width + x) * 4 + 3]);
  const out = ctx.createImageData(c.width, c.height);
  for (let y = -1; y <= src.height; y++)
    for (let x = -1; x <= src.width; x++) {
      if (a(x, y)) continue;
      if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) {
        const i = ((y + 1) * c.width + (x + 1)) * 4;
        out.data[i] = r;
        out.data[i + 1] = g;
        out.data[i + 2] = b;
        out.data[i + 3] = 255;
      }
    }
  ctx.putImageData(out, 0, 0);
  ctx.drawImage(src, 1, 1);
  return c;
}

function tintFrames(sheet: HTMLImageElement, def: ThemeDef['player'], color: string): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = [];
  const key = parseHex(def.tintKey);
  const shadeKey = def.tintShadeKey ? parseHex(def.tintShadeKey) : null;
  const [r, g, b] = parseHex(color);
  for (let f = 0; f < def.frames; f++) {
    const [c, ctx] = canvasOf(def.frameWidth, def.frameHeight);
    ctx.drawImage(sheet, f * def.frameWidth, 0, def.frameWidth, def.frameHeight, 0, 0, def.frameWidth, def.frameHeight);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const isKey = d[i] === key[0] && d[i + 1] === key[1] && d[i + 2] === key[2];
      const isShade = shadeKey && d[i] === shadeKey[0] && d[i + 1] === shadeKey[1] && d[i + 2] === shadeKey[2];
      if (isKey || isShade) {
        const k = isShade ? 0.72 : 1;
        d[i] = Math.round(r * k);
        d[i + 1] = Math.round(g * k);
        d[i + 2] = Math.round(b * k);
      }
    }
    ctx.putImageData(img, 0, 0);
    frames.push(c);
  }
  return frames;
}

export async function loadTheme(id: string, locationIds: string[], nodeIds: string[]): Promise<Theme> {
  const base = `themes/${id}/`;
  const res = await fetch(`${base}theme.json`);
  if (!res.ok) throw new Error(`Theme '${id}' not found (themes/${id}/theme.json).`);
  const def = (await res.json()) as ThemeDef;
  const warnings: string[] = [];
  const highlight = def.ui?.highlight ?? '#ffe27a';

  const [background, playerSheet, foreground] = await Promise.all([
    loadImage(base + def.background),
    loadImage(base + def.player.sprite),
    def.foreground ? loadImage(base + def.foreground).catch((e: Error) => (warnings.push(e.message), null)) : Promise.resolve(null),
  ]);

  const buildings = new Map<string, BuildingSprite>();
  const interiors = new Map<string, string>();
  const interiorFronts = new Map<string, string>();
  const hosts = new Map<string, HostArt>();
  const extras = new Map<string, ExtraArt[]>();
  const furniture = new Map<string, Map<string, FurnitureArt>>();
  const props = new Map<string, PropDef[]>();
  // Indexed so the draw order follows theme.json regardless of load order.
  const overlaySlots: (OverlayArt | null)[] = (def.overlays ?? []).map(() => null);
  await Promise.all([
    ...(def.overlays ?? []).map(async (o, i) => {
      try {
        const img = await loadImage(base + o.sprite);
        overlaySlots[i] = ({ img, x: o.x, y: o.y, frameWidth: o.frameWidth, frameHeight: o.frameHeight, frames: Math.max(1, o.frames), fps: o.fps ?? 4, above: !!o.above });
      } catch (e) {
        warnings.push((e as Error).message);
      }
    }),
    ...Object.entries(def.locations).map(async ([locId, l]) => {
      if (l.interior) interiors.set(locId, base + l.interior);
      if (l.interiorFront) interiorFronts.set(locId, base + l.interiorFront);
      if (l.host) {
        try {
          hosts.set(locId, { def: l.host, sheet: await loadImage(base + l.host.sprite) });
        } catch (e) {
          warnings.push((e as Error).message);
        }
      }
      if (l.props?.length) props.set(locId, l.props);
      if (l.extras?.length) {
        const list = await Promise.all(
          l.extras.map((x) => loadImage(base + x.sprite).then((sheet) => ({ def: x, sheet }), (e: Error) => (warnings.push(e.message), null))),
        );
        extras.set(locId, list.filter((x): x is ExtraArt => !!x));
      }
      if (l.furniture) {
        const m = new Map<string, FurnitureArt>();
        await Promise.all(
          Object.entries(l.furniture).map(([item, f]) =>
            loadImage(base + f.sprite).then((img) => void m.set(item, { def: f, img }), (e: Error) => void warnings.push(e.message)),
          ),
        );
        furniture.set(locId, m);
      }
      if (!l.sprite) return;
      try {
        const img = await loadImage(base + l.sprite);
        const [c, ctx] = canvasOf(img.width, img.height);
        ctx.drawImage(img, 0, 0);
        const alpha = ctx.getImageData(0, 0, img.width, img.height).data;
        buildings.set(locId, { id: locId, x: l.x, y: l.y, w: img.width, h: img.height, img: c, hover: makeHover(c, highlight), alpha });
      } catch (e) {
        warnings.push((e as Error).message);
      }
    }),
  ]);

  for (const n of nodeIds) if (!def.nodes[n]) warnings.push(`Theme has no position for map node '${n}'.`);
  for (const l of locationIds) if (!def.locations[l]) warnings.push(`Theme has no building for location '${l}' (a signpost is drawn instead).`);

  const playerFrames = def.playerColors.map((c) => tintFrames(playerSheet, def.player, c));
  for (const [k, v] of Object.entries(def.ui ?? {})) document.documentElement.style.setProperty(`--${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, v);
  const overlays = overlaySlots.filter((o): o is OverlayArt => !!o);
  const interiorSize = def.interiorSize ?? [200, 120];
  document.documentElement.style.setProperty('--interior-w', `${interiorSize[0]}px`);
  document.documentElement.style.setProperty('--interior-h', `${interiorSize[1]}px`);
  return { def, base, background, foreground, buildings, interiors, interiorFronts, interiorSize, hosts, extras, furniture, props, overlays, playerFrames, warnings };
}
