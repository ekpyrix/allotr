import type { CycleDetailView, LocalDate, TodayView } from '@allotr/shared';
import { formatMoney } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { useId } from 'react';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import { categoryNames, formatRange } from '@/features/cycles/format';
import {
  CategoryTotals,
  Figures,
  linkClass,
  MissingRates,
  PageState,
} from '@/features/cycles/parts';
import { formatLongDay, formatMoment } from '@/features/ledger/format';
import {
  allCategoriesQuery,
  cycleQuery,
  ledgerSettingsQuery,
  todayQuery,
} from '@/lib/ledger';
import { t } from '@/messages/t';

function Dates({
  cycle,
  today,
  locale,
}: {
  cycle: CycleDetailView;
  today: TodayView;
  locale: string;
}) {
  const opened = formatLongDay(cycle.openedOn, locale);
  return (
    <p className="mt-3 max-w-prose text-muted-foreground">
      {cycle.openedBy === null
        ? t('cycle.opened', { date: opened })
        : t('cycle.openedByPaycheck', { date: opened })}{' '}
      {cycle.closedOn !== null
        ? t('cycle.closed', { date: formatLongDay(cycle.closedOn, locale) })
        : today.overdue
          ? t('cycle.overdue')
          : t('cycle.payday', {
              date: formatLongDay(today.cycleEnd, locale),
              count: today.daysLeft,
            })}
    </p>
  );
}

function Balances({
  cycle,
  locale,
}: {
  cycle: CycleDetailView;
  locale: string;
}) {
  const heading = useId();
  const current = cycle.closedOn === null;
  const rows = [
    [t('cycle.balances.on'), cycle.opening.on, cycle.closing.on],
    [t('cycle.balances.off'), cycle.opening.off, cycle.closing.off],
  ] as const;
  return (
    <section aria-labelledby={heading} className="mt-10">
      <h2 id={heading} className="text-xl font-semibold">
        {t('cycle.balances.title')}
      </h2>
      <table className="mt-3 w-full text-left">
        <thead className="text-sm text-muted-foreground">
          <tr>
            <td />
            <th scope="col" className="py-2 text-right font-normal">
              {t('cycle.balances.opening')}
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              {current ? t('cycle.balances.now') : t('cycle.balances.closing')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, opening, closing]) => (
            <tr key={label} className="border-t border-border">
              <th scope="row" className="py-2 pr-2 font-normal">
                {label}
              </th>
              <td className="py-2 text-right font-mono tabular-nums wrap-anywhere">
                {formatMoney(opening, locale)}
              </td>
              <td className="py-2 pl-2 text-right font-mono tabular-nums wrap-anywhere">
                {formatMoney(closing, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Amendments({
  cycle,
  locale,
  timeZone,
}: {
  cycle: CycleDetailView;
  locale: string;
  timeZone: string;
}) {
  const heading = useId();
  if (cycle.amendments.length === 0) return null;
  return (
    <section
      aria-labelledby={heading}
      data-testid="amendments"
      className="mt-8 rounded-md border border-border p-4"
    >
      <h2 id={heading} className="font-semibold">
        {t('cycle.amended.title')}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        {t('cycle.amended.intro', { count: cycle.amendments.length })}
      </p>
      <ul className="mt-3 grid gap-2">
        {cycle.amendments.map((entry) => (
          <li key={entry.transactionId} className="grid gap-1 text-sm">
            <span>
              {entry.note === null ? null : (
                <span className="font-medium">{entry.note}: </span>
              )}
              {t('cycle.amended.entry', {
                kind: t(`ledger.kinds.${entry.kind}`),
                date: formatLongDay(entry.occurredOn, locale),
                recorded: formatMoment(entry.recordedAt, locale, timeZone),
              })}
            </span>
            <Link
              to="/ledger"
              search={{ entry: entry.transactionId }}
              className={linkClass}
            >
              {t('cycle.amended.show')}
              <span className="sr-only">
                {' '}
                {entry.note ?? t(`ledger.kinds.${entry.kind}`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The cycle view (FR-W2): the current cycle, or a past one by the day it
// opened. Every figure is the server's snapshot; nothing is summed here.
export function CyclePage({ start }: { start: LocalDate | undefined }) {
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const categories = useQuery(allCategoriesQuery);
  const cycle = useQuery(cycleQuery(start ?? today.data?.cycle.openedOn));
  const all = [settings, today, categories, cycle];
  const current = start === undefined || start === today.data?.cycle.openedOn;
  const loadingTitle = current ? t('cycle.title') : t('history.title');

  if (
    settings.data === undefined ||
    today.data === undefined ||
    categories.data === undefined ||
    cycle.data === undefined
  )
    return (
      <PageState
        title={loadingTitle}
        loading={t('cycle.loading')}
        queries={all}
      >
        <Link to="/history" className={linkClass}>
          {t('cycle.history')}
        </Link>
      </PageState>
    );

  const { locale, defaultCurrency, timeZone } = settings.data;
  const data = cycle.data;
  const open = data.closedOn === null;
  const names = categoryNames(categories.data.categories);

  return (
    <Page
      title={
        open
          ? t('cycle.title')
          : t('cycle.pastTitle', {
              range: formatRange(data.openedOn, data.lastDay, locale),
            })
      }
    >
      <Dates cycle={data} today={today.data} locale={locale} />
      <Amendments cycle={data} locale={locale} timeZone={timeZone} />
      <Figures
        label={t('cycle.figuresLabel')}
        locale={locale}
        items={[
          [t('cycle.income'), data.income, 'cycle-income'],
          [t('cycle.spending'), data.spending, 'cycle-spending'],
          [
            open ? t('cycle.available') : t('cycle.leftover'),
            data.leftover,
            'cycle-leftover',
          ],
          [t('cycle.savingsNetChange'), data.savingsNetChange, 'cycle-savings'],
        ]}
      />
      <MissingRates
        currencies={data.missingRates}
        defaultCurrency={defaultCurrency}
        date={formatLongDay(data.lastDay, locale)}
      />
      <CategoryTotals
        title={t('cycle.spendingTitle')}
        empty={t('cycle.noSpending')}
        totals={data.spendingByCategory}
        names={names}
        locale={locale}
      />
      <CategoryTotals
        title={t('cycle.incomeTitle')}
        empty={t('cycle.noIncome')}
        totals={data.incomeByCategory}
        names={names}
        locale={locale}
      />
      <Balances cycle={data} locale={locale} />
      <Button asChild variant="outline" className="mt-10">
        <Link to="/history">
          <History aria-hidden />
          {t('cycle.history')}
        </Link>
      </Button>
    </Page>
  );
}
