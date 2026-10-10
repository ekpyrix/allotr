import { type SeriesColor } from '@/components/bars.tsx';
import { cn } from '@/lib/utils';
import { columnLayout } from './math.ts';

const bg: Record<SeriesColor | 'negative', string> = {
  negative: 'bg-negative',
  'series-1': 'bg-series-1',
  'series-2': 'bg-series-2',
  'series-3': 'bg-series-3',
  'series-4': 'bg-series-4',
  'series-5': 'bg-series-5',
  'series-6': 'bg-series-6',
  'series-7': 'bg-series-7',
  'series-8': 'bg-series-8',
};

export type ColumnDatum = Readonly<{
  id: string;
  /** Height as a fraction of the tallest column the server sent, 0..1. */
  fraction: number;
  /** Pre-formatted value above the column. */
  valueLabel: string;
  /** Pre-formatted label below the column. */
  xLabel: string;
  /** `negative` marks a column that passed its limit. */
  color?: SeriesColor | 'negative';
}>;

/** Bar columns with value labels above, x labels below and a 1 px baseline. */
export function Columns({
  data,
  label,
  className,
}: {
  data: readonly ColumnDatum[];
  /** The summary read by assistive tech. */
  label: string;
  className?: string;
}) {
  // Slots are percentages of the width, so labels and bars line up.
  const slots = columnLayout(data.length, 100, 1);
  return (
    <div
      role="img"
      aria-label={`${label}: ${data.map((d) => `${d.xLabel} ${d.valueLabel}`).join(', ')}`}
      className={cn('grid min-w-0 px-3 py-2', className)}
    >
      <div className="relative h-24 border-b wide:h-40">
        {data.map((d, i) => {
          const slot = slots[i];
          if (slot === undefined) return null;
          const fraction = Math.min(1, Math.max(0, d.fraction));
          return (
            <div
              key={d.id}
              aria-hidden="true"
              className="absolute bottom-0 flex h-full flex-col justify-end"
              style={{
                left: `${String(slot.x)}%`,
                width: `${String(slot.width)}%`,
              }}
            >
              <span className="truncate text-center font-num text-[0.6875rem] text-text">
                {d.valueLabel}
              </span>
              <div
                className={bg[d.color ?? 'series-1']}
                style={{ height: `${String(fraction * 80)}%`, minHeight: 1 }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="relative h-4">
        {data.map((d, i) => {
          const slot = slots[i];
          if (slot === undefined) return null;
          return (
            <span
              key={d.id}
              className="absolute truncate text-center font-num text-[0.6875rem] text-text-muted"
              style={{
                left: `${String(slot.x)}%`,
                width: `${String(slot.width)}%`,
              }}
            >
              {d.xLabel}
            </span>
          );
        })}
      </div>
    </div>
  );
}
