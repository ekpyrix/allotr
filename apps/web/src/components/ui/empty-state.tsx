import * as React from 'react';
import { cn } from '@/lib/utils';

// An empty state (spec §8.2): no illustration, just a large icon in a 72 px
// card-raised circle, one line and at most one action.

function EmptyState({
  icon,
  title,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center gap-4 px-4 py-8 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-18 items-center justify-center rounded-full bg-card-raised text-text-muted [&_svg]:size-8 [&_svg]:stroke-[1.75]"
      >
        {icon}
      </span>
      <p className="max-w-80 text-body-lg">{title}</p>
      {action}
    </div>
  );
}

export { EmptyState };
