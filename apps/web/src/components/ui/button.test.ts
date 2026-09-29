import { THEME_PAIRS } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button.tsx';

// Destructive buttons are outline buttons with destructive text. The
// contrast validator checks that text on the outline fills of the dark
// scheme; this fails when the fills and the declared pairs drift apart.

describe('outline button', () => {
  it('fills in the dark scheme exactly as the destructive pairs declare', () => {
    const fills = buttonVariants({ variant: 'outline' })
      .split(/\s+/)
      .flatMap((name) => {
        const match = /^dark:(?:hover:)?bg-([a-z-]+)\/(\d+)$/.exec(name);
        return match ? [`${match[1] ?? ''} ${match[2] ?? ''}%`] : [];
      });
    const declared = THEME_PAIRS.filter(
      (pair) => pair.foreground === 'destructive' && pair.scheme === 'dark',
    ).flatMap((pair) =>
      pair.tint === undefined
        ? []
        : [`${pair.tint.token} ${String(Math.round(pair.tint.alpha * 100))}%`],
    );
    expect(fills.sort()).toEqual(declared.sort());
    expect(fills).toHaveLength(2);
  });
});
