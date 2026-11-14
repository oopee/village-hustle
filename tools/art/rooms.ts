/**
 * Interiors + hosts for every location (16-bit JRPG-style, generated procedurally).
 *
 *   rooms-kit.ts       palette, masks with auto-shading, walls/floors/windows/props
 *   rooms-hosts.ts     chibi host sprites (32x48 frames) and their animation layout
 *   rooms-scenes-*.ts  one function per interior (back layer + front layer + host position)
 *
 * Every room is 256x160. The host frame is placed with its head (frame rows ~5-19) at
 * room y ~40-60, behind a counter/table drawn in the front layer.
 */
import type { LocationId, RoomsArt } from './types';
import { HOST_ANIMS, HOSTS, hostSheet } from './rooms-hosts';
import { H, W } from './rooms-kit';
import { bank, cottage, departmentStore, healthCentre, jobCentre, parentsHouse, sawmill, station, type Scene } from './rooms-scenes-a';
import { dancePavilion, grill, library, opisto, rentalFlat, sauna, villageShop } from './rooms-scenes-b';

const SCENES: Record<LocationId, [() => Scene, string]> = {
  parents_house: [parentsHouse, 'mom'],
  job_centre: [jobCentre, 'tarja'],
  station: [station, 'pertti'],
  bank: [bank, 'marjatta'],
  sawmill: [sawmill, 'masa'],
  department_store: [departmentStore, 'raimo'],
  health_centre: [healthCentre, 'sirpa'],
  cottage: [cottage, 'eila'],
  sauna: [sauna, 'kalevi'],
  village_shop: [villageShop, 'pirjo'],
  grill: [grill, 'rane'],
  rental_flat: [rentalFlat, 'leena'],
  opisto: [opisto, 'hannele'],
  library: [library, 'aili'],
  dance_pavilion: [dancePavilion, 'arvo'],
};

export function buildRooms(): RoomsArt {
  const rooms = {} as RoomsArt['rooms'];
  for (const id of Object.keys(SCENES) as LocationId[]) {
    const [scene, host] = SCENES[id];
    const s = scene();
    rooms[id] = {
      back: s.back,
      front: s.front,
      host: {
        sheet: hostSheet(HOSTS[host]),
        x: s.host[0],
        y: s.host[1],
        anims: { idle: [...HOST_ANIMS.idle], talk: [...HOST_ANIMS.talk], happy: [...HOST_ANIMS.happy], annoyed: [...HOST_ANIMS.annoyed] },
      },
    };
  }
  return { width: W, height: H, rooms };
}
