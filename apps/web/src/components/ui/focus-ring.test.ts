import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Tailwind 4's `outline-none` and `outline-hidden` both set the outline
// style to none, so a later `focus-visible:outline-2` draws nothing and the
// focus ring disappears. Primitives use neither: browsers draw no outline
// except on :focus-visible, where our 2 px ring replaces the default one
// (WCAG 2.4.7).

const dir = new URL('./', import.meta.url);
const files = readdirSync(dir).filter((name) => name.endsWith('.tsx'));

describe('focus rings', () => {
  it.each(files)('%s never clears the outline style', (name) => {
    const source = readFileSync(new URL(name, dir), 'utf8');
    expect(source).not.toMatch(/\boutline-(?:none|hidden)\b/);
  });
});
