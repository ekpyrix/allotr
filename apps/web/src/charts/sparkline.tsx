import { type SeriesColor } from '@/components/bars.tsx';
import { cn } from '@/lib/utils';
import { seriesStroke } from './chart.tsx';
import { domainOf, lineGeometry } from './chart-model.ts';
import type { Point } from './math.ts';

/** A 20–28 px monotone line with no axes. */
export function Sparkline({
  points,
  color = 'series-1',
  label,
  className,
}: {
  points: readonly Point[];
  color?: SeriesColor;
  /** The summary read by assistive tech, for example "Balance, last 30 days". */
  label: string;
  className?: string;
}) {
  const x = domainOf(points.map((p) => p.x));
  const y = domainOf(points.map((p) => p.y));
  const { line } = lineGeometry(points, x, y);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn('h-6 w-full overflow-visible', className)}
    >
      <path
        d={line}
        fill="none"
        className={seriesStroke[color]}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
