import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button.tsx';

// Destructive buttons are outline buttons with destructive text, which
// paints with the `negative` role. The resolver fits `negative` on
// canvas, card and card-raised only, so the outline button may only be
// filled with those surfaces: never a translucent tint, which no role is
// checked against.

describe('outline button', () => {
  const classes = buttonVariants({ variant: 'outline' }).split(/\s+/);

  it('has no translucent fill', () => {
    expect(classes.filter((name) => /bg-[a-z-]+\/\d+$/.test(name))).toEqual([]);
  });

  it('fills only with surfaces negative text is fitted on', () => {
    const fills = classes.flatMap((name) => {
      const match = /^(?:[a-z-]+:)*bg-([a-z-]+)$/.exec(name);
      return match ? [match[1]] : [];
    });
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills)
      expect(['background', 'canvas', 'card', 'plot', 'card-raised']).toContain(
        fill,
      );
  });
});

describe('every variant', () => {
  it.each(['default', 'outline', 'ghost', 'link'] as const)(
    '%s has no translucent fill',
    (variant) => {
      const classes = buttonVariants({ variant }).split(/\s+/);
      expect(classes.filter((name) => /bg-[a-z-]+\/\d+$/.test(name))).toEqual(
        [],
      );
    },
  );
});
