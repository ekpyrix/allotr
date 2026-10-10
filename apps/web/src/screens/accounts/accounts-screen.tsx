import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { AccountView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Split, Tile } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { Stats, type Stat } from '@/components/stats';
import { EmptyState } from '@/components/states';
import { useFrameWidth } from '@/components/use-frame-width';
import { poolsQuery } from '@/lib/budgets';
import { accountsQuery, todayQuery } from '@/lib/ledger';
import { netWorthQuery } from '@/lib/plan';
import { t } from '@/messages/t';
import { openNewForm } from '@/shell/command/store';
import {
  accountGroups,
  creditStat,
  needsReconcile,
  type AccountsFilter,
} from './accounts-model.ts';
import { AccountList, type RowAction } from './account-list.tsx';
import { AccountDetail } from './detail/account-detail.tsx';
import { ArchiveSheet } from './detail/archive-sheet.tsx';
import { ReconcileSheet } from './detail/reconcile-sheet.tsx';
import { MoveSheet } from './move-sheet.tsx';
import { RenameSheet } from './rename-sheet.tsx';
import { validateAccountsSearch } from './search-params.ts';

const locale = 'en';

type Open = Readonly<{
  action: 'reconcile' | 'rename' | 'move' | 'archive';
  account: AccountView;
}>;

function filterOf(sub: string | undefined): AccountsFilter {
  return sub === 'on-budget' || sub === 'off-budget' || sub === 'credit'
    ? sub
    : 'all';
}

// Accounts (docs/ui.md §6): stats on top, then the pool and account tree
// with the open account beside it (from 1000 px) or in a sheet. Every
// figure comes from the server; the tree only groups accounts. The open
// account lives in the URL.
export function AccountsScreen() {
  const navigate = useNavigate();
  const { sub } = useParams({ strict: false });
  const raw = useSearch({ strict: false });
  const selected = validateAccountsSearch(raw).account;
  const wide = useFrameWidth() >= 1000;
  const filter = filterOf(sub);

  const accounts = useQuery(accountsQuery);
  const pools = useQuery(poolsQuery);
  const worth = useQuery(netWorthQuery(30));
  const today = useQuery(todayQuery);
  const [open, setOpen] = useState<Open | null>(null);

  const select = (account: string | undefined) => {
    const search = account === undefined ? {} : { account };
    void navigate(
      filter === 'all'
        ? { to: '/accounts', search }
        : { to: '/accounts/$sub', params: { sub: filter }, search },
    );
  };

  const list = accounts.data?.accounts;
  const groups = useMemo(
    () =>
      list === undefined || pools.data === undefined
        ? undefined
        : accountGroups(list, pools.data.pools, filter),
    [list, pools.data, filter],
  );

  const stats = useMemo<Stat[] | undefined>(() => {
    if (accounts.data === undefined) return undefined;
    const credit = creditStat(accounts.data.accounts);
    const looks =
      today.data === undefined
        ? undefined
        : needsReconcile(accounts.data.accounts, today.data.today).length;
    return [
      {
        label: t('accountsScreen.stats.netWorth'),
        figure:
          worth.data === undefined ? (
            '…'
          ) : (
            <Amount amount={worth.data.amount} locale={locale} />
          ),
        sub: t('accountsScreen.stats.netWorthSub'),
        tone: 'primary',
      },
      {
        label: t('accountsScreen.stats.savings'),
        figure: (
          <Amount amount={accounts.data.totals.off.amount} locale={locale} />
        ),
        sub: t('accountsScreen.stats.savingsSub'),
      },
      {
        label: t('accountsScreen.stats.credit'),
        figure:
          credit.kind === 'one' ? (
            <Amount amount={credit.balance} locale={locale} />
          ) : credit.kind === 'many' ? (
            t('accountsScreen.stats.creditMany', { count: credit.count })
          ) : (
            t('accountsScreen.stats.creditNone')
          ),
        sub: t(
          credit.kind === 'none'
            ? 'accountsScreen.stats.creditNoneSub'
            : credit.kind === 'one'
              ? 'accountsScreen.stats.creditOneSub'
              : 'accountsScreen.stats.creditManySub',
        ),
      },
      {
        label: t('accountsScreen.stats.reconcile'),
        figure:
          looks === undefined
            ? '…'
            : looks === 0
              ? t('accountsScreen.stats.reconcileNone')
              : t('accountsScreen.stats.reconcileFigure', { count: looks }),
        sub: t('accountsScreen.stats.reconcileSub'),
      },
    ];
  }, [accounts.data, worth.data, today.data]);

  const act = (action: RowAction, account: AccountView) => {
    if (action === 'transfer') openNewForm('transfer');
    else setOpen({ action, account });
  };
  const closeSheet = () => {
    setOpen(null);
  };

  const failed = accounts.isError || pools.isError;
  let body;
  if (failed) {
    body = (
      <div
        role="alert"
        className="flex items-center gap-2 px-3 py-2 text-small"
      >
        <span className="text-negative">{t('accountsScreen.failed')}</span>
        <BracketButton
          onPress={() => {
            void accounts.refetch();
            void pools.refetch();
          }}
        >
          {t('accountsScreen.retry')}
        </BracketButton>
      </div>
    );
  } else if (groups === undefined) {
    body = <SkeletonTile />;
  } else if (groups.length === 0) {
    body = (
      <EmptyState
        title={t('accountsScreen.list.empty')}
        hint={t('accountsScreen.list.emptyHint')}
      />
    );
  } else {
    body = (
      <AccountList
        groups={groups}
        selectedId={selected}
        onSelect={select}
        onAction={act}
      />
    );
  }

  const detail =
    selected === undefined ? null : (
      <AccountDetail
        accountId={selected}
        onClose={() => {
          select(undefined);
        }}
      />
    );

  return (
    <>
      {stats === undefined ? null : <Stats stats={stats} />}
      <Split
        list={
          <Tile
            title={t('accountsScreen.list.title')}
            subtitle={t('accountsScreen.list.subtitle')}
            bodyClassName="px-0 pb-0"
          >
            {body}
          </Tile>
        }
        detail={
          wide ? (
            <Tile
              title={t('accountsScreen.detail.title')}
              bodyClassName="px-0 pb-0"
            >
              {detail ?? (
                <EmptyState
                  title={t('accountsScreen.detail.pick')}
                  hint={t('accountsScreen.detail.pickHint')}
                />
              )}
            </Tile>
          ) : null
        }
      />
      {wide ? null : (
        <Sheet
          isOpen={selected !== undefined}
          onOpenChange={(isOpen) => {
            if (!isOpen) select(undefined);
          }}
          title={t('accountsScreen.detail.title')}
          closeLabel={t('accountsScreen.detail.close')}
        >
          {detail}
        </Sheet>
      )}
      {open?.action === 'rename' ? (
        <RenameSheet account={open.account} onClose={closeSheet} />
      ) : null}
      {open?.action === 'move' && pools.data !== undefined ? (
        <MoveSheet
          account={open.account}
          pools={pools.data.pools}
          onClose={closeSheet}
        />
      ) : null}
      {open?.action === 'reconcile' ? (
        <ReconcileSheet account={open.account} open onClose={closeSheet} />
      ) : null}
      {open?.action === 'archive' ? (
        <ArchiveSheet account={open.account} open onClose={closeSheet} />
      ) : null}
    </>
  );
}
