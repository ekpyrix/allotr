import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { localDate, type Money } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { Bar, ShareBar, SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { Row, TreeRow } from '@/components/row';
import { CategoryIcon, EmptyState } from '@/components/states';
import { Stats, type Stat } from '@/components/stats';
import { Columns } from '@/charts/columns';
import {
  IconArrowDownLine,
  IconArrowUpLine,
  IconBankLine,
  IconCalendarLine,
} from '@/generated/icons';
import { budgetsQuery } from '@/lib/budgets';
import {
  calendarQuery,
  categoriesQuery,
  cycleDaysQuery,
  cyclesQuery,
} from '@/lib/ledger';
import { seriesNumber } from '@/lib/category-style';
import { t } from '@/messages/t';
import { PeriodMenu } from './period-menu.tsx';
import { reportPayeesQuery, reportCategoriesQuery } from './summary-queries.ts';
import {
  budgetsByCategory,
  categoryRows,
  cycleDayFigures,
  cycleOf,
  dayChart,
  monthDayFigures,
  periodTotal,
  reportParams,
  shareSegments,
  sharePercent,
  statFigures,
  visibleRows,
  type CategoryRow,
  type ReportParams,
} from './summary-model.ts';
import { useReportRange } from './use-report-range.ts';

const locale = 'en';
// Only a placeholder key for the month read, which waits until dates exist.
const FALLBACK_DAY = localDate('2000-01-01');

const categoryColumns = [
  { width: 'minmax(0,1fr)' },
  { width: '5rem', from: 'medium' },
  { width: '5.5rem' },
  { width: '5.5rem', from: 'medium' },
  { width: '3.5rem', from: 'wide' },
] as const;

const payeeColumns = [
  { width: 'minmax(0,1fr)' },
  { width: '5rem', from: 'medium' },
  { width: '6rem' },
] as const;

/** A tile body for a failed read, with a retry. */
export function ReportFailed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 py-2 text-small">
      <span className="text-negative">{t('reportsSummary.loadFailed')}</span>
      <BracketButton onPress={retry}>{t('reportsSummary.retry')}</BracketButton>
    </div>
  );
}

// Summary (docs/ui.md §6): the period's figures, spending by category, top
// payees and spending per day. Every amount is the server's.
export function SummaryTab() {
  const { period, range, ready } = useReportRange();
  const params = reportParams(period, range);
  if (ready && params === null) {
    return (
      <>
        <PeriodMenu />
        <Grid>
          <Tile title={t('reportsShell.period.last-cycle')} span="full">
            <EmptyState
              title={t('reportsShell.period.last-cycle')}
              hint={t('reportsShell.noCycle')}
            />
          </Tile>
        </Grid>
      </>
    );
  }
  if (!ready || params === null) {
    return (
      <>
        <PeriodMenu />
        <Grid>
          <SkeletonTile span="full" />
          <SkeletonTile span={2} rows={5} />
          <SkeletonTile rows={4} />
        </Grid>
      </>
    );
  }
  return (
    <>
      <PeriodMenu />
      <StatsRow params={params} />
      <Grid>
        <CategoriesTile params={params} />
        <PayeesTile params={params} />
        <DaysTile params={params} />
      </Grid>
    </>
  );
}

function StatsRow({ params }: { params: ReportParams }) {
  const { period } = useReportRange();
  const cycles = useQuery(cyclesQuery);
  const summary = useQuery(reportCategoriesQuery(params, 1));
  if (cycles.data === undefined || summary.data === undefined) {
    return <SkeletonTile span="full" rows={2} />;
  }
  const cycle = cycleOf(period, cycles.data.cycles);
  const figures = statFigures(cycle, periodTotal(summary.data));
  const missing = t('reportsSummary.stats.needsServer');
  const money = (amount: Money | null) =>
    amount === null ? '—' : <Amount amount={amount} locale={locale} />;
  const stats: Stat[] = [
    {
      label: t('reportsSummary.stats.spent'),
      icon: IconArrowDownLine,
      figure: money(figures.spent),
      tone: 'primary',
    },
    {
      label: t('reportsSummary.stats.income'),
      icon: IconArrowUpLine,
      figure: money(figures.income),
      ...(figures.income === null ? { sub: missing } : {}),
    },
    {
      label: t('reportsSummary.stats.saved'),
      icon: IconBankLine,
      figure: money(figures.saved),
      ...(figures.saved === null ? { sub: missing } : {}),
    },
    {
      // The server sends no daily average yet; the browser does not divide.
      label: t('reportsSummary.stats.average'),
      icon: IconCalendarLine,
      figure: '—',
      sub: missing,
    },
  ];
  return <Stats stats={stats} />;
}

function CategoriesTile({ params }: { params: ReportParams }) {
  const { period } = useReportRange();
  const summary = useQuery(reportCategoriesQuery(params, 1));
  const categories = useQuery(categoriesQuery);
  const budgets = useQuery(budgetsQuery);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(
    () =>
      summary.data === undefined
        ? []
        : categoryRows(
            summary.data,
            periodTotal(summary.data),
            categories.data?.categories ?? [],
            budgetsByCategory(
              budgets.data?.budgets ?? [],
              period,
              budgets.data?.periodRule ?? 'cycle',
            ),
          ),
    [summary.data, categories.data, budgets.data, period],
  );
  if (summary.isError) {
    return (
      <Tile title={t('reportsSummary.categories.title')} span={2}>
        <ReportFailed
          retry={() => {
            void summary.refetch();
          }}
        />
      </Tile>
    );
  }
  if (summary.data === undefined) return <SkeletonTile span={2} rows={5} />;
  const shown = visibleRows(rows, folded);
  const toggle = (group: string) => {
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });
  };
  const top = rows.filter((r) => r.role === 'parent' || r.role === 'flat');
  return (
    <Tile
      title={t('reportsSummary.categories.title')}
      subtitle={t('reportsSummary.categories.subtitle', { count: top.length })}
      span={2}
      bodyClassName="px-0 pb-0"
    >
      {rows.length === 0 ? (
        <EmptyState
          title={t('reportsSummary.categories.emptyTitle')}
          hint={t('reportsSummary.categories.emptyHint')}
        />
      ) : (
        <>
          <div className="px-3 pb-2 pt-2">
            <ShareBar
              segments={shareSegments(rows)}
              label={t('reportsSummary.categories.share')}
            />
          </div>
          {shown.map((row) => (
            <CategoryLine
              key={row.key}
              row={row}
              folded={folded.has(row.group)}
              onToggle={() => {
                toggle(row.group);
              }}
            />
          ))}
        </>
      )}
    </Tile>
  );
}

function CategoryLine({
  row,
  folded,
  onToggle,
}: {
  row: CategoryRow;
  folded: boolean;
  onToggle: () => void;
}) {
  const share = sharePercent(row.fraction);
  const cells = [
    <span key="name" className="flex min-w-0 items-center gap-2">
      {row.icon === null ? null : (
        <CategoryIcon name={row.icon} color={seriesNumber(row.colour)} />
      )}
      <span className="truncate font-sans">{row.name}</span>
    </span>,
    <Bar
      key="bar"
      value={row.fraction}
      over={row.over}
      label={t('reportsSummary.categories.barLabel', {
        name: row.name,
        share,
      })}
    />,
    <Amount key="spent" amount={row.amount} locale={locale} />,
    row.budget === null ? (
      <span key="budget" className="text-text-muted">
        —
      </span>
    ) : (
      <Amount key="budget" amount={row.budget} locale={locale} />
    ),
    <span key="share" className="num text-text-muted">
      {share}
    </span>,
  ];
  if (row.role === 'flat') {
    return (
      <Row
        columns={[{ width: '1.5rem' }, ...categoryColumns]}
        cells={[null, ...cells]}
      />
    );
  }
  return (
    <TreeRow
      role={row.role}
      expanded={!folded}
      onToggle={onToggle}
      label={t('reportsSummary.categories.fold', { name: row.name })}
      columns={categoryColumns}
      cells={cells}
    />
  );
}

function PayeesTile({ params }: { params: ReportParams }) {
  const payees = useQuery(reportPayeesQuery(params));
  if (payees.isError) {
    return (
      <Tile title={t('reportsSummary.payees.title')}>
        <ReportFailed
          retry={() => {
            void payees.refetch();
          }}
        />
      </Tile>
    );
  }
  if (payees.data === undefined) return <SkeletonTile rows={4} />;
  const sections = payees.data.currencies.filter(
    (c) => c.payees.length > 0 || c.unnamed !== null,
  );
  const several = sections.length > 1;
  return (
    <Tile
      title={t('reportsSummary.payees.title')}
      subtitle={t('reportsSummary.payees.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      {sections.length === 0 ? (
        <EmptyState
          title={t('reportsSummary.payees.emptyTitle')}
          hint={t('reportsSummary.payees.emptyHint')}
        />
      ) : (
        sections.map((section) => (
          <div key={section.currency}>
            {several ? (
              <p className="border-b px-3 py-1 text-small text-text-muted">
                {t('reportsSummary.payees.currency', {
                  currency: section.currency,
                })}
              </p>
            ) : null}
            {section.payees.map((p) => (
              <Row
                key={p.payee}
                columns={payeeColumns}
                cells={[
                  <span key="n" className="font-sans">
                    {p.payee}
                  </span>,
                  <span key="c" className="num text-text-muted">
                    {t('reportsSummary.payees.entries', { count: p.count })}
                  </span>,
                  <Amount key="t" amount={p.total} locale={locale} />,
                ]}
              />
            ))}
            {section.unnamed === null ? null : (
              <Row
                columns={payeeColumns}
                cells={[
                  <span key="n" className="font-sans text-text-muted">
                    {t('reportsSummary.payees.unnamed')}
                  </span>,
                  <span key="c" className="num text-text-muted">
                    {t('reportsSummary.payees.entries', {
                      count: section.unnamed.count,
                    })}
                  </span>,
                  <Amount
                    key="t"
                    amount={section.unnamed.total}
                    locale={locale}
                  />,
                ]}
              />
            )}
            {section.more === 0 ? null : (
              <p className="border-b px-3 py-1 text-small text-text-muted">
                {t('reportsSummary.payees.more', { count: section.more })}
              </p>
            )}
          </div>
        ))
      )}
    </Tile>
  );
}

function DaysTile({ params }: { params: ReportParams }) {
  const { period, range } = useReportRange();
  const cycles = useQuery(cyclesQuery);
  const cycle = cycleOf(period, cycles.data?.cycles ?? []);
  const days = useQuery(cycleDaysQuery(cycle?.openedOn));
  const calendar = useQuery({
    ...calendarQuery(range?.from ?? FALLBACK_DAY, range?.to ?? FALLBACK_DAY),
    enabled: params.period === 'month' && range?.from !== undefined,
  });
  const source = params.period === 'cycle' ? days : calendar;
  if (source.isError) {
    return (
      <Tile title={t('reportsSummary.days.title')} span="full">
        <ReportFailed
          retry={() => {
            void source.refetch();
          }}
        />
      </Tile>
    );
  }
  const figures =
    params.period === 'cycle'
      ? days.data === undefined
        ? undefined
        : cycleDayFigures(days.data.days)
      : calendar.data === undefined
        ? undefined
        : monthDayFigures(calendar.data);
  if (figures === undefined) return <SkeletonTile span="full" rows={3} />;
  const chart = dayChart(figures, locale);
  return (
    <Tile
      title={t('reportsSummary.days.title')}
      subtitle={
        params.period === 'cycle'
          ? t('reportsSummary.days.subtitle')
          : undefined
      }
      span="full"
      bodyClassName="px-0"
    >
      {chart.columns.length === 0 ? (
        <EmptyState
          title={t('reportsSummary.days.emptyTitle')}
          hint={t('reportsSummary.days.emptyHint')}
        />
      ) : (
        <>
          <Columns
            data={chart.columns}
            label={
              params.period === 'cycle'
                ? t('reportsSummary.days.summary', { over: chart.overCount })
                : t('reportsSummary.days.summaryPlain')
            }
          />
          <table className="sr-only">
            <caption>{t('reportsSummary.days.caption')}</caption>
            <thead>
              <tr>
                <th>{t('reportsSummary.days.day')}</th>
                <th>{t('reportsSummary.days.spent')}</th>
                <th>{t('reportsSummary.days.over')}</th>
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((cells) => (
                <tr key={cells[0]}>
                  {cells.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Tile>
  );
}
