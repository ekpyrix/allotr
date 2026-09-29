import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

// Pill buttons (spec §8.2). Every fill is an opaque role the resolver fits
// the label on; hover and press change tone or add a ring, never a tint
// over the label (see "Interaction states" in styles.css).

const ring =
  'hover:outline-2 hover:outline-offset-2 hover:outline-outline-variant';

const buttonVariants = cva(
  "pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-[0.9375rem] leading-5 font-medium whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:outline-2 aria-invalid:outline-negative [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        filled: `bg-primary text-on-primary ${ring}`,
        tonal: `bg-primary-container text-on-primary-container ${ring}`,
        outlined:
          'border border-outline bg-transparent text-text hover:bg-card-raised',
        text: 'bg-transparent text-text hover:bg-card-raised',
        'danger-tonal': `bg-danger-container text-on-danger-container ${ring}`,
        link: 'h-auto rounded-xs px-0 text-text underline underline-offset-4 hover:decoration-2 active:transform-none',
      },
      size: {
        default: 'h-12 px-6 has-[>svg]:px-5',
        dense: 'h-10 px-4 has-[>svg]:px-3.5',
        icon: 'size-12',
      },
    },
    compoundVariants: [
      { variant: 'link', size: ['default', 'dense'], className: 'h-auto px-0' },
    ],
    defaultVariants: {
      variant: 'filled',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'filled',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
