import { toOklch, type ThemeFileV2 } from '@allotr/shared';
import { schemeOf, themeFileOf } from './colors.ts';

// Terminal colour configs give sixteen ANSI colours plus a foreground and a
// background. The background is the page, the foreground the text, bright
// black the outline tone when it sits between them, and the six colours
// (and their bright versions) become accents for their canonical hues.

export type Ansi = Readonly<{
  background: string;
  foreground: string;
  /** ANSI 0–15, by index; any may be missing. */
  colors: Readonly<Partial<Record<number, string>>>;
}>;

const NAMES = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
] as const;

/** An ANSI colour name ("brightRed", "bright_red", "red") as 0–15. */
export function ansiIndex(name: string): number | undefined {
  const key = name.toLowerCase().replace(/[^a-z0-9]/gu, '');
  const bright = key.startsWith('bright');
  const base = bright ? key.slice('bright'.length) : key;
  const at = NAMES.indexOf(
    (base === 'purple' ? 'magenta' : base) as (typeof NAMES)[number],
  );
  if (at < 0) {
    const numbered = /^(?:color|colour|ansi)?(\d{1,2})$/u.exec(key);
    const index = Number(numbered?.[1] ?? Number.NaN);
    return Number.isInteger(index) && index >= 0 && index < 16
      ? index
      : undefined;
  }
  return bright ? at + 8 : at;
}

const ACCENTS: readonly (readonly [index: number, name: string])[] = [
  [1, 'red'],
  [2, 'green'],
  [3, 'yellow'],
  [4, 'blue'],
  [5, 'purple'],
  [6, 'cyan'],
  [9, 'bright-red'],
  [10, 'bright-green'],
  [11, 'bright-yellow'],
  [12, 'bright-blue'],
  [13, 'bright-purple'],
  [14, 'bright-cyan'],
];

function lightness(color: string): number {
  return toOklch(color).l;
}

function between(value: number, a: number, b: number): boolean {
  return value > Math.min(a, b) && value < Math.max(a, b);
}

export function ansiTheme(name: string, ansi: Ansi): ThemeFileV2 {
  const brightBlack = ansi.colors[8];
  const accents: Record<string, string> = {};
  for (const [index, accent] of ACCENTS) {
    const color = ansi.colors[index];
    if (color !== undefined) accents[accent] = color;
  }
  const outline =
    brightBlack !== undefined &&
    between(
      lightness(brightBlack),
      lightness(ansi.background),
      lightness(ansi.foreground),
    )
      ? { overlay1: brightBlack }
      : {};
  return themeFileOf({
    name,
    scheme: schemeOf(ansi.background),
    neutrals: { base: ansi.background, text: ansi.foreground, ...outline },
    accents,
  });
}
