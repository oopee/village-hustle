/**
 * The village regulars (Pekki, Matti, Olli, Juho) as 32x48 host-style sprites. They are
 * drawn in the interiors where they hang out, next to the location's own host.
 * Same frame layout and animations as the hosts (see rooms-hosts.ts).
 */
import { hex } from '../raster';
import { EYE_BLUE, EYE_BROWN, SKIN, SKIN_ROSY, glasses, leftHold, paintHair, type HostSpec } from './rooms-hosts';
import { OUT, PAL, mix, ramp } from './rooms-kit';

const WHITE = hex('#ffffff');

export const REGULARS: Record<string, HostSpec> = {
  // Pekki: gloomy pub regular. Thinning combover, droopy eyes, stubble, drab jacket, a pint.
  pekki: {
    skin: ramp('#f8dcc8', '#e8bea0', '#c8927e', '#946070'),
    hair: ramp('#a89a80', '#7e705c', '#5a4e46', '#3e343a'),
    eye: hex('#46485a'),
    top: ramp('#9c9878', '#78745a', '#585642', '#3c3a32'),
    legs: ramp('#5a6680', '#424a64', '#2e3448'),
    shoes: ramp('#6a5a4a', '#4a3a34', '#2e2428'),
    bald: true,
    brow: hex('#5a4e46'),
    over: (c) => {
      // grey t-shirt with a stain, showing between the open jacket
      const ts = ramp('#d8d8dc', '#b4b4bc', '#8c8c9a');
      c.m().rect(13, 21, 6, 17 - c.b).paint(c.img, ts, { noHi: true });
      c.p(14, 28, hex('#c8a060'));
      c.p(15, 29, hex('#c8a060'));
      c.p(14, 29, hex('#a88050'));
      for (let y = 22; y < 38; y++) {
        c.p(12, y, c.s.top[2]);
        c.p(19, y, c.s.top[3]);
      }
      // sagging pockets
      c.p(10, 33, c.s.top[3]);
      c.p(11, 33, c.s.top[3]);
      c.p(20, 33, c.s.top[3]);
      c.p(21, 33, c.s.top[3]);
    },
    fringe: (c) => {
      // sides only, plus three brave strands combed over the top
      const m = c.m().rect(7, 9, 2, 7).rect(23, 9, 2, 7).span(8, 8, 9).span(8, 22, 23);
      paintHair(c, m, [], 23);
      const h = c.s.hair[2];
      for (let x = 9; x <= 20; x++) {
        if (x % 3 !== 0) c.p(x, 4 + Math.floor((x - 9) / 6), h);
        if (x % 4 !== 1) c.p(x + 1, 6 + Math.floor((x - 9) / 7), h);
      }
      c.p(21, 5, h);
      c.p(22, 6, h);
      return m;
    },
    beard: (c) => {
      // stubble
      const st = mix(c.s.skin[1], c.s.skin[2], 0.6);
      for (const [x, y] of [[11, 16], [13, 18], [16, 19], [19, 18], [20, 16]] as const) c.p(x, y, st);
    },
    acc: (c) => {
      const sk = c.s.skin;
      const mode = c.pose.brows ?? 'n';
      for (const [x0, right] of [[11, false], [19, true]] as const) {
        if (c.pose.eyes === 'open') {
          // heavy, droopy eyelids
          c.p(x0, 11, sk[2]);
          c.p(x0 + 1, 11, sk[2]);
          c.p(x0, 12, OUT);
          c.p(x0 + 1, 12, OUT);
          c.p(right ? x0 + 2 : x0 - 1, 12, mix(sk[2], OUT, 0.5));
        }
        // bags under the eyes
        if (c.pose.eyes !== 'happy') {
          c.p(x0, 14, sk[2]);
          c.p(x0 + 1, 14, sk[2]);
        }
        // permanently worried brows
        if (mode === 'n') {
          const inner = right ? x0 : x0 + 1;
          const outer = right ? x0 + 1 : x0;
          c.p(inner, 9, sk[1]);
          c.p(inner, 8, c.s.brow!);
          c.p(outer, 9, c.s.brow!);
        }
      }
    },
    prop: leftHold([13, 29], (c) => {
      // a pint of lager
      const g = c.m().rect(10, 23, 5, 8);
      g.paint(c.img, ramp('#ffe89a', '#f2c040', '#c8902e', '#8e5e2a'), { split: 14 });
      c.m().rect(10, 21, 5, 2).fill(c.img, hex('#fffbe8'));
      c.p(9, 22, hex('#fffbe8'));
      c.p(11, 25, WHITE);
      c.p(11, 26, hex('#fff4c0'));
      c.p(13, 27, hex('#fff4c0'));
    }),
  },

  // Matti: cheerful retired factory worker. Bib overalls over flannel, walrus moustache, coffee.
  matti: {
    skin: SKIN_ROSY,
    hair: ramp('#f4f4f8', '#cacad6', '#9c9ab0', '#6e6a86'),
    eye: EYE_BLUE,
    top: ramp('#f4907a', '#d24a3e', '#a03036', '#6a2030'),
    legs: ramp('#7aa0d8', '#4a70b0', '#344e88', '#24345e'),
    shoes: ramp('#a06a44', '#74442e', '#4e2e26'),
    bigNose: true,
    blush: true,
    happyArm: 'thumb',
    brow: hex('#b4b2c4'),
    over: (c) => {
      // flannel checks
      for (let y = 22; y < 38; y += 3) for (let x = c.L; x <= c.R; x++) c.p(x, y, c.s.top[2]);
      for (let x = c.L + 1; x <= c.R; x += 3) for (let y = 22; y < 38; y++) if (y % 3) c.p(x, y, mix(c.s.top[1], c.s.top[3], 0.4));
      // bib overalls + straps
      const ov = c.s.legs;
      const m = c.m().rect(11, 27, 10, 11 - c.b).rect(11, 21, 2, 6).rect(19, 21, 2, 6);
      m.paint(c.img, ov, { split: 20 });
      c.p(12, 27, hex('#f6d050'));
      c.p(19, 27, hex('#f6d050'));
      for (let x = 13; x <= 18; x++) c.p(x, 30, ov[2]);
      c.p(13, 31, ov[2]);
      c.p(18, 31, ov[2]);
      // pencil in the bib pocket
      c.p(16, 28, hex('#f6d050'));
      c.p(16, 29, hex('#f6d050'));
      c.p(16, 27, hex('#f4a0b0'));
    },
    fringe: (c) => {
      const m = c.m().ellipse(15.5, 8.6, 8.9, 6).rect(7, 8, 2, 6).rect(23, 8, 2, 6);
      m.clip((x, y) => x <= 8 || x >= 23 || y <= 5 + (x % 3 === 0 ? 1 : 0));
      paintHair(c, m, [[11, 3], [12, 3], [13, 3], [10, 4]], 22);
      return m;
    },
    beard: (c) => {
      // big walrus moustache
      const m = c.m().rows([[14, 11, 20], [15, 10, 21], [16, 10, 12], [16, 19, 21], [17, 10, 11], [17, 20, 21]]);
      m.paint(c.img, c.s.hair, { split: 18 });
      c.p(15, 14, c.s.skin[2]);
      c.p(16, 14, c.s.skin[2]);
    },
    acc: (c) => {
      // laugh lines
      c.p(9, 13, c.s.skin[2]);
      c.p(22, 13, c.s.skin[2]);
    },
    prop: leftHold([13, 29], (c) => {
      // thermos cup of coffee, steaming
      const cup = c.m().rect(10, 25, 6, 6).span(31, 11, 14);
      cup.paint(c.img, PAL.red, { split: 14 });
      c.m().rect(10, 24, 6, 1).fill(c.img, hex('#5a3424'));
      for (let x = 10; x <= 15; x++) c.p(x, 27, PAL.metal[1]);
      c.p(12, 22, hex('#ffffff', 140));
      c.p(13, 21, hex('#ffffff', 110));
      c.p(12, 20, hex('#ffffff', 80));
    }),
  },

  // Olli: the village IT guy. Messy hair, black glasses, hoodie, open laptop.
  olli: {
    skin: SKIN,
    hair: ramp('#8a6a50', '#5e4434', '#3e2c2a', '#281c20'),
    eye: EYE_BROWN,
    top: ramp('#7e9a92', '#56706c', '#3e5052', '#2a363c'),
    legs: ramp('#4a4e68', '#34384e', '#24263a'),
    shoes: ramp('#ffffff', '#d8dce8', '#9ca4bc'),
    back: (c) => {
      // hood lying behind the neck
      c.m().ellipse(15.5, 21, 9, 2.5).paint(c.img, c.s.top, { base: 2 });
    },
    over: (c) => {
      for (let y = 21; y <= 26; y++) {
        c.p(13, y, WHITE);
        c.p(18, y, WHITE);
      }
      c.p(13, 27, hex('#d0d0d8'));
      c.p(18, 27, hex('#d0d0d8'));
      // kangaroo pocket
      for (let x = 11; x <= 20; x++) c.p(x, 31, c.s.top[2]);
      c.p(11, 32, c.s.top[2]);
      c.p(20, 32, c.s.top[2]);
      // tiny "</>" print
      c.p(14, 24, hex('#9ae0ff'));
      c.p(15, 23, hex('#9ae0ff'));
      c.p(16, 24, hex('#9ae0ff'));
    },
    fringe: (c) => {
      const m = c.m()
        .ellipse(15.5, 8.4, 9.4, 6.2)
        .disc(10, 4, 2.4)
        .disc(14, 2.6, 2.4)
        .disc(18.5, 2.8, 2.4)
        .disc(22, 4.5, 2.2)
        .rect(7, 8, 2, 6)
        .rect(23, 8, 2, 6);
      m.clip((x, y) => x <= 8 || x >= 23 || y <= 7 + ((x * 7) % 4 === 0 ? 2 : 0));
      paintHair(c, m, [[11, 2], [12, 1], [15, 1], [9, 4]], 22);
      // a cowlick
      c.p(17, 0, c.s.hair[1]);
      c.p(18, -1, c.s.hair[1]);
      return m;
    },
    acc: glasses(hex('#1e1a2a')),
    prop: leftHold([14, 31], (c) => {
      // open laptop, lid facing us, with stickers
      const lid = c.m().rect(7, 21, 11, 8);
      lid.paint(c.img, PAL.metal, { split: 16 });
      c.p(9, 23, hex('#f08a3a'));
      c.p(10, 23, hex('#f08a3a'));
      c.p(14, 25, hex('#5c94dc'));
      c.p(15, 25, hex('#5c94dc'));
      c.p(14, 26, hex('#5c94dc'));
      c.p(11, 26, hex('#76b452'));
      c.m().rect(6, 29, 13, 2).paint(c.img, PAL.steel);
      // screen glow on the chin
      c.p(14, 18, hex('#9ae0ff', 90));
      c.p(17, 18, hex('#9ae0ff', 90));
    }),
    handItem: (c, x, y) => {
      // phone
      c.p(x, y - 3, OUT);
      c.p(x, y - 2, hex('#3a4a7a'));
      c.p(x, y - 1, hex('#9ae0ff'));
    },
  },

  // Juho: precise accountant. Side parting, argyle sweater vest, tie, calculator.
  juho: {
    skin: SKIN,
    hair: ramp('#e6c486', '#bc9258', '#8e683e', '#5e4430'),
    eye: EYE_BLUE,
    top: ramp('#ffffff', '#eef0f6', '#c8ccdc', '#9a9cb4'),
    legs: ramp('#7a7c8a', '#5a5c6c', '#3e4050'),
    shoes: ramp('#5a4a5a', '#2e2430', '#1e161e'),
    happyArm: 'raise',
    over: (c) => {
      // argyle sweater vest with a V neck
      const vest = ramp('#5a6aa8', '#3e4a88', '#2c3666', '#20264a');
      const m = c.m().rect(c.L + 1, 23, c.R - c.L - 1, 15 - c.b).clip((x, y) => y >= 23 + Math.max(0, 3 - Math.abs(x - 15.5)) * 1.6 || Math.abs(x - 15.5) > 3);
      m.paint(c.img, vest, { split: c.R - 2 });
      for (let y = 26; y < 38; y += 4)
        for (let x = c.L + 2; x < c.R; x += 4) {
          if (!m.has(x, y + c.b)) continue;
          c.p(x, y, hex('#f6d050'));
          c.p(x + 1, y + 1, hex('#e8e0c8'));
          c.p(x - 1, y + 1, hex('#e8e0c8'));
        }
      // tie
      c.p(15, 21, hex('#8a2a3a'));
      c.p(16, 21, hex('#8a2a3a'));
      c.p(15, 22, hex('#a83a48'));
      c.p(16, 22, hex('#a83a48'));
      c.p(15, 23, hex('#a83a48'));
      c.p(16, 24, hex('#8a2a3a'));
      // pen clipped on the vest
      c.p(20, 25, OUT);
      c.p(20, 26, PAL.metal[1]);
    },
    fringe: (c) => {
      // neat side parting, combed to the right
      const m = c.m().ellipse(15.5, 8.6, 8.9, 6.2).rect(7, 8, 2, 6).rect(23, 8, 2, 5);
      m.clip((x, y) => x <= 8 || x >= 23 || y <= (x < 12 ? 7 : 6 - Math.max(0, x - 18) * 0.3 + 1));
      paintHair(c, m, [[13, 3], [14, 3], [15, 3], [16, 3], [17, 4], [18, 4]], 22);
      for (let y = 3; y <= 7; y++) c.p(11, y, c.s.hair[3]);
      for (const [x, y] of [[14, 5], [17, 6], [20, 6]] as const) c.p(x, y, c.s.hair[2]);
      return m;
    },
    prop: leftHold([13, 30], (c) => {
      // pocket calculator
      const m = c.m().rect(9, 22, 7, 10);
      m.paint(c.img, PAL.black, { split: 15 });
      c.m().rect(10, 23, 5, 2).fill(c.img, hex('#a8c8a0'));
      c.p(13, 23, OUT);
      for (let y = 26; y <= 30; y += 2) for (let x = 10; x <= 14; x += 2) c.p(x, y, y === 26 && x === 14 ? hex('#f08a3a') : hex('#c8ccd8'));
    }),
  },
};
