import { queryOptions, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, Tag } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { Chart } from '@/charts/chart';
import { formatDay } from '@/features/today/format';
import { formatLongDay } from '@/features/ledger/format';
import { ledgerRows } from '@/features/ledger/rows';
import { IconCloseLine } from '@/generated/icons';
import { call } from '@/lib/api';
import { poolsQuery } from '@/lib/budgets';
import { endpoints } from '@/lib/endpoints';
import { formatMoney } from '@/lib/format-money';
import {
  accountHistoryQuery,
  allAccountsQuery,
  allCategoriesQuery,
} from '@/lib/ledger';
import { t } from '@/messages/t';
import { openNewForm } from '@/shell/command/store';
import { historyChart } from './detail-model.ts';
import { ArchiveSheet } from './archive-sheet.tsx';
import { ReconcileSheet } from './reconcile-sheet.tsx';

const locale = 'en';
const DAYS = 30;
const RECENT = 8;

const recentColumns: readonly RowColumn[] = [
  { width: 'auto' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
];

function recentQuery(accountId: string) {
  return queryOptions({
    // Under ['transactions'], so any new entry refreshes it.
    queryKey: ['transactions', 'account-recent', accountId],
    queryFn: () =>
      call(endpoints.transactions, {
        query: { accountId, undone: 'hide', limit: RECENT },
      }),
  });
}

/**
 * One account in full (docs/ui.md §6): its balance and history, where it
 * sits, its latest entries, then reconcile, transfer and archive. The
 * accounts screen renders it in the pane (≥ 1000 px) or in a sheet and owns
 * the selection.
 */
export function AccountDetail({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}) {
  const accounts = useQuery(allAccountsQuery);
  const pools = useQuery(poolsQuery);
  const [sheet, setSheet] = useState<'reconcile' | 'archive' | null>(null);

  const closeButton = (
    <Button
      aria-label={t('accountDetail.close')}
      onPress={onClose}
      className="press flex size-hit items-center justify-center"
    >
      <IconCloseLine className="size-4" />
    </Button>
  );

  if (accounts.isError) {
    return (
      <Tile title={t('accountDetail.title')} actions={closeButton}>
        <div role="alert" className="flex flex-col items-start gap-2 py-3">
          <p className="text-small">{t('accountDetail.failed')}</p>
          <BracketButton
            onPress={() => {
              void accounts.refetch();
            }}
          >
            {t('accountDetail.retry')}
          </BracketButton>
        </div>
      </Tile>
    );
  }
  const account = accounts.data?.accounts.find((a) => a.id === accountId);
  if (accounts.data === undefined) return <SkeletonTile />;
  if (account === undefined) {
    return (
      <Tile title={t('accountDetail.title')} actions={closeButton}>
        <p role="alert" className="py-3 text-small">
          {t('accountDetail.failed')}
        </p>
      </Tile>
    );
  }

  const pool = pools.data?.pools.find((p) => p.id === account.poolId);
  return (
    <Tile
      title={account.name}
      subtitle={t('accountDetail.title')}
      actions={closeButton}
      bodyClassName="px-0 pb-0"
    >
      <section
        aria-label={t('accountDetail.history.title')}
        className="flex flex-col border-b"
      >
        <div className="flex items-center gap-2 px-3 pt-2">
          <p className="min-w-0 flex-1 text-xl font-semibold">
            <Amount amount={account.balance} locale={locale} />
          </p>
          {account.archived ? (
            <Tag>{t('accountDetail.tags.archived')}</Tag>
          ) : null}
        </div>
        <History accountId={account.id} name={account.name} />
      </section>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b px-3 py-2 text-small">
        <Field label={t('accountDetail.fields.pool')}>
          {pool?.name ?? '…'}
        </Field>
        <Field label={t('accountDetail.fields.type')}>
          {t(`accountDetail.kinds.${account.kind}`)}
        </Field>
        <Field label={t('accountDetail.fields.counts')}>
          {t(`accountDetail.groups.${account.budgetGroup}`)}
        </Field>
        <Field label={t('accountDetail.fields.currency')}>
          {account.currency}
        </Field>
        <Field label={t('accountDetail.fields.reconciled')}>
          {account.lastReconciledOn === null
            ? t('accounts.neverReconciled')
            : formatLongDay(account.lastReconciledOn, locale)}
        </Field>
      </dl>

      <Recent accountId={account.id} />

      {account.archived ? null : (
        <div className="flex flex-wrap items-center gap-1 px-3 py-2">
          <BracketButton
            onPress={() => {
              setSheet('reconcile');
            }}
          >
            {t('accountDetail.actions.reconcile')}
          </BracketButton>
          <BracketButton
            onPress={() => {
              openNewForm('transfer');
            }}
          >
            {t('accountDetail.actions.transfer')}
          </BracketButton>
          <BracketButton
            tone="destructive"
            onPress={() => {
              setSheet('archive');
            }}
          >
            {t('accountDetail.actions.archive')}
          </BracketButton>
        </div>
      )}

      {sheet === 'reconcile' ? (
        <ReconcileSheet
          account={account}
          open
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === 'archive' ? (
        <ArchiveSheet
          account={account}
          open
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
    </Tile>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate font-sans">{children}</dd>
    </>
  );
}

function History({ accountId, name }: { accountId: string; name: string }) {
  const history = useQuery(accountHistoryQuery(accountId, DAYS));
  if (history.isError)
    return (
      <p role="alert" className="px-3 py-2 text-small text-negative">
        {t('accountDetail.history.failed')}
      </p>
    );
  const points = history.data?.points;
  if (points === undefined) return <SkeletonTile />;
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined)
    return (
      <p className="px-3 py-2 text-small text-text-muted">
        {t('accountDetail.history.empty')}
      </p>
    );
  const chart = historyChart(points, locale);
  const end = formatMoney(last.balance, 'symbol', locale);
  return (
    <Chart
      label={t('accountDetail.history.summary', {
        name,
        days: DAYS,
        start: formatMoney(first.balance, 'symbol', locale),
        end,
      })}
      series={[
        {
          id: 'balance',
          label: t('accountDetail.history.balance'),
          color: 'series-1',
          points: chart.points,
          area: true,
          endLabel: end,
        },
      ]}
      yTicks={chart.yTicks}
      xTicks={chart.xTicks}
      table={{
        caption: t('accountDetail.history.caption'),
        headers: [
          t('accountDetail.history.day'),
          t('accountDetail.history.balance'),
        ],
        rows: points.map((p) => [
          formatDay(p.date, locale),
          formatMoney(p.balance, 'symbol', locale),
        ]),
      }}
    />
  );
}

/** The latest entries touching the account; each opens in Transactions. */
function Recent({ accountId }: { accountId: string }) {
  const navigate = useNavigate();
  const entries = useQuery(recentQuery(accountId));
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);

  const body = () => {
    if (entries.isError)
      return (
        <p role="alert" className="px-3 text-small text-negative">
          {t('accountDetail.recent.failed')}
        </p>
      );
    if (
      entries.data === undefined ||
      accounts.data === undefined ||
      categories.data === undefined
    )
      return null;
    const rows = ledgerRows(
      entries.data.transactions,
      accounts.data.accounts,
      categories.data.categories,
    );
    if (rows.length === 0)
      return (
        <p className="px-3 text-small text-text-muted">
          {t('accountDetail.recent.empty')}
        </p>
      );
    return rows.map((row) => {
      const title = row.note ?? row.title ?? t(`ledger.kinds.${row.kind}`);
      return (
        <Row
          key={row.id}
          columns={recentColumns}
          onPress={() => {
            void navigate({ to: '/transactions', search: { entry: row.id } });
          }}
          cells={[
            <span key="day" className="text-text-muted">
              {formatDay(row.occurredOn, locale)}
            </span>,
            <span key="title" className="font-sans">
              {title}
            </span>,
            row.amount === null ? null : (
              <Amount
                key="amount"
                amount={row.amount}
                kind={
                  row.moves
                    ? 'transfer'
                    : row.amount.amountMinor < 0
                      ? 'expense'
                      : 'income'
                }
                locale={locale}
              />
            ),
          ]}
        />
      );
    });
  };

  return (
    <section
      aria-label={t('accountDetail.recent.title')}
      className="flex flex-col border-b py-2"
    >
      <h3 className="px-3 pb-1 text-tiny font-semibold tracking-wide text-text-muted uppercase">
        {t('accountDetail.recent.title')}
      </h3>
      {body()}
    </section>
  );
}
