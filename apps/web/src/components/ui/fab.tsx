import * as React from 'react';
import { cn } from '@/lib/utils';

// Floating action button (spec §8.2): 56 px, `--radius-xl`, the primary
// fill. The extended form adds a label, for the rail on medium and wider.

type FabProps = React.ComponentProps<'button'> & {
  icon: React.ReactNode;
  /** Shown next to the icon; without it the button needs `aria-label`. */
  label?: string;
};

function Fab({ icon, label, className, ...props }: FabProps) {
  return (
    <button
      type="button"
      data-slot="fab"
      className={cn(
        'pressable inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-xl bg-primary text-on-primary outline-none hover:outline-2 hover:outline-offset-2 hover:outline-outline-variant focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 [&_svg]:size-6 [&_svg]:stroke-[1.75]',
        label === undefined ? 'w-14' : 'px-4 pr-5 text-[0.9375rem] font-medium',
        className,
      )}
      {...props}
    >
      {icon}
      {label}
    </button>
  );
}

export { Fab };
