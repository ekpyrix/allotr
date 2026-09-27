import { describe, expect, it } from 'vitest';
import { fillTemplate } from './template.ts';

describe('fillTemplate', () => {
  it('replaces every placeholder', () => {
    expect(fillTemplate('{a} and {b} and {a}', { a: 'x', b: 2 })).toBe(
      'x and 2 and x',
    );
  });

  it('encodes values when asked', () => {
    expect(
      fillTemplate('/v1/tags/{id}', { id: 'a/b c' }, encodeURIComponent),
    ).toBe('/v1/tags/a%2Fb%20c');
  });

  it('refuses a missing value', () => {
    expect(() => fillTemplate('{a}', {})).toThrow('Missing value for {a}');
  });
});
