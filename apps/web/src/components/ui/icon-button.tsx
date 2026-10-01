import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

// A round icon button: a 48 px target around a 40 px visual (spec §8.2).
// The visual carries the fill so the target can stay larger than it looks.
// Always give it an accessible name (`aria-label`).

const iconButtonVariants = cva(
  "pressable group relative inline-flex size-12 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:relative [&_svg:not([class*='size-'])]:size-6 [&_svg]:stroke-[1.75]",
  {
    variants: {
      variant: {
        standard: 'text-text',
        tonal: 'text-on-primary-container',
        filled: 'text-on-primary',
      },
    },
    defaultVariants: { variant: 'standard' },
  },
);

const visual: Record<'standard' | 'tonal' | 'filled', string> = {
  standard: 'group-hover:bg-card-raised',
  tonal: 'bg-primary-container',
  filled: 'bg-primary',
};

type IconButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof iconButtonVariants> & {
    'aria-label': string;
    asChild?: boolean;
  };

function IconButton({
  className,
  variant = 'standard',
  asChild = false,
  children,
  ...props
}: IconButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="icon-button"
      className={cn(iconButtonVariants({ variant, className }))}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute size-10 rounded-md transition-colors duration-(--dur-fade)',
          visual[variant ?? 'standard'],
        )}
      />
      <Slot.Slottable>{children}</Slot.Slottable>
    </Comp>
  );
}

export { IconButton, iconButtonVariants };
