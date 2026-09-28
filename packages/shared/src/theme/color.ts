import { z } from 'zod';

// WCAG 2.2 relative luminance and contrast ratio for opaque sRGB colours.
// Alpha is not accepted: the ratio would depend on what lies beneath.

export const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, 'Use #rgb or #rrggbb');

function channels(hex: string): [number, number, number] {
  const digits = hexColorSchema.parse(hex).slice(1);
  const full = digits.length === 3 ? digits.replace(/./g, '$&$&') : digits;
  const channel = (at: number) => parseInt(full.slice(at, at + 2), 16) / 255;
  return [channel(0), channel(2), channel(4)];
}

function linear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** From 1 (no contrast) to 21 (black on white); order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
