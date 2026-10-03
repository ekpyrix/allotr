import * as React from 'react';
import { cn } from '@/lib/utils';

// The round add button (ADR 0022): 56 px, a circle, the primary fill. The
// extended form adds a label, for the sidebar.

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
        'pressable inline-flex h-14 shrink-0 items-center justify-center gap-3 rounded-full bg-primary text-on-primary hover:outline-2 hover:outline-offset-2 hover:outline-outline-variant focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 [&_svg]:size-6 [&_svg]:stroke-[1.75]',
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
