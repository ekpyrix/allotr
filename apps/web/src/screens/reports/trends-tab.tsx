import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { Grid, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { EmptyState } from '@/components/states';
import { Chart } from '@/charts/chart';
import { Columns } from '@/charts/columns';
import { categoriesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { PeriodMenu } from './period-menu.tsx';
import { ReportFailed } from './summary-tab.tsx';
import { reportCategoriesQuery } from './summary-queries.ts';
import { reportParams } from './summary-model.ts';
import {
  TREND_PERIODS,
  hasSpending,
  totalsColumns,
  trendLines,
  versusRows,
} from './trends-model.ts';
import { useReportRange } from './use-report-range.ts';

const locale = 'en';

const versusColumns = [
  { width: 'minmax(0,1fr)' },
  { width: '5.5rem' },
  { width: '5.5rem', from: 'medium' },
  { width: '4rem' },
] as const;

// Trends (docs/ui.md §6): category spending across the last periods, the
// selected period against the one before, and the total per period. Every
// figure comes from one `/v1/reports/categories?series=N` read.
export function TrendsTab() {
  const { period, range, ready } = useReportRange();
  const params = reportParams(period, range);
  const summary = useQuery({
    ...reportCategoriesQuery(params ?? { period: 'cycle' }, TREND_PERIODS),
    enabled: params !== null,
  });
  const categories = useQuery(categoriesQuery);

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
  if (summary.isError) {
    return (
      <>
        <PeriodMenu />
        <Grid>
          <Tile title={t('reportsSummary.trends.linesTitle')} span="full">
            <ReportFailed
              retry={() => {
                void summary.refetch();
              }}
            />
          </Tile>
        </Grid>
      </>
    );
  }
  const series = summary.data?.series;
  if (!ready || series === undefined) {
    return (
      <>
        <PeriodMenu />
        <Grid>
          <SkeletonTile span={2} rows={5} />
          <SkeletonTile rows={4} />
          <SkeletonTile span="full" rows={3} />
        </Grid>
      </>
    );
  }
  const cats = categories.data?.categories ?? [];
  if (!hasSpending(series)) {
    return (
      <>
        <PeriodMenu />
        <Grid>
          <Tile title={t('reportsSummary.trends.linesTitle')} span="full">
            <EmptyState
              title={t('reportsSummary.trends.emptyTitle')}
              hint={t('reportsSummary.trends.emptyHint')}
            />
          </Tile>
        </Grid>
      </>
    );
  }
  const count = series.periods.length;
  const lines = trendLines(series, cats, locale);
  const versus = versusRows(series, cats);
  const totals = totalsColumns(series, locale);
  return (
    <>
      <PeriodMenu />
      <Grid>
        <Tile
          title={t('reportsSummary.trends.linesTitle')}
          subtitle={t('reportsSummary.trends.linesSubtitle', { count })}
          span={2}
          bodyClassName="px-0"
        >
          <Chart
            label={t('reportsSummary.trends.linesSummary', { count })}
            series={lines.series}
            yTicks={lines.yTicks}
            xTicks={lines.xTicks}
            table={lines.table}
          />
          <ul className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-2 text-small">
            {lines.series.map((s) => (
              <li key={s.id} className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-3"
                  style={{ background: `var(--${s.color})` }}
                />
                <span className="truncate font-sans">{s.label}</span>
              </li>
            ))}
          </ul>
        </Tile>
        <Tile
          title={t('reportsSummary.trends.vsTitle')}
          subtitle={t('reportsSummary.trends.vsSubtitle')}
          bodyClassName="px-0 pb-0"
        >
          <Row
            columns={versusColumns}
            className="text-small text-text-muted"
            cells={[
              t('reportsSummary.trends.category'),
              t('reportsSummary.trends.thisPeriod'),
              t('reportsSummary.trends.lastPeriod'),
              null,
            ]}
          />
          {versus.map((row) => (
            <Row
              key={row.key}
              columns={versusColumns}
              cells={[
                <span key="n" className="font-sans">
                  {row.name}
                </span>,
                <Amount key="c" amount={row.current} locale={locale} />,
                row.previous === null ? null : (
                  <Amount key="p" amount={row.previous} locale={locale} />
                ),
                row.movement === null ? null : (
                  <span key="m" className="num text-text-muted">
                    {row.movement === 'up'
                      ? `↑ ${t('reportsSummary.trends.up')}`
                      : row.movement === 'down'
                        ? `↓ ${t('reportsSummary.trends.down')}`
                        : `↔ ${t('reportsSummary.trends.same')}`}
                  </span>
                ),
              ]}
            />
          ))}
        </Tile>
        <Tile
          title={t('reportsSummary.trends.totalsTitle')}
          subtitle={t('reportsSummary.trends.totalsSubtitle', { count })}
          span="full"
          bodyClassName="px-0"
        >
          <Columns
            data={totals.columns}
            label={t('reportsSummary.trends.totalsSummary', { count })}
          />
          <table className="sr-only">
            <caption>{t('reportsSummary.trends.totalsCaption')}</caption>
            <thead>
              <tr>
                <th>{t('reportsSummary.trends.period')}</th>
                <th>{t('reportsSummary.trends.spent')}</th>
              </tr>
            </thead>
            <tbody>
              {totals.rows.map((cells) => (
                <tr key={cells[0]}>
                  {cells.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Tile>
      </Grid>
    </>
  );
}
