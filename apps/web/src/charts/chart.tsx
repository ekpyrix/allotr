import { type SeriesColor } from '@/components/bars.tsx';
import { cn } from '@/lib/utils';
import {
  domainOf,
  lineGeometry,
  toPercent,
  type Domain,
} from './chart-model.ts';
import type { Point } from './math.ts';

// Line and area chart (docs/ui.md §4). Only paths and lines live in the
// stretched SVG; the marker and all text are HTML positioned by percentage
// so nothing distorts. Fills are opaque colour mixes, and series colours
// never colour text.

export const seriesStroke: Record<SeriesColor, string> = {
  'series-1': 'stroke-series-1',
  'series-2': 'stroke-series-2',
  'series-3': 'stroke-series-3',
  'series-4': 'stroke-series-4',
  'series-5': 'stroke-series-5',
  'series-6': 'stroke-series-6',
  'series-7': 'stroke-series-7',
  'series-8': 'stroke-series-8',
};

const markerBg: Record<SeriesColor, string> = {
  'series-1': 'bg-series-1',
  'series-2': 'bg-series-2',
  'series-3': 'bg-series-3',
  'series-4': 'bg-series-4',
  'series-5': 'bg-series-5',
  'series-6': 'bg-series-6',
  'series-7': 'bg-series-7',
  'series-8': 'bg-series-8',
};

/** An opaque mix of the series colour into `canvas`, at 16 %. */
export function areaFill(color: SeriesColor): string {
  return `color-mix(in srgb, var(--${color}) 16%, var(--canvas))`;
}

export type ChartSeries = Readonly<{
  id: string;
  label: string;
  color: SeriesColor;
  /** x and y in the caller's units (y in minor units). */
  points: readonly Point[];
  /** Fill under the line. */
  area?: boolean;
  /** Pre-formatted value shown at the end marker. */
  endLabel?: string;
}>;

export type ChartTick = Readonly<{ value: number; label: string }>;

export type ChartTable = Readonly<{
  caption: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}>;

export type ChartProps = Readonly<{
  /** The summary read by assistive tech. */
  label: string;
  series: readonly ChartSeries[];
  yTicks: readonly ChartTick[];
  xTicks: readonly ChartTick[];
  xDomain?: Domain;
  yDomain?: Domain;
  /** A dashed reference line (for example the even pace). */
  reference?: Readonly<{ from: Point; to: Point }>;
  /** A vertical line at an x value, with its label. */
  today?: Readonly<{ x: number; label: string }>;
  /** The data as text, for people who cannot see the plot. */
  table: ChartTable;
  className?: string;
}>;

export function Chart({
  label,
  series,
  yTicks,
  xTicks,
  xDomain,
  yDomain,
  reference,
  today,
  table,
  className,
}: ChartProps) {
  const points = series.flatMap((s) => s.points);
  const x =
    xDomain ??
    domainOf(
      points.map((p) => p.x),
      xTicks.map((t) => t.value),
    );
  const y =
    yDomain ??
    domainOf(
      points.map((p) => p.y),
      [
        ...yTicks.map((t) => t.value),
        ...(reference ? [reference.from.y, reference.to.y] : []),
      ],
    );
  const geometry = series.map((s) => ({
    s,
    g: lineGeometry(s.points, x, y),
  }));

  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[auto_1fr] gap-x-1.5 px-3 py-2',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="relative w-10 font-num text-[0.6875rem] text-text-muted"
      >
        {yTicks.map((t) => (
          <span
            key={t.value}
            className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
            style={{ top: `${String(toPercent(t.value, y, 'y'))}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div
        role="img"
        aria-label={label}
        className="relative h-32 min-w-0 border-b border-l wide:h-56 @min-[1400px]/frame:h-64"
      >
        {yTicks.map((t) => (
          <div
            key={t.value}
            aria-hidden="true"
            className="absolute inset-x-0 h-px bg-card"
            style={{ top: `${String(toPercent(t.value, y, 'y'))}%` }}
          />
        ))}
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          {reference ? (
            <line
              x1={toPercent(reference.from.x, x, 'x')}
              y1={toPercent(reference.from.y, y, 'y')}
              x2={toPercent(reference.to.x, x, 'x')}
              y2={toPercent(reference.to.y, y, 'y')}
              className="stroke-text-muted"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              strokeWidth={1}
            />
          ) : null}
          {today ? (
            <line
              x1={toPercent(today.x, x, 'x')}
              x2={toPercent(today.x, x, 'x')}
              y1={0}
              y2={100}
              className="stroke-text"
              vectorEffect="non-scaling-stroke"
              strokeWidth={1}
            />
          ) : null}
          {geometry.map(({ s, g }) => (
            <g key={s.id}>
              {s.area === true && g.area !== '' ? (
                <path d={g.area} fill={areaFill(s.color)} />
              ) : null}
              <path
                d={g.line}
                fill="none"
                className={seriesStroke[s.color]}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>
        {today ? (
          <span
            aria-hidden="true"
            className="absolute top-0 -translate-x-1/2 bg-canvas px-1 font-num text-[0.6875rem] text-text"
            style={{ left: `${String(toPercent(today.x, x, 'x'))}%` }}
          >
            {today.label}
          </span>
        ) : null}
        {geometry.map(({ s, g }) =>
          g.end ? (
            <div key={s.id} aria-hidden="true">
              <span
                className={cn(
                  'absolute size-1.5 -translate-x-1/2 -translate-y-1/2',
                  markerBg[s.color],
                )}
                style={{
                  left: `${String(g.end.x)}%`,
                  top: `${String(g.end.y)}%`,
                }}
              />
              {s.endLabel === undefined ? null : (
                <span
                  className="absolute -translate-y-full whitespace-nowrap bg-canvas px-1 font-num text-[0.6875rem] text-text"
                  style={{
                    right: `${String(100 - g.end.x)}%`,
                    top: `${String(g.end.y)}%`,
                  }}
                >
                  {s.endLabel}
                </span>
              )}
            </div>
          ) : null,
        )}
      </div>
      <span aria-hidden="true" />
      <div
        aria-hidden="true"
        className="relative mt-2 h-4 font-num text-[0.6875rem] text-text-muted"
      >
        {xTicks.map((t) => (
          <span
            key={t.value}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${String(toPercent(t.value, x, 'x'))}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            {table.headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
