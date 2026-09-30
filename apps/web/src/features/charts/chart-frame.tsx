import { ChartColumn, Table2 } from 'lucide-react';
import { Suspense, useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';

// Every chart sits in this frame (ADR 0020): a title, a sentence that says
// what the chart shows, and a switch to the same numbers as a table, so no
// one needs the picture. The chart is lazy (Recharts loads only here) and
// keeps its height while it loads. It draws in once as it mounts, by
// clip-path; with reduced or no motion it simply appears.

export function ChartFrame({
  title,
  summary,
  table,
  chart,
  testId,
  height,
}: {
  title: string;
  /** One or two sentences with the figures that matter, as text. */
  summary: ReactNode;
  /** The chart's numbers, exactly as the server sent them. */
  table: ReactNode;
  /** The lazily loaded chart. */
  chart: ReactNode;
  testId: string;
  /** A fixed height in px, for charts that grow with their rows. */
  height?: number | undefined;
}) {
  const heading = useId();
  const [asTable, setAsTable] = useState(false);
  const box = height === undefined ? 'h-60 medium:h-72' : undefined;
  return (
    <Card
      role="region"
      aria-labelledby={heading}
      data-testid={testId}
      className="grid gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id={heading} className="text-title">
          {title}
        </h2>
        <Button
          variant="text"
          size="dense"
          className="-mx-3"
          onClick={() => {
            setAsTable((shown) => !shown);
          }}
        >
          {asTable ? <ChartColumn aria-hidden /> : <Table2 aria-hidden />}
          {asTable ? t('charts.showChart') : t('charts.showTable')}
        </Button>
      </div>
      <p className="max-w-prose text-text-muted">{summary}</p>
      {asTable ? (
        <div className="overflow-x-auto">{table}</div>
      ) : (
        <Suspense
          fallback={
            <div
              aria-busy="true"
              className={box}
              style={height === undefined ? undefined : { height }}
            >
              <Skeleton className="size-full" />
            </div>
          }
        >
          <div
            className={cn('chart-draw', box)}
            style={height === undefined ? undefined : { height }}
          >
            {chart}
          </div>
        </Suspense>
      )}
    </Card>
  );
}

/** A chart's numbers: the first column names the row. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly [key: string, head: string, ...cells: string[]])[];
}) {
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="text-text-muted">
        <tr>
          {columns.map((column, at) => (
            <th
              key={column}
              scope="col"
              className={
                at === 0
                  ? 'py-2 pr-3 font-normal'
                  : 'py-2 pl-3 text-right font-normal'
              }
            >
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, head, ...cells]) => (
          <tr
            key={key}
            data-key={key}
            className="border-t border-outline-variant"
          >
            <th scope="row" className="py-2 pr-3 font-normal">
              {head}
            </th>
            {cells.map((cell, at) => (
              <td
                key={columns[at + 1] ?? String(at)}
                className="py-2 pl-3 text-right font-mono tabular-nums whitespace-nowrap"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
