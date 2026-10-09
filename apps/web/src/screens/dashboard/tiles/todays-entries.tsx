import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { Tile } from '@/components/layout';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { CategoryIcon, EmptyState } from '@/components/states';
import { IconMoneyDollarCircleLine } from '@/generated/icons';
import {
  accountsQuery,
  categoriesQuery,
  entriesOnQuery,
  todayQuery,
} from '@/lib/ledger';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';
import { dashboardEntries, seriesNumber } from './todays-entries-model.ts';

const locale = 'en';

const columns: readonly RowColumn[] = [
  { width: '2.75rem' },
  { width: 'minmax(0, 1fr)' },
  { width: 'minmax(0, 0.8fr)', from: 'medium' },
  { width: 'auto' },
];

// Today's entries (docs/ui.md §6): time, icon, payee, category, amount.
export function TodaysEntriesTile() {
  const today = useQuery(todayQuery);
  const entries = useQuery(entriesOnQuery(today.data?.today));
  const accounts = useQuery(accountsQuery);
  const categories = useQuery(categoriesQuery);
  const title = t('dashboardTiles.todaysEntries.title');

  if (
    today.isError ||
    entries.isError ||
    accounts.isError ||
    categories.isError
  ) {
    return (
      <Tile title={title}>
        <TileFailed
          retry={() => {
            void today.refetch();
            void entries.refetch();
            void accounts.refetch();
            void categories.refetch();
          }}
        />
      </Tile>
    );
  }
  if (
    entries.data === undefined ||
    accounts.data === undefined ||
    categories.data === undefined
  ) {
    return <SkeletonTile />;
  }

  const rows = dashboardEntries(
    entries.data.transactions,
    accounts.data.accounts,
    categories.data.categories,
  );

  return (
    <Tile
      title={title}
      subtitle={rows.length === 0 ? undefined : String(rows.length)}
      actions={
        <Link to="/transactions" className="press px-1 text-small text-primary">
          {t('dashboardTiles.todaysEntries.all')}
        </Link>
      }
      bodyClassName="px-0 pb-0"
    >
      {rows.length === 0 ? (
        <EmptyState
          title={t('dashboardTiles.todaysEntries.empty')}
          hint={t('dashboardTiles.todaysEntries.emptyHint')}
        />
      ) : (
        <div>
          {rows.map((row) => {
            const colour =
              row.style === null ? undefined : seriesNumber(row.style.colour);
            return (
              <Row
                key={row.id}
                columns={columns}
                cells={[
                  <span key="time" className="num text-text-muted">
                    {row.time ?? t('dashboardTiles.todaysEntries.noTime')}
                  </span>,
                  <span key="payee" className="flex items-center gap-2">
                    {row.style?.icon == null ? (
                      <IconMoneyDollarCircleLine className="size-4 shrink-0 text-text-muted" />
                    ) : (
                      <CategoryIcon
                        name={row.style.icon}
                        {...(colour === undefined ? {} : { color: colour })}
                      />
                    )}
                    <span className="truncate">
                      {row.note ??
                        row.title ??
                        t('dashboardTiles.todaysEntries.untitled')}
                    </span>
                  </span>,
                  <span key="category" className="text-text-muted">
                    {row.title ?? ''}
                  </span>,
                  row.amount === null ? null : (
                    <Amount
                      key="amount"
                      amount={row.amount}
                      kind={
                        row.kind === 'transfer'
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
          })}
        </div>
      )}
    </Tile>
  );
}
