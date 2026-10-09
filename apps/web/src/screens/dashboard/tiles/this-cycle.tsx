import type { Money } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { SkeletonTile } from '@/components/bars';
import { Tag } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { KeyFigures } from '@/components/stats';
import { Chart } from '@/charts/chart';
import { formatDay } from '@/features/today/format';
import { formatMoney } from '@/lib/format-money';
import { cycleDaysQuery, todayQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import { cycleView } from './this-cycle-model.ts';

const locale = 'en';
const money = (amount: Money) => formatMoney(amount, 'symbol', locale);

// "This cycle" (docs/ui.md §6): key figures, spent against the even pace,
// and the formula behind today's daily figure. All amounts are the server's.
export function ThisCycleTile() {
  const today = useQuery(todayQuery);
  const days = useQuery(cycleDaysQuery(today.data?.cycle.openedOn));

  if (today.isError || days.isError) {
    return (
      <Tile title={t('dashboardTiles.thisCycle.title')} span={2} primary>
        <TileFailed
          retry={() => {
            void today.refetch();
            void days.refetch();
          }}
        />
      </Tile>
    );
  }
  if (today.data === undefined || days.data === undefined) {
    return <SkeletonTile rows={5} span={2} />;
  }

  const { available, liveDaily, daysLeft, paceSpent } = today.data;
  const { budget } = days.data;
  const series = days.data.days;
  const view = cycleView(series);
  const first = series[0];
  const last = series.at(-1);
  const todayLabel = t('dashboardTiles.thisCycle.today');

  const xTicks = [
    ...(first === undefined
      ? []
      : [{ value: 0, label: formatDay(first.date, locale) }]),
    ...(view.todayIndex < 0
      ? []
      : [{ value: view.todayIndex, label: todayLabel }]),
    ...(last === undefined || series.length < 2
      ? []
      : [
          {
            value: series.length - 1,
            label: formatDay(last.date, locale),
          },
        ]),
  ];
  const formula = t('dashboardTiles.thisCycle.formula', {
    available: money(available),
    days: daysLeft,
    daily: money(liveDaily),
  });

  return (
    <Tile
      title={t('dashboardTiles.thisCycle.title')}
      subtitle={
        view.length === 0
          ? undefined
          : t('dashboardTiles.thisCycle.subtitle', {
              day: view.day,
              length: view.length,
            })
      }
      span={2}
      primary
      bodyClassName="grid content-start gap-2 pt-2.5"
    >
      <KeyFigures
        figures={[
          {
            label: t('dashboardTiles.thisCycle.spent'),
            figure: money(paceSpent),
          },
          {
            label: t('dashboardTiles.thisCycle.evenPace'),
            figure: view.pace === null ? '—' : money(view.pace),
          },
          {
            label: t('dashboardTiles.thisCycle.againstPace'),
            figure: (
              <Tag tone={view.status === 'ahead' ? 'warning' : 'positive'}>
                {t(
                  view.status === 'ahead'
                    ? 'dashboardTiles.thisCycle.ahead'
                    : 'dashboardTiles.thisCycle.under',
                )}
              </Tag>
            ),
          },
          {
            label: t('dashboardTiles.thisCycle.daysOver'),
            figure: String(view.daysOver),
          },
        ]}
      />
      {view.reference === null ? (
        <EmptyState
          title={t('dashboardTiles.thisCycle.noCycle')}
          hint={formula}
        />
      ) : (
        <Chart
          label={t('dashboardTiles.thisCycle.chartLabel')}
          series={[
            {
              id: 'spent',
              label: t('dashboardTiles.thisCycle.spent'),
              color: 'series-1',
              points: view.spentPoints,
              area: true,
              ...(view.spent === null ? {} : { endLabel: money(view.spent) }),
            },
          ]}
          yTicks={[
            { value: 0, label: money({ ...budget, amountMinor: 0 }) },
            { value: budget.amountMinor, label: money(budget) },
          ]}
          xTicks={xTicks}
          reference={view.reference}
          {...(view.todayIndex < 0
            ? {}
            : { today: { x: view.todayIndex, label: todayLabel } })}
          table={{
            caption: t('dashboardTiles.thisCycle.chartCaption'),
            headers: [
              t('dashboardTiles.thisCycle.colDay'),
              t('dashboardTiles.thisCycle.colSpent'),
              t('dashboardTiles.thisCycle.colPace'),
            ],
            rows: series.flatMap((day) =>
              day.cumulativeSpent === null
                ? []
                : [
                    [
                      formatDay(day.date, locale),
                      money(day.cumulativeSpent),
                      money(day.pace),
                    ],
                  ],
            ),
          }}
        />
      )}
      {view.reference === null ? null : (
        <p className="num truncate text-small text-text-muted">{formula}</p>
      )}
    </Tile>
  );
}
