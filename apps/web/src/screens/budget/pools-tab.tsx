import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ToggleButton } from 'react-aria-components';
import type { AccountView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { LeftBar, SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { EmptyState } from '@/components/states';
import { Sparkline } from '@/charts/sparkline';
import { IconCheckLine } from '@/generated/icons';
import { poolQueryKeys, poolsQuery, updatePool } from '@/lib/budgets';
import { formatMoney } from '@/lib/format-money';
import { accountHistoryQuery, accountsQuery, todayQuery } from '@/lib/ledger';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { sparkPoints } from '../accounts/accounts-model.ts';
import { poolTiles, type PoolTile } from './pools-model.ts';

const locale = 'en';
const money = (amount: Parameters<typeof formatMoney>[0]) =>
  formatMoney(amount, 'symbol', locale);

const columns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: '5rem', from: 'medium' },
  { width: 'auto' },
];

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

function DailyToggle({
  tile,
  onChange,
}: {
  tile: PoolTile;
  onChange: (checked: boolean) => void;
}) {
  return (
    <ToggleButton
      isSelected={tile.checked}
      isDisabled={tile.fixed}
      onChange={onChange}
      aria-label={t(
        tile.fixed ? 'budgetPools.dailyFixedLabel' : 'budgetPools.dailyLabel',
        { name: tile.name },
      )}
      className="press flex size-8 shrink-0 items-center justify-center disabled:cursor-not-allowed"
    >
      {({ isSelected, isDisabled }) => (
        <span
          className={cn(
            'flex size-4 items-center justify-center border border-outline',
            isSelected &&
              (isDisabled ? 'text-text-muted' : 'bg-primary text-on-primary'),
          )}
        >
          {isSelected ? <IconCheckLine className="size-3" /> : null}
        </span>
      )}
    </ToggleButton>
  );
}

function Trend({ account }: { account: AccountView }) {
  const history = useQuery(accountHistoryQuery(account.id));
  const points =
    history.data === undefined ? [] : sparkPoints(history.data.points);
  return (
    <div className="h-6 w-16">
      {points.length < 2 ? null : (
        <Sparkline
          points={points}
          label={t('budgetPools.sparkline', { name: account.name })}
        />
      )}
    </div>
  );
}

function PoolCard({
  tile,
  failed,
  onToggle,
}: {
  tile: PoolTile;
  failed: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <Tile
      title={tile.name}
      subtitle={t(`budgetPools.kind.${tile.kind}`)}
      actions={<DailyToggle tile={tile} onChange={onToggle} />}
      bodyClassName="px-0 pb-0"
    >
      <div className="px-3 py-2">
        <p className="text-small text-text-muted">{t('budgetPools.balance')}</p>
        <p className="text-stat-sub font-semibold">
          <Amount amount={tile.balance} locale={locale} />
        </p>
        {tile.cycle === null ? null : (
          <>
            <p className="num mt-1 truncate text-small text-text-muted">
              {t('budgetPools.left', {
                left: money(tile.cycle.left),
                start: money(tile.cycle.start),
              })}
            </p>
            <LeftBar
              fraction={tile.cycle.fraction}
              label={t('budgetPools.leftLabel', { name: tile.name })}
              className="mt-1"
            />
          </>
        )}
        {tile.kind === 'savings' ? (
          <p className="mt-1 text-small text-text-muted">
            {t('budgetPools.savingsNote')}
          </p>
        ) : null}
        {failed ? (
          <p role="alert" className="mt-1 text-small text-negative">
            {t('budgetPools.saveFailed', { name: tile.name })}
          </p>
        ) : null}
      </div>
      {tile.accounts.length === 0 ? (
        <p className="border-t px-3 py-2 text-small text-text-muted">
          {t('budgetPools.noAccounts')}
        </p>
      ) : (
        <ul className="border-t">
          {tile.accounts.map((account) => (
            <li key={account.id}>
              <Row
                columns={columns}
                cells={[
                  <span key="n" className="font-sans">
                    {account.name}
                  </span>,
                  <Trend key="t" account={account} />,
                  <Amount key="a" amount={account.balance} locale={locale} />,
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

function HowItWorks() {
  const today = useQuery(todayQuery);
  const view = today.data;
  return (
    <Tile
      title={t('budgetPools.how.title')}
      subtitle={t('budgetPools.how.subtitle')}
      span="full"
      bodyClassName="grid content-start gap-2 pt-2.5"
    >
      {view === undefined ? (
        <p className="num text-small text-text-muted">…</p>
      ) : (
        <p className="num truncate text-base">
          {t('budgetPools.how.formula', {
            onBudget: money(view.onBudget),
            bills: money(view.reserved),
            free: money(view.available),
            days: view.daysLeft,
            daily: money(view.liveDaily),
          })}
        </p>
      )}
      <p className="font-sans text-small text-text-muted">
        {t('budgetPools.how.body')}
      </p>
    </Tile>
  );
}

// Budget · pools (docs/ui.md §6): one tile per pool, then how the daily
// number works. Switching a pool changes what counts toward the daily
// number; the server refuses it for the Budget pool (409 pool_fixed).
export function PoolsTab() {
  const pools = useQuery(poolsQuery);
  const accounts = useQuery(accountsQuery);
  const toggle = useToggleDaily();

  if (pools.isError || accounts.isError) {
    return (
      <Tile title={t('nav.budget')}>
        <EmptyState
          title={t('budgetPools.failed')}
          hint=""
          action={
            <BracketButton
              onPress={() => {
                void pools.refetch();
                void accounts.refetch();
              }}
            >
              {t('budgetPools.retry')}
            </BracketButton>
          }
        />
      </Tile>
    );
  }
  if (pools.data === undefined || accounts.data === undefined) {
    return (
      <Grid>
        <SkeletonTile rows={4} />
        <SkeletonTile rows={4} />
      </Grid>
    );
  }
  const tiles = poolTiles(pools.data.pools, accounts.data.accounts);
  return (
    <Grid>
      {tiles.length === 0 ? (
        <Tile title={t('nav.budget')} span="full">
          <EmptyState
            title={t('budgetPools.empty')}
            hint={t('budgetPools.emptyHint')}
          />
        </Tile>
      ) : (
        tiles.map((tile) => (
          <PoolCard
            key={tile.id}
            tile={tile}
            failed={toggle.isError && toggle.variables.id === tile.id}
            onToggle={(checked) => {
              toggle.mutate({ id: tile.id, checked });
            }}
          />
        ))
      )}
      <HowItWorks />
    </Grid>
  );
}
