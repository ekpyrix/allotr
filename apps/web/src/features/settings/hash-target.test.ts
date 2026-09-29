import { describe, expect, it } from 'vitest';
import { hashTarget } from './hash-target.ts';

function root(ids: readonly string[]) {
  const elements = new Map(
    ids.map((id) => [id, { id } as unknown as HTMLElement]),
  );
  return { getElementById: (id: string) => elements.get(id) ?? null };
}

describe('hashTarget', () => {
  it('focuses the heading of a section with a title', () => {
    const target = hashTarget('#rates', root(['rates', 'rates-title']));
    expect(target?.scroll.id).toBe('rates');
    expect(target?.focus.id).toBe('rates-title');
  });

  it('focuses the element itself without a title', () => {
    expect(hashTarget('bills', root(['bills']))?.focus.id).toBe('bills');
  });

  it('ignores an empty or unknown hash', () => {
    expect(hashTarget('', root(['rates']))).toBeNull();
    expect(hashTarget('#nope', root(['rates']))).toBeNull();
  });
});
