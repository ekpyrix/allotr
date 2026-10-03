import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

// Flat (ADR 0022): a hairline on the page, no fill, no shadow. Only `hero`,
// a screen's one number, keeps the card tone. `interactive` cards fill in
// on hover and press, and scale on press.

const cardVariants = cva('block rounded-lg text-text', {
  variants: {
    variant: {
      default: 'border border-outline-variant p-(--card-pad) medium:p-4',
      interactive:
        'pressable border border-outline-variant p-(--card-pad) hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-card medium:p-4',
      hero: 'bg-card p-5 medium:p-6',
    },
  },
  defaultVariants: { variant: 'default' },
});

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
