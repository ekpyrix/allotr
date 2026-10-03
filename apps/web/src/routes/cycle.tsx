import type {
  BillView,
  CycleDayListView,
  CycleDetailView,
  CycleSummaryView,
  LocalDate,
  Money,
  TodayView,
} from '@allotr/shared';
import { formatMoney } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  CalendarCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  History,
} from 'lucide-react';
import { lazy, useId } from 'react';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { List, ListRow } from '@/components/ui/list';
import { StatusChip } from '@/components/ui/status-chip';
import { Tabs, TabsPanel } from '@/components/ui/tabs';
import { ChartFrame, ChartTable } from '@/features/charts/chart-frame';
import {
  categoryBars,
  categoryRows,
  dailyRows,
  isOver,
  lastRow,
  spendingRows,
} from '@/features/cycles/chart-data';
import { categoryNames, formatRange } from '@/features/cycles/format';
import {
  CategoryTotals,
  linkClass,
  MissingRates,
  PageState,
} from '@/features/cycles/parts';
import type { CycleTab } from '@/features/cycles/search';
import { formatLongDay, formatMoment } from '@/features/ledger/format';
import {
  allCategoriesQuery,
  cycleDaysQuery,
  cycleQuery,
  cyclesQuery,
  ledgerSettingsQuery,
  todayQuery,
} from '@/lib/ledger';
import { categoryStyles, type CategoryStyle } from '@/lib/category-style';
import { CategorySummarySection } from '@/features/reports/category-summary-section';
import { PlanTab } from '@/features/reports/plan-tab';
import { billsQuery } from '@/lib/settings';
import { t } from '@/messages/t';

// The cycle view (FR-W2, spec §11.4): a header card with the cycle's
// figures and links to the cycles either side, then tabs for its charts,
// its categories and, while it is open, its bills. Every figure and every
// chart point is the server's; nothing is summed here.

// Recharts loads with the first chart, never with the app.
const charts = () => import('@/features/charts/cycle-charts');
const SpendingChart = lazy(() =>
  charts().then((m) => ({ default: m.SpendingChart })),
);
const DailyChart = lazy(() =>
  charts().then((m) => ({ default: m.DailyChart })),
);
const CategoryChart = lazy(() =>
  charts().then((m) => ({ default: m.CategoryChart })),
);

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
    <p className="max-w-prose text-text-muted">
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

function HeaderFigures({
  items,
  locale,
}: {
  items: readonly (readonly [term: string, amount: Money, testId: string])[];
  locale: string;
}) {
  return (
    <dl
      aria-label={t('cycle.figuresLabel')}
      className="grid grid-cols-2 gap-x-4 gap-y-4 medium:grid-cols-4"
    >
      {items.map(([term, amount, testId]) => (
        <div key={term} className="grid content-start gap-1">
          <dt className="text-label text-text-muted">{term}</dt>
          <dd
            data-testid={testId}
            className="font-mono text-title-lg tabular-nums wrap-anywhere"
          >
            {formatMoney(amount, locale)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Links to the cycles either side; the list is newest first. */
function CycleNav({
  cycles,
  openedOn,
  locale,
}: {
  cycles: readonly CycleSummaryView[] | undefined;
  openedOn: LocalDate;
  locale: string;
}) {
  const at = cycles?.findIndex((c) => c.openedOn === openedOn) ?? -1;
  const older = at < 0 ? undefined : cycles?.[at + 1];
  const newer = at <= 0 ? undefined : cycles?.[at - 1];
  const link = (cycle: CycleSummaryView) =>
    cycle.closedOn === null ? {} : { start: cycle.openedOn };
  return (
    <nav
      aria-label={t('cycle.nav')}
      className="flex flex-wrap items-center gap-2"
    >
      {older === undefined ? null : (
        <Button asChild variant="tonal" size="dense">
          <Link to="/reports" search={link(older)}>
            <ChevronLeft aria-hidden />
            {t('cycle.previous')}
            <span className="sr-only">
              {' '}
              {formatRange(older.openedOn, older.lastDay, locale)}
            </span>
          </Link>
        </Button>
      )}
      {newer === undefined ? null : (
        <Button asChild variant="tonal" size="dense">
          <Link to="/reports" search={link(newer)}>
            {t('cycle.next')}
            <span className="sr-only">
              {' '}
              {formatRange(newer.openedOn, newer.lastDay, locale)}
            </span>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      )}
      <Button asChild variant="text" size="dense">
        <Link to="/reports/history">
          <History aria-hidden />
          {t('cycle.history')}
        </Link>
      </Button>
    </nav>
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
    <Card role="region" aria-labelledby={heading}>
      <h2 id={heading} className="text-title">
        {t('cycle.balances.title')}
      </h2>
      <table className="mt-2 w-full text-left">
        <thead className="text-label text-text-muted">
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
            <tr key={label} className="border-t border-outline-variant">
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
    </Card>
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
      className="rounded-lg bg-warning-container p-4"
    >
      <h2 id={heading} className="font-semibold">
        {t('cycle.amended.title')}
      </h2>
      <p className="mt-1 max-w-prose text-sm">
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
              to="/transactions"
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

function SpendingFrame({
  series,
  billDates,
  today,
  locale,
}: {
  series: CycleDayListView | undefined;
  billDates: readonly LocalDate[];
  today: LocalDate | null;
  locale: string;
}) {
  const title = t('cycle.spendingChart.title');
  const row = series === undefined ? undefined : lastRow(series.days);
  const spent = row?.cumulativeSpent ?? null;
  const summary =
    row === undefined || spent === null
      ? t('cycle.spendingChart.noDays')
      : t(
          spent.amountMinor > row.pace.amountMinor
            ? 'cycle.spendingChart.ahead'
            : 'cycle.spendingChart.within',
          {
            date: formatLongDay(row.date, locale),
            spent: formatMoney(spent, locale),
            pace: formatMoney(row.pace, locale),
          },
        );
  return (
    <ChartFrame
      testId="spending-chart"
      title={title}
      summary={
        billDates.length === 0
          ? summary
          : `${summary} ${t('cycle.spendingChart.bills')}`
      }
      table={
        <ChartTable
          caption={t('cycle.spendingChart.caption')}
          columns={[t('charts.day'), t('charts.spentSoFar'), t('charts.pace')]}
          rows={series === undefined ? [] : spendingRows(series.days, locale)}
        />
      }
      chart={
        series === undefined ? null : (
          <SpendingChart
            days={series.days}
            billDates={billDates}
            today={today}
            currency={series.budget.currency}
            locale={locale}
            title={title}
          />
        )
      }
    />
  );
}

function DailyFrame({
  series,
  locale,
}: {
  series: CycleDayListView | undefined;
  locale: string;
}) {
  const title = t('cycle.dailyChart.title');
  const past = series?.days.filter((day) => day.spent !== null) ?? [];
  const over = past.filter(isOver).length;
  return (
    <ChartFrame
      testId="daily-chart"
      title={title}
      summary={
        over === 0
          ? t('cycle.dailyChart.none', {
              count: past.length,
              total: past.length,
            })
          : t('cycle.dailyChart.over', { count: over, total: past.length })
      }
      table={
        <ChartTable
          caption={t('cycle.dailyChart.caption')}
          columns={[
            t('charts.day'),
            t('charts.spent'),
            t('charts.allowance'),
            t('charts.status'),
          ]}
          rows={series === undefined ? [] : dailyRows(series.days, locale)}
        />
      }
      chart={
        series === undefined ? null : (
          <DailyChart
            days={series.days}
            currency={series.budget.currency}
            locale={locale}
            title={title}
          />
        )
      }
    />
  );
}

function CategoryFrame({
  cycle,
  names,
  styles,
  locale,
}: {
  cycle: CycleDetailView;
  names: ReadonlyMap<string, string>;
  styles: ReadonlyMap<string, CategoryStyle>;
  locale: string;
}) {
  const title = t('cycle.categoryChart.title');
  const bars = categoryBars(cycle.spendingTop, names, styles);
  const [first] = bars;
  if (first === undefined)
    return (
      <Card>
        <h2 className="text-title">{title}</h2>
        <p className="mt-2 text-text-muted">{t('cycle.noSpending')}</p>
      </Card>
    );
  return (
    <ChartFrame
      testId="category-chart"
      title={title}
      // One row per bar, plus room for the axis.
      height={bars.length * 48 + 40}
      summary={t('cycle.categoryChart.summary', {
        name: first.name,
        amount: formatMoney(first.amount, locale),
      })}
      table={
        <ChartTable
          caption={t('cycle.categoryChart.caption')}
          columns={[t('charts.category'), t('charts.spent')]}
          rows={categoryRows(bars, locale)}
        />
      }
      chart={
        <CategoryChart
          bars={bars}
          currency={first.amount.currency}
          locale={locale}
          title={title}
        />
      }
    />
  );
}

function Bills({
  today,
  bills,
  locale,
}: {
  today: TodayView;
  bills: readonly BillView[] | undefined;
  locale: string;
}) {
  const heading = useId();
  const names = new Map(bills?.map((bill) => [bill.id, bill.name]));
  return (
    <section aria-labelledby={heading} className="grid gap-3">
      <h2 id={heading} className="text-title">
        {t('cycle.bills.title')}
      </h2>
      <p className="max-w-prose text-text-muted">{t('cycle.bills.intro')}</p>
      {today.cycleBills.length === 0 ? (
        <p className="text-text-muted">{t('cycle.bills.empty')}</p>
      ) : (
        <List>
          {today.cycleBills.map((bill) => (
            <ListRow
              key={`${bill.billId}-${bill.dueOn}`}
              leading={
                bill.paidOn === null ? <CalendarClock /> : <CalendarCheck />
              }
              title={names.get(bill.billId) ?? t('cycle.bills.unknown')}
              supporting={
                <span className="flex flex-wrap items-center gap-2">
                  {t('cycle.bills.due', {
                    date: formatLongDay(bill.dueOn, locale),
                  })}
                  {bill.paidOn === null ? (
                    <StatusChip tone="warning" icon={<CalendarClock />}>
                      {t('cycle.bills.reserved')}
                    </StatusChip>
                  ) : (
                    <StatusChip tone="success" icon={<CalendarCheck />}>
                      {t('cycle.bills.paid', {
                        date: formatLongDay(bill.paidOn, locale),
                      })}
                    </StatusChip>
                  )}
                </span>
              }
              trailing={formatMoney(bill.amount, locale)}
            />
          ))}
        </List>
      )}
      <Link to="/budget" className={linkClass}>
        {t('cycle.bills.manage')}
      </Link>
    </section>
  );
}

// The cycle view (FR-W2): the current cycle, or a past one by the day it
// opened. Every figure is the server's snapshot; nothing is summed here.
export function CyclePage({
  start,
  tab = 'overview',
}: {
  start: LocalDate | undefined;
  tab?: CycleTab | undefined;
}) {
  const navigate = useNavigate();
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const categories = useQuery(allCategoriesQuery);
  const openedOn = start ?? today.data?.cycle.openedOn;
  const cycle = useQuery(cycleQuery(openedOn));
  const series = useQuery(cycleDaysQuery(openedOn));
  const cycles = useQuery(cyclesQuery);
  const all = [settings, today, categories, cycle];
  const current = start === undefined || start === today.data?.cycle.openedOn;
  const bills = useQuery({ ...billsQuery, enabled: current });
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
        <Link to="/reports/history" className={linkClass}>
          {t('cycle.history')}
        </Link>
      </PageState>
    );

  const { locale, defaultCurrency, timeZone } = settings.data;
  const data = cycle.data;
  const open = data.closedOn === null;
  const names = categoryNames(categories.data.categories);
  const styles = categoryStyles(categories.data.categories);
  const tabs: { value: CycleTab; label: string }[] = [
    { value: 'overview', label: t('cycle.tabs.overview') },
    { value: 'days', label: t('cycle.tabs.days') },
    { value: 'categories', label: t('cycle.tabs.categories') },
    ...(open
      ? [{ value: 'bills' as const, label: t('cycle.tabs.bills') }]
      : []),
    { value: 'plan', label: t('cycle.tabs.plan') },
  ];
  const shownTab = !open && tab === 'bills' ? 'overview' : tab;
  const billDates = open ? today.data.cycleBills.map((bill) => bill.dueOn) : [];

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
      <div className="mt-4 grid gap-4">
        <Card variant="hero" className="grid gap-5 [view-transition-name:hero]">
          <Dates cycle={data} today={today.data} locale={locale} />
          <HeaderFigures
            locale={locale}
            items={[
              [t('cycle.income'), data.income, 'cycle-income'],
              [t('cycle.spending'), data.spending, 'cycle-spending'],
              [
                open ? t('cycle.available') : t('cycle.leftover'),
                data.leftover,
                'cycle-leftover',
              ],
              [
                t('cycle.savingsNetChange'),
                data.savingsNetChange,
                'cycle-savings',
              ],
            ]}
          />
          <CycleNav
            cycles={cycles.data?.cycles}
            openedOn={data.openedOn}
            locale={locale}
          />
        </Card>
        <Amendments cycle={data} locale={locale} timeZone={timeZone} />
        <MissingRates
          currencies={data.missingRates}
          defaultCurrency={defaultCurrency}
          date={formatLongDay(data.lastDay, locale)}
        />
        <CategorySummarySection
          openedOn={data.openedOn}
          categories={categories.data.categories}
          locale={locale}
        />
        <Tabs
          label={t('cycle.tabs.label')}
          tabs={tabs}
          value={shownTab}
          onValueChange={(next) => {
            void navigate({
              to: '/reports',
              search: {
                start,
                tab: next === 'overview' ? undefined : next,
              },
              replace: true,
              resetScroll: false,
            });
          }}
        >
          <TabsPanel value="overview" className="grid gap-4">
            <SpendingFrame
              series={series.data}
              billDates={billDates}
              today={open ? today.data.today : null}
              locale={locale}
            />
            <Balances cycle={data} locale={locale} />
          </TabsPanel>
          <TabsPanel value="days">
            <DailyFrame series={series.data} locale={locale} />
          </TabsPanel>
          <TabsPanel value="categories" className="grid gap-4">
            <CategoryFrame
              cycle={data}
              names={names}
              styles={styles}
              locale={locale}
            />
            {data.spendingTop.other === null ? null : (
              <CategoryTotals
                title={t('cycle.categoryChart.every')}
                empty={t('cycle.noSpending')}
                totals={data.spendingByCategory}
                names={names}
                locale={locale}
              />
            )}
            <CategoryTotals
              title={t('cycle.incomeTitle')}
              empty={t('cycle.noIncome')}
              totals={data.incomeByCategory}
              names={names}
              locale={locale}
            />
          </TabsPanel>
          <TabsPanel value="plan">
            <PlanTab currency={defaultCurrency} locale={locale} />
          </TabsPanel>
          {open ? (
            <TabsPanel value="bills">
              <Bills
                today={today.data}
                bills={bills.data?.bills}
                locale={locale}
              />
            </TabsPanel>
          ) : null}
        </Tabs>
      </div>
    </Page>
  );
}
