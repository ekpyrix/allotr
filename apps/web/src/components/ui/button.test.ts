import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button.tsx';

// Button labels are fitted by the resolver on their fill only, so no
// variant may tint a label's surface with a translucent fill, and hover
// changes tone or adds a ring rather than laying colour over the label.

const variants = [
  'filled',
  'tonal',
  'outlined',
  'text',
  'danger-tonal',
  'link',
] as const;

// The fills each label role is fitted on (packages/shared roles.ts).
const fitted: Readonly<Record<string, readonly string[]>> = {
  'text-on-primary': ['primary'],
  'text-on-primary-container': ['primary-container'],
  'text-on-danger-container': ['danger-container'],
  'text-text': ['transparent', 'card-raised'],
};

describe.each(variants)('%s button', (variant) => {
  const classes = buttonVariants({ variant }).split(/\s+/);

  it('has no translucent fill', () => {
    expect(classes.filter((name) => /bg-[a-z-]+\/\d+$/.test(name))).toEqual([]);
  });

  it('fills only with surfaces its label is fitted on', () => {
    const label = classes.find((name) => name in fitted);
    expect(label, 'label colour').toBeDefined();
    const fills = classes.flatMap((name) => {
      const match = /^(?:[a-z-]+:)*bg-([a-z-]+)$/.exec(name);
      return match ? [match[1]] : [];
    });
    for (const fill of fills) expect(fitted[label ?? '']).toContain(fill);
  });
});
