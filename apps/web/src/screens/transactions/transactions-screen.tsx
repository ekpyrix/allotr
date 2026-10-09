import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { Skeleton } from '@/components/bars';
import { BracketButton } from '@/components/buttons';
import { Split, Tile } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { EmptyState } from '@/components/states';
import { useFrameWidth } from '@/components/use-frame-width';
import {
  accountsQuery,
  allAccountsQuery,
  allCategoriesQuery,
  categoriesQuery,
  cyclesQuery,
  ledgerQuery,
  todayQuery,
  type LedgerFilter,
} from '@/lib/ledger';
import { t } from '@/messages/t';
import { EntryDetail } from './detail/entry-detail.tsx';
import { ChipBar, EntryList } from './entry-list.tsx';
import {
  categoryChips,
  removeCategory,
  type FilterChip,
} from './filter-model.ts';
import { sections, summaryParts } from './list-model.ts';
import { periodRange } from './period.ts';
import {
  searchOf,
  validateTransactionsSearch,
  viewOf,
  type TransactionsView,
} from './search-params.ts';
import { TransactionsToolbar } from './toolbar.tsx';

const locale = 'en';

// Transactions (docs/ui.md §6): the filtered list with its totals from the
// server, and the selected entry beside it (from 1000 px) or in a sheet.
// Filters, grouping and the selection live in the URL.
export function TransactionsScreen() {
  const navigate = useNavigate();
  const raw = useSearch({ strict: false });
  const view = useMemo(
    () => viewOf(validateTransactionsSearch(raw as Record<string, unknown>)),
    [raw],
  );
  const wide = useFrameWidth() >= 1000;

  const today = useQuery(todayQuery);
  const cycles = useQuery(cyclesQuery);
  const accounts = useQuery(allAccountsQuery);
  const openAccounts = useQuery(accountsQuery);
  const categories = useQuery(allCategoriesQuery);
  const openCategories = useQuery(categoriesQuery);

  const change = useCallback(
    (next: Partial<TransactionsView>) => {
      void navigate({
        to: '/transactions',
        search: (prev) =>
          searchOf({
            ...viewOf(
              validateTransactionsSearch(prev as Record<string, unknown>),
            ),
            ...next,
          }),
      });
    },
    [navigate],
  );

  const range =
    today.data === undefined || cycles.data === undefined
      ? undefined
      : periodRange(view.period, today.data.today, cycles.data.cycles);

  const filter: LedgerFilter = {
    ...range,
    q: view.q,
    type: view.type,
    group: view.group,
    accountId: view.accounts.length === 0 ? undefined : view.accounts.join(','),
    categoryId:
      view.categories.length === 0 ? undefined : view.categories.join(','),
    undone: 'hide',
  };
  const list = useInfiniteQuery({
    ...ledgerQuery(filter),
    enabled: range !== undefined && range !== null,
  });

  const allCategories = categories.data?.categories;
  const allAccounts = accounts.data?.accounts;
  const menuCategories = openCategories.data?.categories ?? allCategories;
  const menuAccounts = openAccounts.data?.accounts ?? allAccounts;

  const chips = useMemo<FilterChip[]>(() => {
    if (allCategories === undefined || allAccounts === undefined) return [];
    return [
      ...(view.q === undefined ? [] : [{ key: 'q', label: `“${view.q}”` }]),
      ...(view.type === undefined
        ? []
        : [
            {
              key: 'type',
              label: t(`transactions.filter.types.${view.type}`),
            },
          ]),
      ...categoryChips(view.categories, allCategories),
      ...view.accounts.flatMap((id) => {
        const account = allAccounts.find((a) => a.id === id);
        return account === undefined
          ? []
          : [{ key: `account:${id}`, label: account.name }];
      }),
    ];
  }, [view, allCategories, allAccounts]);
  const filterCount = chips.filter((chip) => chip.key !== 'q').length;

  const removeChip = (key: string) => {
    if (key === 'q') change({ q: undefined });
    else if (key === 'type') change({ type: undefined });
    else if (key.startsWith('category:') && allCategories !== undefined) {
      change({
        categories: removeCategory(
          view.categories,
          allCategories,
          key.slice('category:'.length),
        ),
      });
    } else if (key.startsWith('account:')) {
      const id = key.slice('account:'.length);
      change({ accounts: view.accounts.filter((a) => a !== id) });
    }
  };

  const pages = list.data?.pages;
  const model = useMemo(() => {
    if (pages === undefined || allAccounts === undefined) return undefined;
    if (allCategories === undefined) return undefined;
    return sections({
      transactions: pages.flatMap((page) => page.transactions),
      accounts: allAccounts,
      categories: allCategories,
      group: view.group,
      groups: pages[0]?.groups ?? [],
      dayTotals: pages.flatMap((page) => page.dayTotals),
      locale,
    });
  }, [pages, allAccounts, allCategories, view.group]);

  const select = (entry: string | undefined) => {
    change({ entry });
  };
  const title = t('transactions.list.title');
  const failed =
    today.isError ||
    cycles.isError ||
    accounts.isError ||
    categories.isError ||
    list.isError;

  let body;
  if (failed) {
    body = (
      <div
        role="alert"
        className="flex items-center gap-2 px-3 py-2 text-small"
      >
        <span className="text-negative">{t('transactions.list.failed')}</span>
        <BracketButton
          onPress={() => {
            void today.refetch();
            void cycles.refetch();
            void accounts.refetch();
            void categories.refetch();
            void list.refetch();
          }}
        >
          {t('transactions.list.retry')}
        </BracketButton>
      </div>
    );
  } else if (range === null) {
    body = (
      <EmptyState
        title={t('transactions.list.noEarlierCycle')}
        hint={t('transactions.list.emptyFilteredHint')}
      />
    );
  } else if (model === undefined || pages === undefined) {
    body = (
      <div aria-busy="true" className="grid gap-2 px-3 py-2.5">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton
            key={i}
            width={i % 2 === 0 ? '90%' : '70%'}
            height="0.75rem"
          />
        ))}
      </div>
    );
  } else {
    body = (
      <EntryList
        summary={pages[0] === undefined ? [] : summaryParts(pages[0].totals)}
        sections={model}
        selectedId={view.entry}
        filtered={filterCount > 0 || view.q !== undefined}
        onSelect={select}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => {
          if (!list.isFetchingNextPage) void list.fetchNextPage();
        }}
      />
    );
  }

  const detail =
    view.entry === undefined ? null : (
      <EntryDetail
        entryId={view.entry}
        onOpen={select}
        onClose={() => {
          select(undefined);
        }}
      />
    );

  return (
    <>
      {menuCategories === undefined || menuAccounts === undefined ? null : (
        <TransactionsToolbar
          view={view}
          accounts={menuAccounts}
          categories={menuCategories}
          filterCount={filterCount}
          onChange={change}
        />
      )}
      <Split
        list={
          <Tile title={title} bodyClassName="px-0 pb-0">
            <ChipBar
              chips={chips}
              onRemove={removeChip}
              onClear={() => {
                change({
                  q: undefined,
                  type: undefined,
                  categories: [],
                  accounts: [],
                });
              }}
            />
            {body}
          </Tile>
        }
        detail={
          wide ? (
            <Tile
              title={t('transactions.list.detail')}
              bodyClassName="px-0 pb-0"
            >
              {detail ?? (
                <EmptyState
                  title={t('transactions.list.pick')}
                  hint={t('transactions.list.pickHint')}
                />
              )}
            </Tile>
          ) : null
        }
      />
      {wide ? null : (
        <Sheet
          isOpen={view.entry !== undefined}
          onOpenChange={(open) => {
            if (!open) select(undefined);
          }}
          title={t('transactions.list.detail')}
          closeLabel={t('transactions.list.closeDetail')}
        >
          {detail}
        </Sheet>
      )}
    </>
  );
}
