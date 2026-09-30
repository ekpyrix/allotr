import { formatMoney, type CycleDayView, type Money } from '@allotr/shared';
import { Gauge, TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { paceAhead, todayRow } from './state.ts';

// The pace spark (spec §10): the cycle's pace spending so far as a line
// against the dashed even pace, a dot for today and a mark at payday. The
// server sends every point, the pace line and the budget; this only draws
// them. It stays a meter with words beside it, so neither the picture nor
// colour carries the meaning alone.

const WIDTH = 300;
const HEIGHT = 56;
const PAD = 4;

function share(part: number, whole: number): number {
  return whole <= 0 ? 0 : part / whole;
}

export function PaceSpark({
  days,
  budget,
  locale,
}: {
  days: readonly CycleDayView[];
  budget: Money;
  locale: string;
}) {
  const heading = useId();
  const row = todayRow(days);
  if (row === undefined || row.cumulativeSpent === null || days.length === 0)
    return null;
  const ahead = paceAhead(days);
  const spent = row.cumulativeSpent;
  const day = days.indexOf(row) + 1;
  const top = Math.max(
    budget.amountMinor,
    ...days.map((d) => d.cumulativeSpent?.amountMinor ?? 0),
    1,
  );
  const x = (at: number) =>
    PAD + share(at, Math.max(1, days.length - 1)) * (WIDTH - 2 * PAD);
  const y = (amount: number) =>
    HEIGHT - PAD - share(Math.max(0, amount), top) * (HEIGHT - 2 * PAD);
  // One decimal is plenty for a 300-unit drawing.
  const coord = (value: number) => String(Math.round(value * 10) / 10);
  const line = (points: [number, number][]) =>
    points
      .map(([px, py], at) => `${at === 0 ? 'M' : 'L'}${coord(px)},${coord(py)}`)
      .join(' ');
  const spentPoints = days
    .slice(0, day)
    .map((d, at): [number, number] => [
      x(at),
      y(d.cumulativeSpent?.amountMinor ?? 0),
    ]);
  const pacePoints = days.map((d, at): [number, number] => [
    x(at),
    y(d.pace.amountMinor),
  ]);
  const spentPercent = Math.round(
    share(spent.amountMinor, budget.amountMinor) * 100,
  );
  const timePercent = Math.round(share(day, days.length) * 100);
  const last = spentPoints.at(-1) ?? [PAD, HEIGHT - PAD];
  const Icon = ahead ? TriangleAlert : Gauge;

  return (
    <section aria-labelledby={heading} className="mt-4">
      <h3 id={heading} className="sr-only">
        {t('today.pace.title')}
      </h3>
      <div
        role="meter"
        aria-labelledby={heading}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, spentPercent)}
        aria-valuetext={t('today.pace.value', { spentPercent, timePercent })}
      >
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          preserveAspectRatio="none"
          className="h-14 w-full"
        >
          <path
            d={line(pacePoints)}
            fill="none"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
            className="stroke-pace"
          />
          <path
            d={line(spentPoints)}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className={ahead ? 'stroke-hero-tight' : 'stroke-primary'}
          />
          <line
            x1={WIDTH - PAD}
            x2={WIDTH - PAD}
            y1={PAD}
            y2={HEIGHT - PAD}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="stroke-outline"
          />
        </svg>
        <span
          aria-hidden="true"
          className="pointer-events-none relative -mt-14 block h-14"
        >
          <span
            className={cn(
              'absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card',
              ahead ? 'bg-hero-tight' : 'bg-primary',
            )}
            style={{
              left: `${String((last[0] / WIDTH) * 100)}%`,
              top: `${String((last[1] / HEIGHT) * 100)}%`,
            }}
          />
        </span>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-body text-text-muted">
        <span className="font-mono tabular-nums">
          {t('today.pace.spent', {
            spent: formatMoney(spent, locale),
            budget: formatMoney(budget, locale),
          })}
        </span>
        <span className="font-mono tabular-nums">
          {t('today.pace.day', { day, days: days.length })}
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-text">
          <Icon aria-hidden className="size-4" />
          {ahead ? t('today.pace.ahead') : t('today.pace.onPace')}
        </span>
      </p>
    </section>
  );
}
