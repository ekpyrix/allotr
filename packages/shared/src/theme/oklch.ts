import { channels, linear, normalizeHex } from './color.ts';

// OKLCH, the polar form of Björn Ottosson's Oklab. Lightness steps are
// perceptually even, which is what contrast fitting and neutral ramps need.
// Colours outside sRGB keep their lightness and hue and lose chroma.

/** `h` is in radians. */
export type Oklch = Readonly<{ l: number; c: number; h: number }>;

function gamma(value: number): number {
  return value <= 0.0031308
    ? 12.92 * value
    : 1.055 * value ** (1 / 2.4) - 0.055;
}

export function toOklch(hex: string): Oklch {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: lightness, c: Math.hypot(a, bb), h: Math.atan2(bb, a) };
}

function linearRgb({ l: lightness, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const EPSILON = 1e-6;

function inGamut(rgb: readonly number[]): boolean {
  return rgb.every((value) => value >= -EPSILON && value <= 1 + EPSILON);
}

/** The nearest sRGB colour as #rrggbb, keeping lightness and hue. */
export function fromOklch(color: Oklch): string {
  const l = Math.min(1, Math.max(0, color.l));
  let rgb = linearRgb({ ...color, l });
  if (!inGamut(rgb)) {
    // Binary search for the largest chroma that stays inside sRGB.
    let low = 0;
    let high = color.c;
    for (let step = 0; step < 24; step += 1) {
      const mid = (low + high) / 2;
      if (inGamut(linearRgb({ l, c: mid, h: color.h }))) low = mid;
      else high = mid;
    }
    rgb = linearRgb({ l, c: low, h: color.h });
  }
  const hex = rgb.map((value) =>
    Math.round(gamma(Math.min(1, Math.max(0, value))) * 255)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${hex.join('')}`;
}

/** A straight lightness and chroma blend; hue takes the shorter arc. */
export function mixOklch(a: string, b: string, t: number): string {
  if (t <= 0) return normalizeHex(a);
  if (t >= 1) return normalizeHex(b);
  const x = toOklch(a);
  const y = toOklch(b);
  // A grey has no hue of its own, so it takes the other end's.
  const hx = x.c < 1e-4 ? y.h : x.h;
  const hy = y.c < 1e-4 ? x.h : y.h;
  let dh = hy - hx;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  return fromOklch({
    l: x.l + (y.l - x.l) * t,
    c: x.c + (y.c - x.c) * t,
    h: hx + dh * t,
  });
}
