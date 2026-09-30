import { readFileSync } from 'node:fs';
import {
  completePalette,
  darkTheme,
  paletteTheme,
  toThemeFile,
  type ThemeFileV2,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { hexOf } from './colors.ts';
import { importThemeText } from './index.ts';

// Every fixture is made-up colours in a real file shape.
function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function only(result: ReturnType<typeof importThemeText>): ThemeFileV2 {
  expect(result.ok).toBe(true);
  if (!result.ok || result.themes.length !== 1)
    throw new Error('expected one theme');
  const [theme] = result.themes;
  if (theme === undefined) throw new Error('expected one theme');
  return theme;
}

// The ANSI fixtures all describe one dark scheme.
const meadowNight = {
  base: '#1d2421',
  text: '#d8e2da',
  red: '#e0736b',
  green: '#8fcf8a',
  blue: '#74a8e0',
  purple: '#c792d8',
  cyan: '#6fc9c1',
  brightRed: '#ec8d85',
};

function expectMeadowNight(theme: ThemeFileV2, name: string) {
  expect(theme).toMatchObject({
    version: 2,
    name,
    scheme: 'dark',
    palette: {
      neutrals: {
        base: meadowNight.base,
        text: meadowNight.text,
        overlay1: '#5d6a64',
      },
      accents: {
        red: meadowNight.red,
        green: meadowNight.green,
        blue: meadowNight.blue,
        purple: meadowNight.purple,
        cyan: meadowNight.cyan,
        'bright-red': meadowNight.brightRed,
      },
      hues: { red: 'red', purple: 'purple', cyan: 'cyan' },
    },
  });
  // Completed and resolved, it paints without contrast failures.
  const palette = completePalette(theme.palette, theme.scheme);
  expect(paletteTheme('t', { ...theme, palette }).resolved.failures).toEqual(
    [],
  );
}

describe('hexOf', () => {
  it('reads the usual spellings', () => {
    expect(hexOf('#ABC')).toBe('#aabbcc');
    expect(hexOf('1d2421')).toBe('#1d2421');
    expect(hexOf('0x1D2421')).toBe('#1d2421');
    expect(hexOf('#1d2421ff')).toBe('#1d2421');
    expect(hexOf('rgb(1, 2, 3)')).toBeUndefined();
    expect(hexOf(12)).toBeUndefined();
  });
});

describe('importThemeText', () => {
  it('reads an Allotr theme file, v1 or v2, as it is', () => {
    const v1 = toThemeFile({
      name: 'Ember',
      scheme: 'dark',
      tokens: darkTheme,
    });
    const result = importThemeText(JSON.stringify(v1), 'ember.json');
    expect(result).toMatchObject({ ok: true, kind: 'theme' });
    expect(only(result).name).toBe('Ember');
  });

  it('reads the four flavours of a palette file as a family', () => {
    const result = importThemeText(
      fixture('meadow-flavours.json'),
      'Meadow.json',
    );
    expect(result).toMatchObject({ ok: true, kind: 'family' });
    if (!result.ok) return;
    expect(result.themes.map((theme) => [theme.name, theme.scheme])).toEqual([
      ['Meadow Dawn', 'light'],
      ['Meadow Day', 'light'],
      ['Meadow Dusk', 'dark'],
      ['Meadow Night', 'dark'],
    ]);
    expect(new Set(result.themes.map((theme) => theme.family))).toEqual(
      new Set(['meadow']),
    );
    // Accent names that mean a canonical hue play it.
    expect(result.themes[0]?.palette.hues).toEqual({
      red: 'red',
      orange: 'peach',
      yellow: 'yellow',
      green: 'green',
      cyan: 'teal',
      blue: 'blue',
      purple: 'mauve',
      pink: 'pink',
    });
    expect(result.themes[3]?.palette.neutrals).toMatchObject({
      crust: '#111613',
      base: '#1d2421',
      text: '#d8e2da',
    });
  });

  it('reads one palette with slot names, guessing its scheme', () => {
    const theme = only(
      importThemeText(fixture('meadow-palette.json'), 'Meadow Dawn.json'),
    );
    expect(theme).toMatchObject({
      name: 'Meadow Dawn',
      scheme: 'light',
      palette: { neutrals: { base: '#f4f7f2', text: '#27302b' } },
    });
    expect(theme.family).toBeUndefined();
  });

  it('reads base16 YAML', () => {
    const result = importThemeText(fixture('meadow-base16.yaml'));
    expect(result).toMatchObject({ ok: true, kind: 'palette' });
    const theme = only(result);
    expect(theme).toMatchObject({
      name: 'Meadow Night',
      scheme: 'dark',
      palette: {
        neutrals: {
          base: '#1d2421',
          surface0: '#252d29',
          surface1: '#2f3934',
          overlay1: '#5d6a64',
          subtext0: '#a3aea6',
          text: '#d8e2da',
        },
        accents: { red: '#e0736b', orange: '#e39a64', brown: '#b38a6a' },
      },
    });
  });

  it('reads base24 YAML with its deeper backgrounds and bright accents', () => {
    const theme = only(importThemeText(fixture('meadow-base24.yaml')));
    expect(theme).toMatchObject({
      name: 'Meadow Night 24',
      scheme: 'dark',
      palette: {
        neutrals: { crust: '#111613', mantle: '#171d1a' },
        accents: { 'bright-red': '#ec8d85', 'bright-purple': '#d6aae3' },
      },
    });
  });

  it('reads terminal colours from JSON, TOML, key-value and XML', () => {
    for (const [file, kind] of [
      ['meadow-terminal.json', 'terminal'],
      ['meadow.toml', 'terminal'],
      ['meadow.conf', 'terminal'],
      ['meadow.plist', 'terminal'],
    ] as const) {
      const result = importThemeText(fixture(file), 'Meadow Night.x');
      expect(result, file).toMatchObject({ ok: true, kind });
      // The JSON names itself; the others take the file's name.
      expectMeadowNight(only(result), 'Meadow Night');
    }
  });

  it('reads colour resources written as *.colorN lines', () => {
    const text = [
      '! Meadow Night: made-up colours',
      '*.background: #1d2421',
      '*.foreground: #d8e2da',
      ...['2a332f', 'e0736b', '8fcf8a', 'e4c56d', '74a8e0', 'c792d8'].map(
        (hex, at) => `*.color${String(at)}: #${hex}`,
      ),
      '*.color8: #5d6a64',
    ].join('\n');
    const theme = only(importThemeText(text, 'meadow.Xresources'));
    expect(theme.palette.accents).toMatchObject({
      red: '#e0736b',
      purple: '#c792d8',
    });
    expect(theme.palette.neutrals.overlay1).toBe('#5d6a64');
  });

  it('says what it could not read', () => {
    expect(importThemeText('{ "hello": "world" }')).toEqual({
      ok: false,
      problems: [
        'This JSON is not a theme file, a palette or a terminal colour scheme: it needs a page and a text colour.',
      ],
    });
    expect(importThemeText('just some words')).toEqual({
      ok: false,
      problems: [
        'This file is not a theme file, palette file or terminal colour config Allotr can read.',
      ],
    });
    const broken = importThemeText(
      JSON.stringify({ format: 'allotr-theme', version: 3 }),
    );
    expect(broken).toMatchObject({ ok: false });
  });
});
