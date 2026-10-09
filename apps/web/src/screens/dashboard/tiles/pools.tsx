import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ToggleButton } from 'react-aria-components';
import { Amount } from '@/components/amount';
import { LeftBar, ShareBar, SkeletonTile, seriesBg } from '@/components/bars';
import { Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { IconCheckLine } from '@/generated/icons';
import { poolQueryKeys, poolsQuery, updatePool } from '@/lib/budgets';
import { formatMoney } from '@/lib/format-money';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { poolRows, type PoolRow } from './pools-model.ts';
import { TileFailed } from './tile-failed.tsx';

const locale = 'en';

function useToggleDaily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      updatePool(id, { countsTowardDaily: checked }),
    onSettled: async () => {
      await Promise.all(
        poolQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

function PoolLine({
  row,
  onToggle,
  failed,
}: {
  row: PoolRow;
  onToggle: (checked: boolean) => void;
  failed: boolean;
}) {
  return (
    <li className="border-b py-1.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <ToggleButton
          isSelected={row.checked}
          onChange={onToggle}
          aria-label={t('dashboardTiles.pools.counts', { name: row.name })}
          className="press flex size-8 shrink-0 items-center justify-center"
        >
          {({ isSelected }) => (
            <span
              className={cn(
                'flex size-4 items-center justify-center border border-outline',
                isSelected && 'bg-primary text-on-primary',
              )}
            >
              {isSelected ? <IconCheckLine className="size-3" /> : null}
            </span>
          )}
        </ToggleButton>
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0', seriesBg[row.color])}
        />
        <span className="min-w-0 flex-1 truncate font-sans">{row.name}</span>
        <Amount amount={row.balance} locale={locale} />
      </div>
      {row.cycle === null ? null : (
        <div className="pl-8">
          <p className="num truncate text-[11px] text-text-muted">
            {t('dashboardTiles.pools.left', {
              left: formatMoney(row.cycle.left, 'symbol', locale),
              start: formatMoney(row.cycle.start, 'symbol', locale),
            })}
          </p>
          <LeftBar
            fraction={row.cycle.fraction}
            label={t('dashboardTiles.pools.cycleLeft', { name: row.name })}
            className="mt-0.5"
          />
        </div>
      )}
      {failed ? (
        <p role="alert" className="pl-8 text-small text-negative">
          {t('dashboardTiles.pools.saveFailed', { name: row.name })}
        </p>
      ) : null}
    </li>
  );
}

export function PoolsTile() {
  const pools = useQuery(poolsQuery);
  const toggle = useToggleDaily();
  const rows = pools.data === undefined ? [] : poolRows(pools.data.pools);

  return (
    <Tile
      title={t('dashboardTiles.pools.title')}
      subtitle={t('dashboardTiles.pools.subtitle')}
    >
      {pools.isError ? (
        <TileFailed
          retry={() => {
            void pools.refetch();
          }}
        />
      ) : pools.data === undefined ? (
        <SkeletonTile />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('dashboardTiles.pools.empty')}
          hint={t('dashboardTiles.pools.emptyHint')}
        />
      ) : (
        <>
          <ShareBar
            label={t('dashboardTiles.pools.share')}
            segments={rows.map((r) => ({
              id: r.id,
              label: r.name,
              fraction: r.share,
              color: r.color,
            }))}
            className="my-2"
          />
          <ul>
            {rows.map((row) => (
              <PoolLine
                key={row.id}
                row={row}
                failed={toggle.isError && toggle.variables.id === row.id}
                onToggle={(checked) => {
                  toggle.mutate({ id: row.id, checked });
                }}
              />
            ))}
          </ul>
        </>
      )}
    </Tile>
  );
}
