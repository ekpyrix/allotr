import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

// Cards sit one tone up from the page (ADR 0018): no shadow, no border.
// `interactive` cards step up another tier on hover and press, and scale
// on press; `hero` is the larger, rounder card for a screen's one number.

const cardVariants = cva(
  'block rounded-lg bg-card text-text medium:rounded-xl',
  {
    variants: {
      variant: {
        default: 'p-(--card-pad) medium:p-5',
        interactive:
          'pressable p-(--card-pad) hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-card-raised medium:p-5',
        hero: 'rounded-2xl p-6 medium:rounded-2xl medium:p-8',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Card({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof cardVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      data-slot="card"
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Card, cardVariants };
