import { formatMoney, money, type TodayView } from '@allotr/shared';
import { Gauge, TriangleAlert } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { paceOf } from './pace.ts';

// The cycle's spending against an even pace. The fill is the share spent,
// the tick the share of days gone; the words say the same, so neither
// colour nor the picture carries it alone.
export function PaceMeter({
  figures,
  locale,
}: {
  figures: TodayView;
  locale: string;
}) {
  const heading = useId();
  const pace = paceOf(figures);
  if (pace === null) return null;
  const { paceSpent, available } = figures;
  const budget = money(
    Math.max(0, paceSpent.amountMinor + available.amountMinor),
    paceSpent.currency,
  );
  const fill = Math.min(100, pace.spentPercent);
  const Icon = pace.ahead ? TriangleAlert : Gauge;

  return (
    <section aria-labelledby={heading} className="mt-10">
      <h2 id={heading} className="font-medium">
        {t('today.pace.title')}
      </h2>
      <div
        role="meter"
        aria-labelledby={heading}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fill}
        aria-valuetext={t('today.pace.value', {
          spentPercent: pace.spentPercent,
          timePercent: pace.timePercent,
        })}
        className="relative mt-3 h-3 rounded-full border border-input bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full',
            pace.ahead ? 'bg-over' : 'bg-foreground',
          )}
          style={{ width: `${String(fill)}%` }}
        />
        <div
          title={t('today.pace.timeMarker')}
          className="absolute -top-1 -bottom-1 w-0.5 bg-today-text"
          style={{ left: `calc(${String(pace.timePercent)}% - 1px)` }}
        />
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="font-mono tabular-nums">
          {t('today.pace.spent', {
            spent: formatMoney(paceSpent, locale),
            budget: formatMoney(budget, locale),
          })}
        </span>
        <span className="font-mono tabular-nums">
          {t('today.pace.day', { day: pace.day, days: pace.days })}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-medium',
            pace.ahead ? 'text-over' : 'text-foreground',
          )}
        >
          <Icon aria-hidden className="size-4" />
          {pace.ahead ? t('today.pace.ahead') : t('today.pace.onPace')}
        </span>
      </p>
    </section>
  );
}
