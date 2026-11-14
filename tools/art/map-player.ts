/**
 * Chibi player sprite, 16x24 per frame, 12 frames:
 *   0-2 down (stand, step A, step B), 3-5 up, 6-8 left, 9-11 right (mirrored left).
 * Shirt pixels are exactly #ff00ff (lit) and #c000c0 (shade) for runtime tinting.
 */
import { Img, hex, type RGBA } from '../raster';
import { OUT, R, flipX, grid, mix } from './map-kit';

export const PW = 16;
export const PH = 24;

const L: Record<string, RGBA> = {
  o: OUT,
  h: R.hair[2],
  H: R.hair[3],
  d: R.hair[1],
  s: R.skin[3],
  S: R.skin[2],
  e: hex('#2b1d3a'),
  r: mix(R.skin[3], hex('#f07a8a'), 0.45),
  q: R.skin[1],
  M: hex('#ff00ff'),
  m: hex('#c000c0'),
  p: R.denim[2],
  P: R.denim[1],
  b: R.hair[1],
  B: R.hair[3],
};

const FRONT_HEAD = [
  '................',
  '.....oooooo.....',
  '...ooHHHhhhoo...',
  '..oHHHHhhhhhho..',
  '.ohHHhhhhhhhhdo.',
  '.ohHhhhhhhhhhdo.',
  '.ohhhhhhhhhhhdo.',
  '.ohhhsshhhshhdo.',
  '.ohhsssssssssdo.',
  '.ohssessssesSdo.',
  '.ohssessssesSdo.',
  '.odsrssqqssrSdo.',
  '..oSsssssssSSo..',
];
const BACK_HEAD = [
  '................',
  '.....oooooo.....',
  '...ooHHHhhhoo...',
  '..oHHHHhhhhhho..',
  '.ohHHhhhhhhhhdo.',
  '.ohHhhhhhhhhhdo.',
  '.ohhhhhhhhhhhdo.',
  '.ohhhhhhhhhhhdo.',
  '.ohhhhhhhhhhhdo.',
  '.ohhhhhhhhhhddo.',
  '.odhhhhhhhhhddo.',
  '.oSdhhhhhhhhdSo.',
  '..odddhhhhdddo..',
];
const FRONT_BODY = [
  '....oMMssMmo....',
  '..ooMMMMMMmmoo..',
  '.oMMMMMMMMMmmmo.',
  '.oMoMMMMMMmmomo.',
  '.oMoMMMMMMmmomo.',
  '.osommmmmmmmoSo.',
  '..oopppppPPPoo..',
];
const BACK_BODY = ['....oSSSSSSo....', ...FRONT_BODY.slice(1)];
const LEGS_STAND = ['...opppooPPPo...', '...opppooPPPo...', '...oBbbooBbbo...', '....ooo..ooo....'];
// step legs are one row shorter: the body bobs down a pixel while walking
const LEGS_A = ['...opppooBbbo...', '...oBbbo.ooo....', '....ooo.........'];
const LEGS_B = ['...oBbbooPPPo...', '....ooo.oBbbo...', '.........ooo....'];
const bob = (rows: string[]) => ['................', ...rows];

const SIDE = [
  '................',
  '.....oooooo.....',
  '....oHHhhhhoo...',
  '...oHHhhhhhhho..',
  '..oHhhhhhhhhhdo.',
  '..ohhhhhhhhhhdo.',
  '.ohhhhhhhhhhhdo.',
  '.ohhshhhhhhhhdo.',
  '.osssssShhhhhdo.',
  '.osesssShhhhhdo.',
  'ossesssShhhhhdo.',
  '.osrssssShhhddo.',
  '..osqsssSdddo...',
  '....ooSSSoo.....',
  '....oMMMMmmo....',
  '...oMMMMMMmmo...',
  '...oMMMMMmmmo...',
  '...oMMMmmmmmo...',
  '...oMMMsSmmmo...',
  '....oppppPPo....',
];
const SIDE_STAND = ['....opppPPo.....', '....opppPPo.....', '...oBbbbbbo.....', '...ooooooo......'];
const SIDE_A = ['..opppo.oPPPo...', '.oBbbo...obbo...', '.ooooo...oooo...'];
const SIDE_B = ['..oPPPo.opppo...', '.obbbo...oBbbo..', '.ooooo...ooooo..'];

function frame(rows: string[]): Img {
  const img = new Img(PW, PH);
  grid(img, 0, 0, rows, L);
  return img;
}

export function buildPlayer() {
  const frames: Img[] = [];
  const front = [...FRONT_HEAD, ...FRONT_BODY];
  const back = [...BACK_HEAD, ...BACK_BODY];
  frames.push(frame([...front, ...LEGS_STAND]));
  frames.push(frame(bob([...front, ...LEGS_A])));
  frames.push(frame(bob([...front, ...LEGS_B])));
  frames.push(frame([...back, ...LEGS_STAND]));
  frames.push(frame(bob([...back, ...LEGS_A])));
  frames.push(frame(bob([...back, ...LEGS_B])));
  const left = [frame([...SIDE, ...SIDE_STAND]), frame(bob([...SIDE, ...SIDE_A])), frame(bob([...SIDE, ...SIDE_B]))];
  frames.push(...left);
  frames.push(...left.map(flipX));
  const img = new Img(PW * frames.length, PH);
  frames.forEach((f, i) => img.blit(f, i * PW, 0));
  return {
    img,
    frameWidth: PW,
    frameHeight: PH,
    directions: { down: [0, 1, 0, 2], up: [3, 4, 3, 5], left: [6, 7, 6, 8], right: [9, 10, 9, 11] },
  };
}
