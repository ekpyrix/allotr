import { cn } from '@/lib/utils';

// Progress through a short flow as a row of pills (spec §11.7): done and
// current steps in primary, the current one wider, the rest outlined. It
// is a picture; the step's heading says "Step n of m" in words.

export function StepPills({
  current,
  total,
  className,
}: {
  /** 1-based; above `total` when every step is done. */
  current: number;
  total: number;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn('flex gap-1.5', className)}>
      {Array.from({ length: total }, (_, at) => (
        <span
          key={at}
          data-state={
            at + 1 < current ? 'done' : at + 1 === current ? 'current' : 'todo'
          }
          className="h-1.5 w-4 rounded-full bg-outline-variant data-[state=current]:w-8 data-[state=current]:bg-primary data-[state=done]:bg-primary"
        />
      ))}
    </span>
  );
}
