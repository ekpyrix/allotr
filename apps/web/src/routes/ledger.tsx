import { formatMoney } from '@allotr/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { FormError } from '@/components/field';
import { Page } from '@/components/page';
import { Button } from '@/components/ui/button';
import { EntryDialog } from '@/features/ledger/entry-dialog';
import { LedgerFilters } from '@/features/ledger/ledger-filters';
import { LedgerList } from '@/features/ledger/ledger-list';
import { ledgerRows } from '@/features/ledger/rows';
import {
  filterOf,
  isFiltered,
  type LedgerSearch,
} from '@/features/ledger/search';
import { useQuickEntry } from '@/features/quick-entry/quick-entry-provider';
import {
  allAccountsQuery,
  allCategoriesQuery,
  ledgerQuery,
  ledgerSettingsQuery,
  tagsQuery,
} from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';

// The ledger view (FR-W2, FR-L4): every entry, filtered and paged by the
// server, with a detail dialog to edit or undo. Balances come from the
// server; the list never adds amounts up itself.
export function LedgerPage({
  search,
  navigate,
}: {
  search: LedgerSearch;
  navigate: (search: LedgerSearch, options?: { replace?: boolean }) => void;
}) {
  const entries = useInfiniteQuery(ledgerQuery(filterOf(search)));
  const accounts = useQuery(allAccountsQuery);
  const categories = useQuery(allCategoriesQuery);
  const tags = useQuery(tagsQuery);
  const settings = useQuery(ledgerSettingsQuery);
  const quickEntry = useQuickEntry();
  const all = [entries, accounts, categories, tags, settings];

  const failed = all.find((q) => q.isError && q.data === undefined);
  if (failed !== undefined)
    return (
      <Page title={t('ledger.title')}>
        <div className="mt-6 grid justify-items-start gap-4">
          <FormError message={errorMessage(failed.error)} />
          <Button
            onClick={() => {
              for (const q of all) if (q.isError) void q.refetch();
            }}
          >
            {t('errors.retry')}
          </Button>
        </div>
      </Page>
    );

  if (
    accounts.data === undefined ||
    categories.data === undefined ||
    tags.data === undefined ||
    settings.data === undefined
  )
    return (
      <Page title={t('ledger.title')}>
        <p role="status" className="mt-6 text-muted-foreground">
          {t('ledger.loading')}
        </p>
      </Page>
    );

  const { locale } = settings.data;
  const transactions = entries.data?.pages.flatMap((p) => p.transactions);
  const rows =
    transactions === undefined
      ? undefined
      : ledgerRows(
          transactions,
          accounts.data.accounts,
          categories.data.categories,
        );
  const account =
    search.account === undefined
      ? undefined
      : accounts.data.accounts.find((a) => a.id === search.account);
  const filters: LedgerSearch = { ...search, entry: undefined };

  return (
    <Page title={t('ledger.title')}>
      <LedgerFilters
        // Back and forward change the applied search: start the text over.
        key={search.q ?? ''}
        search={search}
        accounts={accounts.data.accounts}
        categories={categories.data.categories.filter(
          (c) => c.mergedIntoId === null,
        )}
        tags={tags.data.tags}
        onChange={(patch) => {
          navigate({ ...filters, ...patch });
        }}
      />

      {account === undefined ? null : (
        <p
          data-testid="account-balance"
          className="mt-6 font-mono text-lg tabular-nums"
        >
          {t('ledger.balance', {
            name: account.name,
            amount: formatMoney(account.balance, locale),
          })}
        </p>
      )}

      {rows === undefined ? (
        <p role="status" className="mt-6 text-muted-foreground">
          {t('ledger.loading')}
        </p>
      ) : rows.length === 0 ? (
        <div className="mt-6 grid justify-items-start gap-3">
          <p className="text-muted-foreground">
            {isFiltered(search) ? t('ledger.emptyFiltered') : t('ledger.empty')}
          </p>
          {isFiltered(search) ? null : (
            <Button
              variant="outline"
              onClick={(event) => {
                quickEntry.open(event.currentTarget);
              }}
            >
              <Plus aria-hidden />
              {t('ledger.add')}
            </Button>
          )}
        </div>
      ) : (
        <>
          <p aria-live="polite" className="sr-only">
            {t('ledger.count', { count: rows.length })}
          </p>
          <LedgerList
            rows={rows}
            locale={locale}
            search={search}
            hasMore={entries.hasNextPage}
            loadingMore={entries.isFetchingNextPage}
            onLoadMore={() => {
              void entries.fetchNextPage();
            }}
          />
        </>
      )}

      <EntryDialog
        id={search.entry}
        search={search}
        onClose={() => {
          navigate(filters);
        }}
        onShow={(id) => {
          navigate({ ...filters, entry: id }, { replace: true });
        }}
      />
    </Page>
  );
}
