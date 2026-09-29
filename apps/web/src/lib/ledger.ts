import type { CreateTransactionBody, LocalDate } from '@allotr/shared';
import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
} from '@tanstack/react-query';
import { call } from './api.ts';
import { endpoints } from './endpoints.ts';

// Ledger reads shared by the views. Sign-out removes every query but the
// session, so none of these outlive the user they belong to.

export const accountsQuery = queryOptions({
  queryKey: ['accounts'],
  queryFn: () => call(endpoints.accounts),
});

/** With archived ones, which still name old entries. */
export const allAccountsQuery = queryOptions({
  queryKey: ['accounts', { includeArchived: true }],
  queryFn: () => call(endpoints.accounts, { query: { includeArchived: true } }),
});

export const categoriesQuery = queryOptions({
  queryKey: ['categories'],
  queryFn: () => call(endpoints.categories),
});

/** With merged ones, which only name old entries: for showing history. */
export const allCategoriesQuery = queryOptions({
  queryKey: ['categories', { includeMerged: true }],
  queryFn: () => call(endpoints.categories, { query: { includeMerged: true } }),
});

export const tagsQuery = queryOptions({
  queryKey: ['tags'],
  queryFn: () => call(endpoints.tags),
});

export const ledgerSettingsQuery = queryOptions({
  queryKey: ['settings', 'ledger'],
  queryFn: () => call(endpoints.ledgerSettings),
});

export const todayQuery = queryOptions({
  queryKey: ['today'],
  queryFn: () => call(endpoints.today),
});

/**
 * Entries dated `day`, newest first; a day rarely has more than a page.
 * Waits while the day is not known yet.
 */
export function entriesOnQuery(day: LocalDate | undefined) {
  return queryOptions({
    queryKey: ['transactions', { from: day, to: day }],
    queryFn:
      day === undefined
        ? skipToken
        : () =>
            call(endpoints.transactions, {
              query: { from: day, to: day, limit: 200 },
            }),
  });
}

export interface LedgerFilter {
  accountId?: string | undefined;
  categoryId?: string | undefined;
  tagId?: string | undefined;
  from?: LocalDate | undefined;
  to?: LocalDate | undefined;
  q?: string | undefined;
}

export const LEDGER_PAGE_SIZE = 50;

/** The ledger list, newest first, a page at a time. */
export function ledgerQuery(filter: LedgerFilter) {
  return infiniteQueryOptions({
    queryKey: ['transactions', 'ledger', filter],
    queryFn: ({ pageParam }) =>
      call(endpoints.transactions, {
        query: { ...filter, limit: LEDGER_PAGE_SIZE, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function entryQuery(id: string) {
  return queryOptions({
    queryKey: ['transactions', 'entry', id],
    queryFn: () => call(endpoints.transaction, { params: { id } }),
  });
}

/** What a new entry changes; Today (#59) and the ledger (#60) read these. */
export const entryQueryKeys = [
  ['transactions'],
  ['today'],
  ['accounts'],
] as const;

/** A repeated key returns the entry it first created instead of a new one. */
export function createTransaction(
  body: CreateTransactionBody,
  idempotencyKey: string,
) {
  return call(endpoints.createTransaction, {
    body,
    headers: { 'idempotency-key': idempotencyKey },
  });
}

/** Replaces an entry: its reversal plus the entry the body describes. */
export function editTransaction(id: string, body: CreateTransactionBody) {
  return call(endpoints.editTransaction, { params: { id }, body });
}

/** Undo: posts a reversal; the same key set as a new entry goes stale. */
export function reverseTransaction(id: string) {
  return call(endpoints.reverseTransaction, { params: { id }, body: {} });
}
