import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// As for components/ui: `outline-none` and `outline-hidden` would clear the
// outline style the focus ring needs, so the motion components use neither.

const dir = new URL('./', import.meta.url);
const files = readdirSync(dir).filter((name) => name.endsWith('.tsx'));

describe('focus rings', () => {
  it.each(files)('%s never clears the outline style', (name) => {
    const source = readFileSync(new URL(name, dir), 'utf8');
    expect(source).not.toMatch(/\boutline-(?:none|hidden)\b/);
  });
});
