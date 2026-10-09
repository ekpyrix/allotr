import { cn } from '@/lib/utils';
import { clampFraction, percent } from './bars-math.ts';

// Bars draw fractions the caller got from the server; they never derive
// money (docs/ui.md §4).

/** An exact bar on a `card` track, with an optional even-pace tick. */
export function Bar({
  value,
  pace,
  over = false,
  label,
  className,
}: {
  value: number;
  /** Days elapsed ÷ cycle length, drawn as a 1 px `text` tick. */
  pace?: number | undefined;
  /** Over budget fills with `negative`. */
  over?: boolean;
  label: string;
  className?: string;
}) {
  const fraction = clampFraction(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      className={cn('relative h-2 w-full bg-card', className)}
    >
      <div
        className={cn('h-full', over ? 'bg-negative' : 'bg-primary')}
        style={{ width: percent(fraction) }}
      />
      {pace === undefined ? null : (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-text"
          style={{ left: percent(pace) }}
        />
      )}
    </div>
  );
}

/** The "left of" bar: 2–4 px, showing what remains. */
export function LeftBar({
  fraction,
  height = 3,
  label,
  className,
}: {
  fraction: number;
  height?: 2 | 3 | 4;
  label: string;
  className?: string;
}) {
  const value = clampFraction(fraction);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={cn(
        'w-full bg-card',
        height === 2 && 'h-0.5',
        height === 3 && 'h-[3px]',
        height === 4 && 'h-1',
        className,
      )}
    >
      <div className="h-full bg-positive" style={{ width: percent(value) }} />
    </div>
  );
}

export type SeriesColor =
  | 'series-1'
  | 'series-2'
  | 'series-3'
  | 'series-4'
  | 'series-5'
  | 'series-6'
  | 'series-7'
  | 'series-8';

export const seriesBg: Record<SeriesColor, string> = {
  'series-1': 'bg-series-1',
  'series-2': 'bg-series-2',
  'series-3': 'bg-series-3',
  'series-4': 'bg-series-4',
  'series-5': 'bg-series-5',
  'series-6': 'bg-series-6',
  'series-7': 'bg-series-7',
  'series-8': 'bg-series-8',
};

export type ShareSegment = Readonly<{
  id: string;
  label: string;
  fraction: number;
  color: SeriesColor;
}>;

/** Stacked segments with 1 px gaps, for pools, categories and IOUs. */
export function ShareBar({
  segments,
  label,
  className,
}: {
  segments: readonly ShareSegment[];
  label: string;
  className?: string;
}) {
  const summary = segments
    .map(
      (s) =>
        `${s.label} ${String(Math.round(clampFraction(s.fraction) * 100))}%`,
    )
    .join(', ');
  return (
    <div
      role="img"
      aria-label={`${label}: ${summary}`}
      className={cn('flex h-2 w-full gap-px bg-canvas', className)}
    >
      {segments.map((s) => (
        <div
          key={s.id}
          className={cn('h-full min-w-px', seriesBg[s.color])}
          style={{ flexGrow: clampFraction(s.fraction), flexBasis: 0 }}
        />
      ))}
    </div>
  );
}

/** A content-shaped placeholder; the fill steps between two tiers. */
export function Skeleton({
  width,
  height = '1rem',
  className,
}: {
  width?: string;
  height?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton', className)}
      style={{ width: width ?? '100%', height }}
    />
  );
}

/**
 * A skeleton tile: title bar and a few rows, shown while a tile loads. Give
 * it the tile's `span` so the grid does not shift when the data arrives.
 */
export function SkeletonTile({
  rows = 3,
  span = 1,
}: {
  rows?: number;
  span?: 1 | 2 | 'full';
}) {
  return (
    <section
      aria-busy="true"
      aria-label="Loading"
      className={cn(
        'flex min-w-0 flex-col border-r border-b bg-canvas',
        span === 2 && 'cols2:col-span-2',
        span === 'full' && 'col-span-full',
      )}
    >
      <div className="flex h-bar items-center border-b bg-chrome px-3">
        <Skeleton width="30%" height="0.75rem" />
      </div>
      <div className="grid gap-2 px-3 py-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} width={i === 0 ? '60%' : '90%'} height="0.75rem" />
        ))}
      </div>
    </section>
  );
}
