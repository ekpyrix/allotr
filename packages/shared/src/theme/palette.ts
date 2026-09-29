import { z } from 'zod';
import { hexColorSchema } from './color.ts';
import { fromOklch, mixOklch, toOklch } from './oklch.ts';
import type { ThemeScheme } from './tokens.ts';

// A palette is what a terminal colour scheme gives: a neutral ramp from the
// page colour to the text colour, plus named accents. `hues` says which
// accent plays each canonical hue, so role maps work for any palette.

/** From `crust` (off the page) through `base` (the page) to `text`. */
export const NEUTRAL_SLOTS = [
  'crust',
  'mantle',
  'base',
  'surface0',
  'surface1',
  'surface2',
  'overlay0',
  'overlay1',
  'overlay2',
  'subtext0',
  'subtext1',
  'text',
] as const;
export type NeutralSlot = (typeof NEUTRAL_SLOTS)[number];

export const CANONICAL_HUES = [
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'purple',
  'pink',
] as const;
export type CanonicalHue = (typeof CANONICAL_HUES)[number];

/** At most this many accents in a palette. */
export const ACCENT_LIMIT = 24;

export const accentNameSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{0,23}$/,
    'Use a-z, 0-9 and -, starting with a letter',
  );

const accentsSchema = z
  .record(accentNameSchema, hexColorSchema)
  .refine((accents) => Object.keys(accents).length <= ACCENT_LIMIT, {
    message: `At most ${String(ACCENT_LIMIT)} accents`,
  })
  .refine(
    (accents) =>
      Object.keys(accents).every(
        (name) => !(NEUTRAL_SLOTS as readonly string[]).includes(name),
      ),
    { message: 'An accent cannot be named after a neutral slot' },
  );

function shape<const Slots extends readonly string[], T>(
  slots: Slots,
  value: T,
): Record<Slots[number], T> {
  return Object.fromEntries(slots.map((slot) => [slot, value])) as Record<
    Slots[number],
    T
  >;
}

type HueIndexed = Readonly<{
  accents: Readonly<Record<string, string>>;
  hues: Readonly<Partial<Record<CanonicalHue, string | undefined>>>;
}>;

function checkHues(palette: HueIndexed, context: z.RefinementCtx): void {
  for (const hue of CANONICAL_HUES) {
    const name = palette.hues[hue];
    if (name !== undefined && !Object.hasOwn(palette.accents, name)) {
      context.addIssue({
        code: 'custom',
        path: ['hues', hue],
        message: `No accent named ${name}`,
      });
    }
  }
}

/** A complete palette: every neutral slot and every canonical hue. */
export const paletteSchema = z
  .strictObject({
    neutrals: z.strictObject(shape(NEUTRAL_SLOTS, hexColorSchema)),
    accents: accentsSchema.refine(
      (accents) => Object.keys(accents).length >= 1,
      { message: 'At least one accent' },
    ),
    hues: z.strictObject(shape(CANONICAL_HUES, accentNameSchema)),
  })
  .superRefine(checkHues);
export type Palette = z.infer<typeof paletteSchema>;

/** What an importer can give: at least the page and text colours. */
export const partialPaletteSchema = z
  .strictObject({
    neutrals: z.strictObject({
      ...shape(NEUTRAL_SLOTS, hexColorSchema.optional()),
      base: hexColorSchema,
      text: hexColorSchema,
    }),
    accents: accentsSchema,
    hues: z.strictObject(shape(CANONICAL_HUES, accentNameSchema.optional())),
  })
  .superRefine(checkHues);
export type PartialPalette = z.infer<typeof partialPaletteSchema>;

// Where each missing ramp slot sits between `base` (0) and `text` (1).
// `mantle` and `crust` are always darker than `base`, in both schemes.
const RAMP: Readonly<Partial<Record<NeutralSlot, number>>> = {
  surface0: 0.1,
  surface1: 0.17,
  surface2: 0.24,
  overlay0: 0.36,
  overlay1: 0.46,
  overlay2: 0.56,
  subtext0: 0.7,
  subtext1: 0.84,
};
const BELOW_BASE: Readonly<Partial<Record<NeutralSlot, number>>> = {
  mantle: 0.03,
  crust: 0.06,
};

// Hue angles in degrees for generated accents.
const HUE_ANGLE: Readonly<Record<CanonicalHue, number>> = {
  red: 25,
  orange: 55,
  yellow: 90,
  green: 145,
  cyan: 195,
  blue: 255,
  purple: 305,
  pink: 350,
};

function median(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Fills in what a partial palette leaves out; nothing given is changed.
 * Missing neutrals are interpolated in OKLCH. A canonical hue with no
 * accent uses an accent of that name, or gets one generated at the median
 * lightness and chroma of the palette's accents.
 */
export function completePalette(
  partial: PartialPalette,
  scheme: ThemeScheme,
): Palette {
  const { base, text } = partial.neutrals;
  const baseL = toOklch(base);
  const neutrals = Object.fromEntries(
    NEUTRAL_SLOTS.map((slot) => {
      const given = partial.neutrals[slot];
      if (given !== undefined) return [slot, given];
      const below = BELOW_BASE[slot];
      if (below !== undefined)
        return [slot, fromOklch({ ...baseL, l: baseL.l - below })];
      return [slot, mixOklch(base, text, RAMP[slot] ?? 0)];
    }),
  ) as Record<NeutralSlot, string>;

  const existing = Object.values(partial.accents).map(toOklch);
  const l =
    median(existing.map((color) => color.l)) ??
    (scheme === 'light' ? 0.55 : 0.78);
  const c = median(existing.map((color) => color.c)) ?? 0.12;
  const accents: Record<string, string> = { ...partial.accents };
  const hues = Object.fromEntries(
    CANONICAL_HUES.map((hue) => {
      const given = partial.hues[hue];
      if (given !== undefined) return [hue, given];
      if (!Object.hasOwn(accents, hue))
        accents[hue] = fromOklch({ l, c, h: (HUE_ANGLE[hue] * Math.PI) / 180 });
      return [hue, hue];
    }),
  ) as Record<CanonicalHue, string>;

  return { neutrals, accents, hues };
}

/** A neutral slot, a canonical hue, or an accent by name. */
export function slotColor(palette: Palette, slot: string): string | undefined {
  if (Object.hasOwn(palette.neutrals, slot))
    return palette.neutrals[slot as NeutralSlot];
  if (Object.hasOwn(palette.hues, slot)) {
    const name = palette.hues[slot as CanonicalHue];
    return Object.hasOwn(palette.accents, name)
      ? palette.accents[name]
      : undefined;
  }
  return Object.hasOwn(palette.accents, slot)
    ? palette.accents[slot]
    : undefined;
}
