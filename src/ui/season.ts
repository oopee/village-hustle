/**
 * Seasons and time of day, purely visual. Week 1 is early June (school has just ended);
 * every season lasts 13 weeks and the year repeats.
 * Keep in step with season() in content/rules/core.ts.
 */
export type Season = 'summer' | 'autumn' | 'winter' | 'spring';

const ORDER: Season[] = ['summer', 'autumn', 'winter', 'spring'];
export const WEEKS_PER_SEASON = 13;

export function seasonOfWeek(week: number): Season {
  return ORDER[Math.floor((Math.max(1, week) - 1) / WEEKS_PER_SEASON) % ORDER.length];
}

export const SEASON_LABEL: Record<Season, string> = { summer: 'Summer', autumn: 'Autumn', winter: 'Winter', spring: 'Spring' };

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Stable per-cell noise in 0..1, so foliage changes colour in clumps rather than per pixel. */
function cellNoise(x: number, y: number, size: number): number {
  let n = Math.floor(x / size) * 374761393 + Math.floor(y / size) * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Returns a recoloured copy of a picture for the season (summer = unchanged). */
export function seasonalCopy(src: HTMLCanvasElement | HTMLImageElement, season: Season, snowRoofs = false): HTMLCanvasElement {
  const w = src.width;
  const hgt = src.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = hgt;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  if (season === 'summer') return out;
  const img = ctx.getImageData(0, 0, w, hgt);
  const d = img.data;
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;
      const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      const green = h >= 55 && h <= 170 && s > 0.12;
      const water = h > 175 && h < 250 && s > 0.2;
      let rgb: [number, number, number] | null = null;
      if (season === 'autumn' && green) {
        const n = cellNoise(x, y, 4);
        if (l < 0.22) rgb = hslToRgb(h - 30, s * 0.7, l); // conifers stay dark
        else if (n < 0.35) rgb = hslToRgb(28 + n * 20, Math.min(1, s * 1.2), l * 0.95);
        else if (n < 0.6) rgb = hslToRgb(46, Math.min(1, s * 1.1), l);
        else rgb = hslToRgb(h - 45, s * 0.75, l * 0.92);
      } else if (season === 'winter') {
        if (green) {
          if (l < 0.2) rgb = hslToRgb(150, 0.25, l * 0.9);
          else {
            const v = 200 + l * 55;
            rgb = [v - 14, v - 6, v];
          }
        } else if (water) {
          rgb = hslToRgb(200, 0.3, Math.min(0.92, 0.55 + l * 0.45));
        } else rgb = hslToRgb(h, s * 0.7, Math.min(1, l * 1.04));
      } else if (season === 'spring' && green) {
        const n = cellNoise(x, y, 3);
        if (n > 0.985 && l > 0.3) rgb = n > 0.993 ? [250, 214, 226] : [250, 248, 236]; // blossom
        else rgb = hslToRgb(h - 12, Math.min(1, s * 1.08), Math.min(0.85, l * 1.08));
      }
      if (rgb) {
        d[i] = rgb[0];
        d[i + 1] = rgb[1];
        d[i + 2] = rgb[2];
      }
    }
  }
  if (season === 'winter' && snowRoofs) {
    // A cap of snow along the top edge of each column.
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < hgt && d[(y * w + x) * 4 + 3] === 0) y++;
      for (let k = 0; k < 3 && y + k < hgt; k++) {
        const i = ((y + k) * w + x) * 4;
        if (d[i + 3] === 0) break;
        const v = k === 2 ? 205 : 245;
        d[i] = v - 8;
        d[i + 1] = v - 3;
        d[i + 2] = v;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Multiply colour for the time of day: 1 = morning (no tint), 0 = late evening. */
export function daylightTint(frac: number): [number, number, number] | null {
  const e = Math.max(0, Math.min(1, (0.5 - frac) / 0.5));
  if (e <= 0) return null;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  if (e < 0.5) {
    const t = e / 0.5;
    return [255, lerp(255, 200, t), lerp(255, 150, t)];
  }
  const t = (e - 0.5) / 0.5;
  return [lerp(255, 120, t), lerp(200, 125, t), lerp(150, 190, t)];
}
