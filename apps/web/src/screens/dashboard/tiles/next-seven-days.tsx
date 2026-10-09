import { addDays, localDate } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { EmptyState } from '@/components/states';
import { formatDay } from '@/features/today/format';
import { calendarQuery, todayQuery } from '@/lib/ledger';
import { billsQuery } from '@/lib/settings';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import { upcomingItems } from './next-seven-days.ts';

const locale = 'en';
const NONE = localDate('2000-01-01');

const columns = [
  { width: '4rem' },
  { width: 'minmax(0,1fr)' },
  { width: '5.5rem' },
] as const;

export function NextSevenDaysTile() {
  const today = useQuery(todayQuery);
  const day = today.data?.today;
  const calendar = useQuery({
    ...calendarQuery(day ?? NONE, addDays(day ?? NONE, 6)),
    enabled: day !== undefined,
  });
  const bills = useQuery(billsQuery);
  const title = t('dashboardTiles.nextDays.title');

  if (today.isError || calendar.isError) {
    return (
      <Tile title={title}>
        <TileFailed
          retry={() => {
            void today.refetch();
            void calendar.refetch();
          }}
        />
      </Tile>
    );
  }
  if (day === undefined || calendar.data === undefined) {
    return <SkeletonTile rows={4} />;
  }
  const items = upcomingItems(calendar.data, bills.data?.bills ?? [], day, {
    payday: t('dashboardTiles.nextDays.payday'),
    bill: t('dashboardTiles.nextDays.bill'),
  });
  return (
    <Tile
      title={title}
      subtitle={t('dashboardTiles.nextDays.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      {items.length === 0 ? (
        <EmptyState
          title={t('dashboardTiles.nextDays.emptyTitle')}
          hint={t('dashboardTiles.nextDays.emptyHint')}
        />
      ) : (
        items.map((item) => (
          <Row
            key={item.key}
            columns={columns}
            cells={[
              <span key="d" className="text-text-muted">
                {formatDay(item.date, locale)}
              </span>,
              <span key="n" className="font-sans">
                {item.label}
              </span>,
              <span key="a" className="flex justify-end">
                {item.amount === null ? null : (
                  <Amount
                    amount={item.amount}
                    kind={item.amount.amountMinor < 0 ? 'expense' : 'income'}
                  />
                )}
              </span>,
            ]}
          />
        ))
      )}
    </Tile>
  );
}
