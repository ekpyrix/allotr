import { toOklch } from '../oklch.ts';
import {
  ACCENT_LIMIT,
  accentNameSchema,
  CANONICAL_HUES,
  NEUTRAL_SLOTS,
  type CanonicalHue,
  type NeutralSlot,
  type PartialPalette,
} from '../palette.ts';
import type { ThemeFileV2 } from '../palette-themes.ts';
import { THEME_FILE_FORMAT } from '../themes.ts';
import type { ThemeScheme } from '../tokens.ts';

// Shared by the importers: colour spellings, a scheme guess and turning a
// set of named colours into a v2 theme file. The palette may leave slots
// out; the editor completes it (completePalette) before anything is saved.

/** "#abc", "#aabbcc", "aabbcc", "0xaabbcc" or "#aabbccdd" as "#aabbcc". */
export function hexOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^\s*(?:#|0x)?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\s*$/iu.exec(
    value,
  );
  const digits = match?.[1]?.toLowerCase();
  if (digits === undefined) return undefined;
  if (digits.length === 3) return `#${digits.replace(/./gu, '$&$&')}`;
  return `#${digits.slice(0, 6)}`;
}

/** Light when the page colour is light (OKLCH lightness 0.6 or more). */
export function schemeOf(background: string): ThemeScheme {
  return toOklch(background).l >= 0.6 ? 'light' : 'dark';
}

/** A name as a theme name: trimmed, at most 40 characters. */
export function themeName(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim() ?? '';
  return (trimmed === '' ? fallback : trimmed).slice(0, 40);
}

/** A name as an accent name ("Bright Red" → "bright-red"), if it can be one. */
export function accentName(name: string): string | undefined {
  const slug = name
    .replace(/([a-z])([A-Z])/gu, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 24);
  return accentNameSchema.safeParse(slug).success &&
    !(NEUTRAL_SLOTS as readonly string[]).includes(slug)
    ? slug
    : undefined;
}

// Accent names palettes often use for a canonical hue.
const HUE_NAMES: Readonly<Record<CanonicalHue, readonly string[]>> = {
  red: ['red'],
  orange: ['orange', 'peach'],
  yellow: ['yellow', 'gold'],
  green: ['green'],
  cyan: ['cyan', 'teal', 'sky', 'aqua'],
  blue: ['blue', 'sapphire'],
  purple: ['purple', 'mauve', 'magenta', 'violet'],
  pink: ['pink', 'flamingo'],
};

/** Which accent plays each canonical hue, where a name says so. */
export function huesOf(
  accents: Readonly<Record<string, string>>,
): PartialPalette['hues'] {
  const hues: Partial<Record<CanonicalHue, string>> = {};
  for (const hue of CANONICAL_HUES) {
    const name = HUE_NAMES[hue].find((candidate) =>
      Object.hasOwn(accents, candidate),
    );
    if (name !== undefined) hues[hue] = name;
  }
  return hues;
}

export type Named = Readonly<{
  name: string;
  scheme?: ThemeScheme | undefined;
  neutrals: Readonly<Partial<Record<NeutralSlot, string>>> &
    Readonly<{ base: string; text: string }>;
  accents: Readonly<Record<string, string>>;
}>;

/** Named colours as a v2 theme file; accents past the limit are dropped. */
export function themeFileOf(named: Named, family?: string): ThemeFileV2 {
  const accents = Object.fromEntries(
    Object.entries(named.accents).slice(0, ACCENT_LIMIT),
  );
  return {
    format: THEME_FILE_FORMAT,
    version: 2,
    name: named.name,
    ...(family === undefined ? {} : { family }),
    scheme: named.scheme ?? schemeOf(named.neutrals.base),
    palette: { neutrals: named.neutrals, accents, hues: huesOf(accents) },
  };
}
