/**
 * Contract between the art modules and tools/gen-art.ts (which writes the PNGs and
 * public/themes/ryttyla/theme.json). Nothing in the game logic depends on this;
 * the browser only reads theme.json + PNGs (see src/ui/theme.ts).
 */
import type { Img } from '../raster';

/** Every location id in content/locations, with the map node it sits on. */
export const LOCATIONS = [
  'parents_house', 'job_centre', 'station', 'bank', 'sawmill', 'department_store', 'health_centre',
  'cottage', 'sauna', 'village_shop', 'grill', 'rental_flat', 'opisto', 'library', 'dance_pavilion',
] as const;
export type LocationId = (typeof LOCATIONS)[number];

/** Map graph (from content/map.json). Positions are free; the topology is fixed. */
export const NODE_IDS = [
  'parents_house', 'job_centre', 'station', 'bank', 'sawmill', 'department_store', 'health_centre', 'cottage',
  'sauna', 'village_shop', 'grill', 'rental_flat', 'opisto', 'library', 'crossroads',
] as const;
export const EDGES: [string, string][] = [
  ['parents_house', 'job_centre'], ['job_centre', 'station'], ['station', 'bank'], ['bank', 'sawmill'],
  ['sawmill', 'department_store'], ['department_store', 'health_centre'], ['health_centre', 'cottage'],
  ['cottage', 'sauna'], ['sauna', 'village_shop'], ['village_shop', 'grill'], ['grill', 'rental_flat'],
  ['rental_flat', 'opisto'], ['opisto', 'library'], ['library', 'parents_house'],
  ['station', 'crossroads'], ['crossroads', 'village_shop'],
];
/** location id -> node id (all equal except the dance pavilion). */
export const LOCATION_NODE: Record<LocationId, string> = {
  parents_house: 'parents_house', job_centre: 'job_centre', station: 'station', bank: 'bank', sawmill: 'sawmill',
  department_store: 'department_store', health_centre: 'health_centre', cottage: 'cottage', sauna: 'sauna',
  village_shop: 'village_shop', grill: 'grill', rental_flat: 'rental_flat', opisto: 'opisto', library: 'library',
  dance_pavilion: 'crossroads',
};

/** A horizontal strip of equally sized frames. */
export interface Sheet {
  img: Img;
  frameWidth: number;
  frameHeight: number;
}

/** Animated decoration on the map (water sparkle, chimney smoke, flags...). */
export interface Overlay {
  sheet: Sheet;
  x: number;
  y: number;
  /** Frames per second (default 4). */
  fps?: number;
  /** Draw above buildings and the player (e.g. tree canopies). Default false. */
  above?: boolean;
}

/** Output of tools/art/map.ts */
export interface MapArt {
  width: 640;
  height: 360;
  background: Img;
  /** Optional full-size layer drawn above everything (canopies, etc.). Transparent elsewhere. */
  foreground?: Img;
  nodes: Record<string, [number, number]>;
  /** One per location id. x, y = top-left on the map. Clickable where opaque. */
  buildings: Record<LocationId, { img: Img; x: number; y: number }>;
  overlays: Overlay[];
  /**
   * Player sheet: frames in one strip. Magenta #ff00ff = shirt, #c000c0 = shirt shade
   * (tinted per player at runtime). directions = frame indices per walking direction;
   * frame 0 of "down" is the standing pose.
   */
  player: Sheet & { directions: { down: number[]; up: number[]; left: number[]; right: number[] } };
}

export type HostAnim = 'idle' | 'talk' | 'happy' | 'annoyed';

/** Output of tools/art/rooms.ts */
export interface RoomsArt {
  /** Size of every interior image. */
  width: number;
  height: number;
  rooms: Record<
    LocationId,
    {
      /** Room background. */
      back: Img;
      /** Optional layer drawn ABOVE the host (counter, table...). Same size as back, transparent elsewhere. */
      front?: Img;
      host: {
        sheet: Sheet;
        /** Top-left of the host frame inside the interior. */
        x: number;
        y: number;
        /** Frame indices per animation. idle should include a blink; talk alternates mouth open/closed. */
        anims: Record<HostAnim, number[]>;
      };
    }
  >;
}
