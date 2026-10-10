import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { Bar, SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { EmptyState } from '@/components/states';
import { Chart } from '@/charts/chart';
import { Columns } from '@/charts/columns';
import { formatDay } from '@/features/today/format';
import { formatMoney } from '@/lib/format-money';
import { budgetsQuery } from '@/lib/budgets';
import { cyclesQuery } from '@/lib/ledger';
import { netWorthQuery } from '@/lib/plan';
import { t } from '@/messages/t';
import { netWorthChart } from '../dashboard/tiles/net-worth-model.ts';
import { recentCycles } from './cycles-model.ts';
import { PeriodMenu } from './period-menu.tsx';
import { budgetRows, rateColumns, worthDays } from './plan-model.ts';
import { useReportRange } from './use-report-range.ts';

const locale = 'en';

const columns = [
  { width: 'minmax(0,1fr)' },
  { width: '4.5rem' },
  { width: '5.5rem' },
  { width: '5.5rem', from: 'medium' },
] as const;

function Failed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 py-2 text-small">
      <span className="text-negative">{t('reportsPlan.loadFailed')}</span>
      <BracketButton onPress={retry}>{t('reportsPlan.retry')}</BracketButton>
    </div>
  );
}

// Plan (docs/ui.md §6): budgets against what was spent, the savings rate per
// cycle and net worth over the period. Figures are the server's. The period
// menu sets the net worth span; budgets are always the current period and
// the rates cover the newest cycles.
export function PlanTab() {
  return (
    <>
      <PeriodMenu />
      <Grid>
        <BudgetTile />
        <RateTile />
        <NetWorthTile />
      </Grid>
    </>
  );
}

function BudgetTile() {
  const status = useQuery(budgetsQuery);
  const rows = status.data === undefined ? [] : budgetRows(status.data.budgets);
  return (
    <Tile
      title={t('reportsPlan.budget.title')}
      subtitle={t('reportsPlan.budget.subtitle')}
      span={2}
      bodyClassName="px-0 pb-0"
    >
      {status.isError ? (
        <div className="px-3">
          <Failed
            retry={() => {
              void status.refetch();
            }}
          />
        </div>
      ) : status.data === undefined ? (
        <div className="px-3">
          <SkeletonTile rows={4} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('reportsPlan.budget.emptyTitle')}
          hint={t('reportsPlan.budget.emptyHint')}
        />
      ) : (
        rows.map((row) => (
          <Row
            key={row.key}
            columns={columns}
            cells={[
              <span key="n" className="font-sans">
                {row.name}
              </span>,
              <Bar
                key="b"
                value={row.fraction}
                over={row.over}
                label={t('reportsPlan.budget.barLabel', { name: row.name })}
              />,
              <Amount key="s" amount={row.budget.spent} />,
              <Amount key="p" amount={row.budget.planned} />,
            ]}
          />
        ))
      )}
    </Tile>
  );
}

function RateTile() {
  const cycles = useQuery(cyclesQuery);
  const list = cycles.data?.cycles;
  return (
    <Tile
      title={t('reportsPlan.rate.title')}
      subtitle={t('reportsPlan.rate.subtitle')}
      bodyClassName="px-0"
    >
      {cycles.isError ? (
        <div className="px-3">
          <Failed
            retry={() => {
              void cycles.refetch();
            }}
          />
        </div>
      ) : list === undefined ? (
        <div className="px-3">
          <SkeletonTile />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={t('reportsPlan.rate.emptyTitle')}
          hint={t('reportsPlan.rate.emptyHint')}
        />
      ) : (
        <Columns
          label={t('reportsPlan.rate.summary')}
          data={rateColumns(recentCycles(list), locale)}
        />
      )}
    </Tile>
  );
}

function NetWorthTile() {
  const { range, today, ready } = useReportRange();
  const days =
    ready && today !== undefined && range !== null
      ? worthDays(range.from, today)
      : undefined;
  const worth = useQuery({
    ...netWorthQuery(days ?? 30),
    enabled: days !== undefined,
  });
  const data = worth.data;
  const first = data?.series[0];
  const last = data?.series[data.series.length - 1];
  const chart =
    data === undefined ? undefined : netWorthChart(data.series, locale);
  return (
    <Tile
      title={t('reportsPlan.netWorth.title')}
      subtitle={t('reportsPlan.netWorth.subtitle')}
      span="full"
      bodyClassName="px-0"
    >
      {ready && range === null ? (
        <EmptyState
          title={t('reportsPlan.netWorth.emptyTitle')}
          hint={t('reportsShell.noCycle')}
        />
      ) : worth.isError ? (
        <div className="px-3">
          <Failed
            retry={() => {
              void worth.refetch();
            }}
          />
        </div>
      ) : data === undefined || chart === undefined ? (
        <div className="px-3">
          <SkeletonTile />
        </div>
      ) : first === undefined || last === undefined ? (
        <EmptyState
          title={t('reportsPlan.netWorth.emptyTitle')}
          hint={t('reportsPlan.netWorth.emptyHint')}
        />
      ) : (
        <>
          <div className="px-3 pt-2">
            <div className="text-stat font-semibold">
              <Amount amount={data.amount} locale={locale} />
            </div>
            <p className="num truncate text-small text-text-muted">
              {t('reportsPlan.netWorth.since', {
                start: formatMoney(first.amount, 'symbol', locale),
                date: formatDay(first.date, locale),
              })}
            </p>
          </div>
          <Chart
            label={t('reportsPlan.netWorth.summary', {
              days: data.series.length,
              start: formatMoney(first.amount, 'symbol', locale),
              end: formatMoney(last.amount, 'symbol', locale),
            })}
            series={[
              {
                id: 'net-worth',
                label: t('reportsPlan.netWorth.total'),
                color: 'series-1',
                points: chart.points,
                area: true,
                endLabel: formatMoney(last.amount, 'symbol', locale),
              },
            ]}
            yTicks={chart.yTicks}
            xTicks={chart.xTicks}
            table={{
              caption: t('reportsPlan.netWorth.caption'),
              headers: [
                t('reportsPlan.netWorth.day'),
                t('reportsPlan.netWorth.total'),
              ],
              rows: data.series.map((p) => [
                formatDay(p.date, locale),
                formatMoney(p.amount, 'symbol', locale),
              ]),
            }}
          />
        </>
      )}
    </Tile>
  );
}
