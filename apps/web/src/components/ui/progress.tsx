import * as React from 'react';
import { Progress as ProgressPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// Progress (spec §8.2): a linear pill track and a ring. The fill moves by
// transform only. Indeterminate progress is for network waits over 400 ms.

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function LinearProgress({
  value,
  label,
  className,
}: {
  /** 0 to 100. */
  value: number;
  label: string;
  className?: string;
}) {
  const done = clamp(value);
  return (
    <ProgressPrimitive.Root
      aria-label={label}
      value={done}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-card-raised',
        className,
      )}
    >
      <ProgressPrimitive.Indicator
        className="size-full rounded-full bg-primary transition-transform duration-(--dur-smooth) ease-(--ease-smooth)"
        style={{ transform: `translateX(-${String(100 - done)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

function RingProgress({
  value,
  label,
  size = 48,
  className,
}: {
  value: number;
  label: string;
  size?: number;
  className?: string;
}) {
  const done = clamp(value);
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(done)}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={cn('-rotate-90', className)}
    >
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        strokeWidth="4"
        className="stroke-card-raised"
      />
      <circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - done / 100)}
        className="stroke-primary"
      />
    </svg>
  );
}

export { LinearProgress, RingProgress };
