import * as React from 'react';
import { cn } from '@/lib/utils';

// A status chip (spec §8.2): always text plus an icon, never colour alone,
// on a tinted container the resolver fits text on.

const tones = {
  info: 'bg-info-container',
  success: 'bg-success-container',
  warning: 'bg-warning-container',
  danger: 'bg-danger-container',
  primary: 'bg-primary-container',
} as const;

function StatusChip({
  tone,
  icon,
  children,
  className,
}: {
  tone: keyof typeof tones;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      data-slot="status-chip"
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-label text-text [&_svg]:size-4 [&_svg]:shrink-0',
        tones[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="contents">
        {icon}
      </span>
      {children}
    </span>
  );
}

export { StatusChip };
