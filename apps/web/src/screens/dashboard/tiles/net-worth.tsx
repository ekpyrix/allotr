import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { Chart } from '@/charts/chart';
import { formatDay } from '@/features/today/format';
import { formatMoney } from '@/lib/format-money';
import { netWorthQuery } from '@/lib/plan';
import { t } from '@/messages/t';
import { netWorthChart } from './net-worth-model.ts';
import { TileFailed } from './tile-failed.tsx';

const locale = 'en';
const DAYS = 30;

export function NetWorthTile() {
  const worth = useQuery(netWorthQuery(DAYS));
  const data = worth.data;
  const first = data?.series[0];
  const last = data?.series[data.series.length - 1];
  const chart =
    data === undefined ? undefined : netWorthChart(data.series, locale);

  return (
    <Tile
      title={t('dashboardTiles.netWorth.title')}
      subtitle={t('dashboardTiles.netWorth.subtitle')}
      span={2}
      bodyClassName="px-0"
    >
      {worth.isError ? (
        <div className="px-3">
          <TileFailed
            onRetry={() => {
              void worth.refetch();
            }}
          />
        </div>
      ) : data === undefined || chart === undefined ? (
        <div className="px-3">
          <SkeletonTile />
        </div>
      ) : (
        <>
          <div className="px-3 pt-2">
            <div className="text-stat font-semibold">
              <Amount amount={data.amount} locale={locale} />
            </div>
            {first === undefined ? null : (
              <p className="num truncate text-small text-text-muted">
                {t('dashboardTiles.netWorth.since', {
                  start: formatMoney(first.amount, 'symbol', locale),
                  date: formatDay(first.date, locale),
                })}
              </p>
            )}
          </div>
          {first === undefined || last === undefined ? (
            <EmptyState
              title={t('dashboardTiles.netWorth.title')}
              hint={t('dashboardTiles.netWorth.empty')}
            />
          ) : (
            <Chart
              label={t('dashboardTiles.netWorth.summary', {
                days: DAYS,
                start: formatMoney(first.amount, 'symbol', locale),
                end: formatMoney(last.amount, 'symbol', locale),
              })}
              series={[
                {
                  id: 'net-worth',
                  label: t('dashboardTiles.netWorth.total'),
                  color: 'series-1',
                  points: chart.points,
                  area: true,
                  endLabel: formatMoney(last.amount, 'symbol', locale),
                },
              ]}
              yTicks={chart.yTicks}
              xTicks={chart.xTicks}
              table={{
                caption: t('dashboardTiles.netWorth.caption'),
                headers: [
                  t('dashboardTiles.netWorth.day'),
                  t('dashboardTiles.netWorth.total'),
                ],
                rows: data.series.map((p) => [
                  formatDay(p.date, locale),
                  formatMoney(p.amount, 'symbol', locale),
                ]),
              }}
            />
          )}
        </>
      )}
    </Tile>
  );
}
