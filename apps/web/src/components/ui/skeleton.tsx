import * as React from 'react';
import { cn } from '@/lib/utils';

// A loading placeholder (spec §7.3): a static tonal block with a slow
// opacity pulse, no shimmer. It is decorative; the region that loads says
// so to assistive technology (aria-busy).

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn('skeleton-pulse rounded-md bg-card-raised', className)}
      {...props}
    />
  );
}

export { Skeleton };
