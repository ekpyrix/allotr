import { readFileSync } from 'node:fs';
import {
  DEFAULT_PALETTE_THEME_ID,
  findPaletteTheme,
  ROLES,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { tokensCss } from '../scripts/generate-tokens.ts';

// The stylesheet's colours come from the resolver in @allotr/shared, through
// generated/tokens.css; these fail when the pieces drift apart.

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('./styles.css');
const generated = read('./generated/tokens.css');

function block(source: string, selector: string): Record<string, string> {
  const start = source.indexOf(`\n${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  const body = source.slice(start, source.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name ?? '',
      value?.trim() ?? '',
    ]),
  );
}

describe('generated/tokens.css', () => {
  it('is what the generator writes', () => {
    expect(generated).toBe(tokensCss());
  });

  it.each([
    [':root', 'light'],
    [":root[data-theme='dark']", 'dark'],
  ] as const)('%s holds the default %s theme', (selector, scheme) => {
    const theme = findPaletteTheme(DEFAULT_PALETTE_THEME_ID[scheme], []);
    const declared = block(generated, selector);
    for (const role of ROLES) {
      expect(declared[role], role).toBe(theme?.resolved.roles[role]);
    }
  });

  it('stops springs for reduced motion, from the device or the app', () => {
    expect(generated).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{\s*:root:not\(\[data-motion='full'\]\)\s*{[^}]*--dur-snappy:\s*0ms;/,
    );
    expect(generated).toMatch(
      /:root\[data-motion='reduced'\],\s*:root\[data-motion='off'\]\s*{[^}]*--dur-smooth:\s*0ms;/,
    );
  });
});

describe('styles.css', () => {
  it('points the dark variant at data-theme, not the device setting', () => {
    expect(css).toContain(
      '@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));',
    );
    expect(css).not.toContain('prefers-color-scheme');
    expect(generated).not.toContain('prefers-color-scheme');
  });

  it('makes every role a colour utility', () => {
    for (const role of ROLES) {
      expect(css).toContain(`--color-${role}: var(--${role});`);
    }
  });

  it('has no colour names from before the roles', () => {
    for (const name of [
      'background',
      'foreground',
      'muted',
      'muted-foreground',
      'plot',
      'today',
      'over',
      'border',
      'input',
      'destructive',
      'primary-foreground',
    ])
      expect(css).not.toContain(`--color-${name}:`);
  });

  it('never uses a box shadow for depth', () => {
    expect(css).not.toMatch(/box-shadow/);
  });

  it('scales the root to 85 % and sizes in rem', () => {
    expect(css).toMatch(/html\s*{[^}]*font-size:\s*85%/);
  });

  it('has no radius anywhere', () => {
    expect(css).toContain('--radius-*: initial;');
    expect(css).not.toMatch(/border-radius/);
  });

  it('keeps surfaces opaque', () => {
    // Opacity is only for a dragged item, never in the base stylesheet.
    expect(css).not.toMatch(/(?<!-)opacity\s*:/);
    expect(css).not.toMatch(/rgba?\(|hsla?\(|transparent/);
  });

  it('puts container thresholds in px, not rem', () => {
    const queries = [...css.matchAll(/@container frame \(([^)]*)\)/g)];
    expect(queries.length).toBeGreaterThan(0);
    for (const [, condition] of queries)
      expect(condition).not.toMatch(/rem|em/);
  });

  it('uses the terminal fonts: Geist for text, Geist Mono for the interface', () => {
    expect(css).toContain("--font-ui: 'Geist Variable'");
    expect(css).toContain("--font-num: 'Geist Mono Variable'");
    expect(css).toContain('--font-sans: var(--font-num);');
  });
});
