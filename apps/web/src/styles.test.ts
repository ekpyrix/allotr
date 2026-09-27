import { readFileSync } from 'node:fs';
import { darkTheme, lightTheme, THEME_TOKENS } from '@allotr/shared';
import { describe, expect, it } from 'vitest';

// styles.css repeats the built-in theme values from @allotr/shared, where
// the contrast validator checks them; this fails when the two drift apart.

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name ?? '',
      value?.trim() ?? '',
    ]),
  );
}

describe('styles.css', () => {
  it.each([
    [':root', lightTheme],
    [":root[data-theme='dark']", darkTheme],
  ])('%s matches the built-in theme', (selector, theme) => {
    const declared = block(selector);
    for (const token of THEME_TOKENS) {
      expect(declared[token], token).toBe(theme[token]);
    }
  });

  it('points the dark variant at data-theme, not the device setting', () => {
    expect(css).toContain(
      '@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));',
    );
    expect(css).not.toContain('prefers-color-scheme');
  });

  it('drops motion durations when reduced motion is asked for', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{\s*:root\s*{[^}]*--duration-fast:\s*0ms;[^}]*--duration-base:\s*0ms;/,
    );
  });
});
