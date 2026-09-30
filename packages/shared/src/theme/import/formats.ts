import { NEUTRAL_SLOTS, type NeutralSlot } from '../palette.ts';
import type { ThemeFileV2 } from '../palette-themes.ts';
import { ansiIndex, ansiTheme } from './ansi.ts';
import { accentName, hexOf, themeFileOf, themeName } from './colors.ts';

// One parser per shape (ADR 0016). Each returns the themes it read, or
// null when the input is not its shape, so the caller can try the next.
// They are pure: text or parsed JSON in, v2 theme files out, and nothing
// is fetched, stored or checked for contrast here.

type Themes = ThemeFileV2[] | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A colour as a string, or as an object carrying `hex`. */
function colorOf(value: unknown): string | undefined {
  return isRecord(value) ? hexOf(value.hex) : hexOf(value);
}

const neutralSlots: readonly string[] = NEUTRAL_SLOTS;

/** Named colours with our neutral slot names, plus accents; null without base and text. */
function paletteOf(
  colors: Record<string, unknown>,
  name: string,
  dark: unknown,
): ThemeFileV2 | null {
  const neutrals: Partial<Record<NeutralSlot, string>> = {};
  const accents: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    const color = colorOf(value);
    if (color === undefined) continue;
    if (neutralSlots.includes(key)) neutrals[key as NeutralSlot] = color;
    else {
      const accent = accentName(key);
      if (accent !== undefined && !Object.hasOwn(accents, accent))
        accents[accent] = color;
    }
  }
  const { base, text } = neutrals;
  if (base === undefined || text === undefined) return null;
  return themeFileOf({
    name,
    scheme: typeof dark === 'boolean' ? (dark ? 'dark' : 'light') : undefined,
    neutrals: { ...neutrals, base, text },
    accents,
  });
}

function flavourOf(key: string, value: unknown): ThemeFileV2 | null {
  if (!isRecord(value)) return null;
  const colors = isRecord(value.colors) ? value.colors : value;
  const name = typeof value.name === 'string' ? value.name : key;
  return paletteOf(colors, themeName(name, key), value.dark);
}

/**
 * A palette file in JSON: one palette with our slot names (`base`, `text`
 * and so on, each a hex string or `{ "hex": … }`), or several flavours of
 * one family in one file, keyed by flavour.
 */
export function parsePaletteJson(
  data: unknown,
  fallbackName: string,
  family: string,
): Themes {
  if (!isRecord(data)) return null;
  const single = flavourOf(fallbackName, data);
  if (single !== null) return [single];
  const flavours = Object.entries(data)
    .map(([key, value]) => flavourOf(key, value))
    .filter((theme) => theme !== null);
  if (flavours.length === 0) return null;
  return flavours.length === 1
    ? flavours
    : flavours.map((theme) => ({ ...theme, family }));
}

/**
 * ANSI colours in JSON: `background`, `foreground` and the sixteen colours
 * by name (`red`, `brightRed`, `purple`) or number (`color1`), optionally
 * prefixed as editor settings spell them (`terminal.ansiRed`).
 */
export function parseJsonColors(data: unknown, fallbackName: string): Themes {
  if (!isRecord(data)) return null;
  let background: string | undefined;
  let foreground: string | undefined;
  const colors: Record<number, string> = {};
  for (const [raw, value] of Object.entries(data)) {
    const color = colorOf(value);
    if (color === undefined) continue;
    const key = raw.replace(/^terminal\./u, '').replace(/^ansi/iu, '');
    if (/^background$/iu.test(key)) background = color;
    else if (/^foreground$/iu.test(key)) foreground = color;
    else {
      const index = ansiIndex(key);
      if (index !== undefined) colors[index] = color;
    }
  }
  if (background === undefined || foreground === undefined) return null;
  if (Object.keys(colors).length < 6) return null;
  const name = typeof data.name === 'string' ? data.name : undefined;
  return [
    ansiTheme(themeName(name, fallbackName), {
      background,
      foreground,
      colors,
    }),
  ];
}

/** `key: value` lines of a flat YAML map, quotes and comments removed. */
function yamlPairs(text: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/u.exec(line);
    if (match === null) continue;
    const [, key = '', raw = ''] = match;
    const quoted = /^(["'])(.*)\1/u.exec(raw);
    const value = quoted === null ? raw.replace(/\s+#.*$/u, '') : quoted[2];
    if (value !== undefined && value !== '')
      pairs.set(key.toLowerCase(), value);
  }
  return pairs;
}

// Base16 and base24: base00–07 run from the page to the lightest tone,
// base08–0F are the accents, and base24 adds two deeper backgrounds and
// six bright accents.
const BASE16_NEUTRALS: readonly (readonly [string, NeutralSlot])[] = [
  ['base11', 'crust'],
  ['base10', 'mantle'],
  ['base00', 'base'],
  ['base01', 'surface0'],
  ['base02', 'surface1'],
  ['base03', 'overlay1'],
  ['base04', 'subtext0'],
  ['base05', 'text'],
];
const BASE16_ACCENTS: readonly (readonly [string, string])[] = [
  ['base08', 'red'],
  ['base09', 'orange'],
  ['base0a', 'yellow'],
  ['base0b', 'green'],
  ['base0c', 'cyan'],
  ['base0d', 'blue'],
  ['base0e', 'purple'],
  ['base0f', 'brown'],
  ['base12', 'bright-red'],
  ['base13', 'bright-yellow'],
  ['base14', 'bright-green'],
  ['base15', 'bright-cyan'],
  ['base16', 'bright-blue'],
  ['base17', 'bright-purple'],
];

/** A base16 or base24 scheme in YAML. */
export function parseBase16Yaml(text: string, fallbackName: string): Themes {
  const pairs = yamlPairs(text);
  const color = (key: string) => hexOf(pairs.get(key));
  const base = color('base00');
  const fore = color('base05');
  if (base === undefined || fore === undefined) return null;
  const neutrals: Partial<Record<NeutralSlot, string>> = {};
  for (const [key, slot] of BASE16_NEUTRALS) {
    const value = color(key);
    if (value !== undefined) neutrals[slot] = value;
  }
  const accents: Record<string, string> = {};
  for (const [key, accent] of BASE16_ACCENTS) {
    const value = color(key);
    if (value !== undefined) accents[accent] = value;
  }
  if (Object.keys(accents).length < 6) return null;
  const variant = pairs.get('variant');
  return [
    themeFileOf({
      name: themeName(pairs.get('scheme') ?? pairs.get('name'), fallbackName),
      scheme: variant === 'light' || variant === 'dark' ? variant : undefined,
      neutrals: { ...neutrals, base, text: fore },
      accents,
    }),
  ];
}

/**
 * A TOML colour config: `[colors.primary]` background and foreground,
 * `[colors.normal]` and `[colors.bright]` the eight ANSI colours each.
 */
export function parseTomlColors(text: string, fallbackName: string): Themes {
  let section = '';
  let background: string | undefined;
  let foreground: string | undefined;
  const colors: Record<number, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    const header = /^\s*\[\s*([A-Za-z0-9_.-]+)\s*\]\s*$/u.exec(line);
    if (header !== null) {
      section = header[1]?.toLowerCase() ?? '';
      continue;
    }
    const pair = /^\s*([A-Za-z0-9_-]+)\s*=\s*["']([^"']+)["']/u.exec(line);
    if (pair === null) continue;
    const key = pair[1]?.toLowerCase() ?? '';
    const color = hexOf(pair[2]);
    if (color === undefined) continue;
    if (section === 'colors.primary' && key === 'background')
      background = color;
    else if (section === 'colors.primary' && key === 'foreground')
      foreground = color;
    else if (section === 'colors.normal' || section === 'colors.bright') {
      const index = ansiIndex(key);
      if (index !== undefined && index < 8)
        colors[section === 'colors.bright' ? index + 8 : index] = color;
    }
  }
  if (background === undefined || foreground === undefined) return null;
  return [
    ansiTheme(themeName(undefined, fallbackName), {
      background,
      foreground,
      colors,
    }),
  ];
}

/**
 * Key-value colour configs, one colour per line: `background = #…`,
 * `foreground: #…`, `color4 #…`, `*.color4: #…` or `palette = 4=#…`.
 * Lines starting with `#` or `!` are comments.
 */
export function parseKeyValueColors(
  text: string,
  fallbackName: string,
): Themes {
  let background: string | undefined;
  let foreground: string | undefined;
  const colors: Record<number, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    if (/^\s*[#!;]/u.test(line)) continue;
    const match = /^\s*\*?\.?([A-Za-z0-9_-]+)\s*[:=\s]\s*(.+?)\s*$/u.exec(line);
    if (match === null) continue;
    const key = match[1]?.toLowerCase() ?? '';
    const raw = match[2] ?? '';
    const indexed = /^(\d{1,2})\s*=\s*(\S+)$/u.exec(raw);
    if (key === 'palette' && indexed !== null) {
      const index = Number(indexed[1]);
      const color = hexOf(indexed[2]);
      if (index < 16 && color !== undefined) colors[index] = color;
      continue;
    }
    const color = hexOf(raw.replace(/^["']|["']$/gu, ''));
    if (color === undefined) continue;
    if (key === 'background') background = color;
    else if (key === 'foreground') foreground = color;
    else {
      const index = ansiIndex(key);
      if (index !== undefined) colors[index] = color;
    }
  }
  if (background === undefined || foreground === undefined) return null;
  return [
    ansiTheme(themeName(undefined, fallbackName), {
      background,
      foreground,
      colors,
    }),
  ];
}

function channel(value: string | undefined): string {
  const number = Math.round(Math.min(1, Math.max(0, Number(value))) * 255);
  return (Number.isFinite(number) ? number : 0).toString(16).padStart(2, '0');
}

/**
 * An XML property list of colours: dictionaries named `Ansi 0 Color` to
 * `Ansi 15 Color`, `Background Color` and `Foreground Color`, each with
 * red, green and blue components from 0 to 1.
 */
export function parseXmlPlistColors(
  text: string,
  fallbackName: string,
): Themes {
  if (!/<plist[\s>]/u.test(text)) return null;
  const named = new Map<string, string>();
  const entry = /<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/gu;
  for (const [, key = '', body = ''] of text.matchAll(entry)) {
    const component = (name: string) =>
      new RegExp(
        `<key>${name} Component</key>\\s*<real>([^<]+)</real>`,
        'u',
      ).exec(body)?.[1];
    named.set(
      key.trim().toLowerCase(),
      `#${channel(component('Red'))}${channel(component('Green'))}${channel(component('Blue'))}`,
    );
  }
  const background = named.get('background color');
  const foreground = named.get('foreground color');
  if (background === undefined || foreground === undefined) return null;
  const colors: Record<number, string> = {};
  for (const [key, color] of named) {
    const match = /^ansi (\d{1,2}) color$/u.exec(key);
    const index = Number(match?.[1] ?? Number.NaN);
    if (index >= 0 && index < 16) colors[index] = color;
  }
  return [
    ansiTheme(themeName(undefined, fallbackName), {
      background,
      foreground,
      colors,
    }),
  ];
}
