import {
  formatMoney,
  type BudgetStatusView,
  type CurrencyCode,
  type CycleSummaryView,
} from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { lazy, useId, useState } from 'react';
import { selectClass } from '@/components/field';
import { Card } from '@/components/ui/card';
import { ChartFrame, ChartTable } from '@/features/charts/chart-frame';
import { formatRange } from '@/features/cycles/format';
import { budgetsQuery } from '@/lib/budgets';
import { cyclesQuery } from '@/lib/ledger';
import { netWorthQuery } from '@/lib/plan';
import { t } from '@/messages/t';
import { formatRate, netWorthRows } from './plan-data.ts';

// Recharts loads with the first chart, never with the app.
const NetWorthChart = lazy(() =>
  import('@/features/charts/net-worth-chart').then((m) => ({
    default: m.NetWorthChart,
  })),
);

const RANGES = [30, 90, 365] as const;

function BudgetVsActual({
  status,
  locale,
}: {
  status: BudgetStatusView;
  locale: string;
}) {
  const heading = useId();
  const budgets = status.budgets.filter(
    (b) => b.target.kind !== 'buffer' || b.planned.amountMinor > 0,
  );
  return (
    <Card role="region" aria-labelledby={heading} className="grid gap-3">
      <h2 id={heading} className="text-title">
        {t('reports.plan.budgets.title')}
      </h2>
      {budgets.length === 0 ? (
        <p className="text-text-muted">{t('reports.plan.budgets.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <ChartTable
            caption={t('reports.plan.budgets.caption')}
            columns={[
              t('reports.plan.budgets.budget'),
              t('reports.plan.budgets.planned'),
              t('reports.plan.budgets.spent'),
              t('reports.plan.budgets.left'),
            ]}
            rows={budgets.map((b) => [
              b.id,
              b.name,
              formatMoney(b.planned, locale),
              formatMoney(b.spent, locale),
              formatMoney(b.left, locale),
            ])}
          />
        </div>
      )}
    </Card>
  );
}

function SavingsRate({
  cycles,
  locale,
}: {
  cycles: readonly CycleSummaryView[];
  locale: string;
}) {
  const heading = useId();
  return (
    <Card role="region" aria-labelledby={heading} className="grid gap-3">
      <h2 id={heading} className="text-title">
        {t('reports.plan.rate.title')}
      </h2>
      <p className="max-w-prose text-text-muted">
        {t('reports.plan.rate.intro')}
      </p>
      <div className="overflow-x-auto">
        <ChartTable
          caption={t('reports.plan.rate.caption')}
          columns={[
            t('reports.plan.rate.cycle'),
            t('reports.plan.rate.income'),
            t('reports.plan.rate.saved'),
            t('reports.plan.rate.rate'),
          ]}
          rows={cycles
            .slice(0, 12)
            .map((c) => [
              c.openedOn,
              formatRange(c.openedOn, c.lastDay, locale),
              formatMoney(c.income, locale),
              formatMoney(c.savingsNetChange, locale),
              c.savingsRate === null
                ? t('reports.plan.rate.none')
                : formatRate(c.savingsRate),
            ])}
        />
      </div>
    </Card>
  );
}

function NetWorth({
  currency,
  locale,
}: {
  currency: CurrencyCode;
  locale: string;
}) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(90);
  const worth = useQuery(netWorthQuery(days));
  const rangeId = useId();
  const title = t('reports.plan.netWorth.title');
  const rows =
    worth.data === undefined ? [] : netWorthRows(worth.data.series, locale);
  const first = rows[0];
  const last = rows.at(-1);
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <label htmlFor={rangeId} className="text-body">
          {t('reports.plan.netWorth.range')}
        </label>
        <select
          id={rangeId}
          className={`${selectClass} w-auto`}
          value={days}
          onChange={(e) => {
            setDays(
              RANGES.find((r) => String(r) === e.currentTarget.value) ?? 90,
            );
          }}
        >
          {RANGES.map((r) => (
            <option key={r} value={r}>
              {t('reports.plan.netWorth.days', { count: r })}
            </option>
          ))}
        </select>
      </div>
      {first === undefined || last === undefined ? (
        <p role="status" className="text-text-muted">
          {t('reports.loading')}
        </p>
      ) : (
        <ChartFrame
          testId="net-worth-chart"
          title={title}
          summary={t('reports.plan.netWorth.summary', {
            start: formatMoney(first.amount, locale),
            from: first.label,
            end: formatMoney(last.amount, locale),
          })}
          table={
            <ChartTable
              caption={t('reports.plan.netWorth.caption')}
              columns={[
                t('reports.plan.netWorth.day'),
                t('reports.plan.netWorth.total'),
              ]}
              rows={rows.map((r) => [
                r.key,
                r.label,
                formatMoney(r.amount, locale),
              ])}
            />
          }
          chart={
            <NetWorthChart
              rows={rows}
              currency={currency}
              locale={locale}
              title={title}
            />
          }
        />
      )}
    </div>
  );
}

/** Budget against actual, savings rate and net worth over time. */
export function PlanTab({
  currency,
  locale,
}: {
  currency: CurrencyCode;
  locale: string;
}) {
  const budgets = useQuery(budgetsQuery);
  const cycles = useQuery(cyclesQuery);
  return (
    <div className="grid gap-4">
      {budgets.data === undefined ? null : (
        <BudgetVsActual status={budgets.data} locale={locale} />
      )}
      {cycles.data === undefined ? null : (
        <SavingsRate cycles={cycles.data.cycles} locale={locale} />
      )}
      <NetWorth currency={currency} locale={locale} />
    </div>
  );
}
