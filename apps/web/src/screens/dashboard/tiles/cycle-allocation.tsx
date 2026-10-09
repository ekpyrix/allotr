import { useQuery } from '@tanstack/react-query';
import { Allocation } from '@/charts/allocation';
import { SkeletonTile } from '@/components/bars';
import { Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { todayQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import { allocationSegments } from './cycle-allocation.ts';

export function CycleAllocationTile() {
  const today = useQuery(todayQuery);
  const data = today.data;
  const title = t('dashboardTiles.allocation.title');
  if (today.isError) {
    return (
      <Tile title={title} span="full">
        <TileFailed
          retry={() => {
            void today.refetch();
          }}
        />
      </Tile>
    );
  }
  if (data === undefined) return <SkeletonTile span="full" />;
  const { allocation } = data;
  return (
    <Tile
      title={title}
      subtitle={t('dashboardTiles.allocation.subtitle')}
      span="full"
      bodyClassName="px-0 pb-0"
    >
      {allocation.start.amountMinor <= 0 ? (
        <EmptyState
          title={t('dashboardTiles.allocation.emptyTitle')}
          hint={t('dashboardTiles.allocation.emptyHint')}
        />
      ) : (
        <Allocation
          segments={allocationSegments(allocation, {
            paidBills: t('dashboardTiles.allocation.paidBills'),
            savings: t('dashboardTiles.allocation.savings'),
            spent: t('dashboardTiles.allocation.spent'),
            reserved: t('dashboardTiles.allocation.reserved'),
            free: t('dashboardTiles.allocation.free'),
          })}
          left={{ amount: data.onBudget, of: allocation.start }}
          label={title}
          leftLabel={t('dashboardTiles.allocation.left')}
          ofLabel={t('dashboardTiles.allocation.of')}
        />
      )}
    </Tile>
  );
}
