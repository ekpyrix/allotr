import * as React from 'react';
import { cn } from '@/lib/utils';

// A loading placeholder (ADR 0022): a static tonal block with a slow
// opacity pulse, no shimmer, shaped like what it stands in for. It is
// decorative; the region that loads says so to assistive technology
// (aria-busy).

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn('skeleton-pulse rounded-sm bg-card-raised', className)}
      {...props}
    />
  );
}

/** A grouped list loading: hairline rows with a title and a figure. */
function SkeletonRows({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton-rows"
      className={cn('border-y border-outline-variant', className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex min-h-(--row-h) items-center gap-3 border-b border-outline-variant px-4 last:border-b-0"
        >
          <Skeleton className="size-5 shrink-0" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** A card loading: a hairline box with a label and a large figure. */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton-card"
      className={cn(
        'grid gap-3 rounded-lg border border-outline-variant p-(--card-pad)',
        className,
      )}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-40" />
    </div>
  );
}

export { Skeleton, SkeletonCard, SkeletonRows };
