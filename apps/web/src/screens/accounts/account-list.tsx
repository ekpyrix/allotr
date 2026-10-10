import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { AccountView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { MenuButton, MenuItem } from '@/components/menu';
import { TreeRow } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { Sparkline } from '@/charts/sparkline';
import { formatDay } from '@/features/today/format';
import {
  IconBankCardLine,
  IconMore2Line,
  IconWallet3Line,
} from '@/generated/icons';
import { accountHistoryQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import {
  CREDIT_GROUP,
  NO_POOL_GROUP,
  sparkPoints,
  type AccountGroup,
} from './accounts-model.ts';

const locale = 'en';

export type RowAction =
  'reconcile' | 'transfer' | 'rename' | 'move' | 'archive';

const columns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: '6rem', from: 'medium' },
  { width: '4.5rem', from: 'wide' },
  { width: 'auto' },
  { width: '2rem' },
];

/** True once the element has been on screen; history loads only then. */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el === null || seen) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [seen]);
  return [ref, seen] as const;
}

function Trend({ account }: { account: AccountView }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const history = useQuery({
    ...accountHistoryQuery(account.id),
    enabled: seen,
  });
  const points =
    history.data === undefined ? [] : sparkPoints(history.data.points);
  return (
    <div ref={ref} className="h-6">
      {points.length < 2 ? null : (
        <Sparkline
          points={points}
          label={t('accountsScreen.list.sparkline', { name: account.name })}
        />
      )}
    </div>
  );
}

function AccountRow({
  account,
  last,
  selected,
  onSelect,
  onAction,
}: {
  account: AccountView;
  last: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onAction: (action: RowAction, account: AccountView) => void;
}) {
  const Icon =
    account.kind === 'liability' ? IconBankCardLine : IconWallet3Line;
  return (
    <TreeRow
      role={last ? 'last-child' : 'child'}
      label={account.name}
      selected={selected}
      columns={columns}
      cells={[
        <button
          key="name"
          type="button"
          aria-current={selected ? 'true' : undefined}
          onClick={() => {
            onSelect(account.id);
          }}
          className="press flex h-full min-h-hit w-full min-w-0 items-center gap-2 text-left"
        >
          <Icon
            aria-hidden="true"
            className="size-4 shrink-0 text-text-muted"
          />
          <span className="min-w-0 truncate font-sans">{account.name}</span>
        </button>,
        <Trend key="trend" account={account} />,
        <span key="date" className="num text-text-muted">
          {account.lastReconciledOn === null
            ? t('accountsScreen.list.notReconciled')
            : formatDay(account.lastReconciledOn, locale)}
        </span>,
        <Amount key="balance" amount={account.balance} locale={locale} />,
        <MenuButton
          key="menu"
          iconOnly
          icon={IconMore2Line}
          label={t('accountsScreen.list.actionsOf', { name: account.name })}
          title={account.name}
          className="size-8 justify-center"
        >
          <MenuItem
            id="reconcile"
            label={t('accountsScreen.menu.reconcile')}
            onAction={() => {
              onAction('reconcile', account);
            }}
          />
          <MenuItem
            id="transfer"
            label={t('accountsScreen.menu.transfer')}
            onAction={() => {
              onAction('transfer', account);
            }}
          />
          <MenuItem
            id="rename"
            label={t('accountsScreen.menu.rename')}
            onAction={() => {
              onAction('rename', account);
            }}
          />
          <MenuItem
            id="move"
            label={t('accountsScreen.menu.move')}
            onAction={() => {
              onAction('move', account);
            }}
          />
          <MenuItem
            id="archive"
            label={t('accountsScreen.menu.archive')}
            onAction={() => {
              onAction('archive', account);
            }}
          />
        </MenuButton>,
      ]}
    />
  );
}

function groupName(group: AccountGroup): string {
  if (group.id === CREDIT_GROUP) return t('accountsScreen.list.credit');
  if (group.id === NO_POOL_GROUP) return t('accountsScreen.list.noPool');
  return group.name ?? '';
}

/** Pools, then credit, each folding over its accounts. */
export function AccountList({
  groups,
  selectedId,
  onSelect,
  onAction,
}: {
  groups: readonly AccountGroup[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onAction: (action: RowAction, account: AccountView) => void;
}) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div>
      {groups.map((group) => {
        const open = !folded.has(group.id);
        const name = groupName(group);
        return (
          <div key={group.id}>
            <TreeRow
              role="parent"
              expanded={open}
              onToggle={() => {
                toggle(group.id);
              }}
              label={t('accountsScreen.list.fold', { name })}
              columns={columns}
              cells={[
                name,
                null,
                null,
                group.balance === null ? null : (
                  <Amount amount={group.balance} locale={locale} />
                ),
                null,
              ]}
            />
            {open
              ? group.accounts.map((account, index) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    last={index === group.accounts.length - 1}
                    selected={account.id === selectedId}
                    onSelect={onSelect}
                    onAction={onAction}
                  />
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
