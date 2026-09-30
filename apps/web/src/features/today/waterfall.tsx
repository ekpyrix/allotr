import { formatMoney, type Money, type TodayView } from '@allotr/shared';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { formatAbs } from './format.ts';

// "Where today's number comes from" (spec §10): the product's promise as a
// waterfall. On-budget money, less bills set aside, is what is available;
// with today's spending added back it is the start of the day, split over
// the days left into today's allowance, and today's spending comes off
// that. Savings sit beside it, greyed and never counted. Every figure is a
// field of /v1/today or the accounts' off-budget total; nothing is worked
// out here. A table shows the same numbers.

type Step = Readonly<{
  label: string;
  /** Shown with a sign: '+', '−', '=' or none. */
  sign: '' | '+' | '−' | '=' | '÷';
  amount: Money | null;
  text?: string;
  tone?: 'total' | 'muted';
}>;

function steps(figures: TodayView, savings: Money | null): Step[] {
  return [
    {
      label: t('today.waterfall.onBudget'),
      sign: '',
      amount: figures.onBudget,
    },
    {
      label: t('today.waterfall.reserved'),
      sign: '−',
      amount: figures.reserved,
    },
    {
      label: t('today.waterfall.available'),
      sign: '=',
      amount: figures.available,
      tone: 'total',
    },
    {
      label: t('today.waterfall.spentBack'),
      sign: '+',
      amount: figures.spentToday,
    },
    {
      label: t('today.waterfall.startOfDay'),
      sign: '=',
      amount: figures.startOfDay,
      tone: 'total',
    },
    {
      label: t('today.waterfall.split', { count: figures.daysLeft }),
      sign: '÷',
      amount: null,
      text: String(figures.daysLeft),
    },
    {
      label: t('today.waterfall.allowance'),
      sign: '=',
      amount: figures.todayAllowance,
      tone: 'total',
    },
    {
      label: t('today.waterfall.spentToday'),
      sign: '−',
      amount: figures.spentToday,
    },
    {
      label: t('today.waterfall.leftToday'),
      sign: '=',
      amount: figures.leftToday,
      tone: 'total',
    },
    ...(savings === null
      ? []
      : [
          {
            label: t('today.waterfall.savings'),
            sign: '' as const,
            amount: savings,
            tone: 'muted' as const,
          },
        ]),
  ];
}

function shown(step: Step, locale: string): string {
  if (step.amount === null) return step.text ?? '';
  const sign = step.sign === '+' || step.sign === '−' ? `${step.sign} ` : '';
  return `${sign}${sign === '' ? formatMoney(step.amount, locale) : formatAbs(step.amount, locale)}`;
}

export function Waterfall({
  figures,
  savings,
  locale,
  className,
}: {
  figures: TodayView;
  /** The off-budget total, when known. */
  savings: Money | null;
  locale: string;
  className?: string;
}) {
  const [table, setTable] = useState(false);
  const captionId = useId();
  const rows = steps(figures, savings);
  // Bars share one scale: the largest amount shown.
  const largest = Math.max(
    1,
    ...rows.map((row) => Math.abs(row.amount?.amountMinor ?? 0)),
  );

  return (
    <div className={className}>
      <p id={captionId} className="text-body text-text-muted">
        {t('today.waterfall.intro')}
      </p>
      {table ? (
        <table aria-describedby={captionId} className="mt-4 w-full text-body">
          <thead>
            <tr className="border-b border-outline-variant text-left text-label text-text-muted">
              <th scope="col" className="py-2 font-medium">
                {t('today.waterfall.step')}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t('today.waterfall.amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-outline-variant last:border-b-0"
              >
                <th scope="row" className="py-2 text-left font-normal">
                  {row.label}
                </th>
                <td className="py-2 text-right font-mono tabular-nums">
                  {shown(row, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ol aria-describedby={captionId} className="mt-4 grid gap-2">
          {rows.map((row) => {
            const width =
              row.amount === null
                ? 0
                : Math.round(
                    (Math.abs(row.amount.amountMinor) / largest) * 1000,
                  ) / 10;
            return (
              <li key={row.label} className="grid gap-1">
                <div
                  className={cn(
                    'flex items-baseline justify-between gap-3 text-body',
                    row.tone === 'total' && 'font-semibold',
                    row.tone === 'muted' && 'text-text-muted',
                  )}
                >
                  <span>{row.label}</span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {shown(row, locale)}
                  </span>
                </div>
                {row.amount === null ? null : (
                  <span
                    aria-hidden="true"
                    className="block h-2 overflow-hidden rounded-full bg-card-raised"
                  >
                    <span
                      className={cn(
                        'block h-full origin-left rounded-full',
                        row.tone === 'muted'
                          ? 'bg-outline-variant'
                          : row.sign === '−'
                            ? 'bg-reserved'
                            : row.tone === 'total'
                              ? 'bg-primary'
                              : 'bg-series-1',
                      )}
                      style={{ transform: `scaleX(${String(width / 100)})` }}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Button
        variant="text"
        size="dense"
        className="mt-3 -ml-4"
        aria-pressed={table}
        onClick={() => {
          setTable(!table);
        }}
      >
        {t('today.waterfall.showTable')}
      </Button>
    </div>
  );
}
