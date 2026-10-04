import type {
  AccountView,
  CreateAccountBody,
  CreateTransactionBody,
  LocalDate,
  ReconcileBody,
} from '@allotr/shared';
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

// Cycles are figures like today's: they sit under ['today'], so whatever
// refreshes today's figures refreshes them too.

/** Every cycle, the current one first. */
export const cyclesQuery = queryOptions({
  queryKey: ['today', 'cycles'],
  queryFn: () => call(endpoints.cycles),
});

/** One cycle in detail; waits while the day it opened is not known yet. */
export function cycleQuery(openedOn: LocalDate | undefined) {
  return queryOptions({
    queryKey: ['today', 'cycles', openedOn],
    queryFn:
      openedOn === undefined
        ? skipToken
        : () => call(endpoints.cycle, { params: { openedOn } }),
  });
}

/**
 * Spending and income per top-level category for a cycle or a calendar
 * month, rolled up by the server. Under ['today'] so any new entry
 * refreshes it.
 */
export function categorySummaryQuery(
  period: 'cycle' | 'month',
  openedOn: LocalDate | undefined,
) {
  return queryOptions({
    queryKey: ['today', 'category-summary', period, openedOn],
    queryFn: () =>
      call(endpoints.categorySummary, {
        query: {
          period,
          ...(period === 'cycle' && openedOn !== undefined
            ? { cycle: openedOn }
            : {}),
        },
      }),
  });
}

/**
 * Spending per day and what falls due, from `from` through `to`. Under
 * ['today'] so any new entry refreshes it.
 */
export function calendarQuery(from: LocalDate, to: LocalDate) {
  return queryOptions({
    queryKey: ['today', 'calendar', from, to],
    queryFn: () => call(endpoints.calendar, { query: { from, to } }),
  });
}

/** An account's end-of-day balances; waits until `enabled` (on screen). */
export function accountHistoryQuery(id: string, days = 30) {
  return queryOptions({
    // Under ['accounts'], so whatever refreshes balances refreshes it too.
    queryKey: ['accounts', id, 'history', days],
    queryFn: () =>
      call(endpoints.accountHistory, { params: { id }, query: { days } }),
  });
}

/** A cycle day by day, for charts; waits while the day it opened is unknown. */
export function cycleDaysQuery(openedOn: LocalDate | undefined) {
  return queryOptions({
    queryKey: ['today', 'cycles', openedOn, 'days'],
    queryFn:
      openedOn === undefined
        ? skipToken
        : () => call(endpoints.cycleDays, { params: { openedOn } }),
  });
}

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

/**
 * An account's entries in effect dated `from` through `to`, newest first,
 * such as those a bill's payment can link.
 */
export function accountEntriesQuery(
  accountId: string,
  from: LocalDate,
  to: LocalDate,
) {
  return queryOptions({
    queryKey: ['transactions', 'account', { accountId, from, to }],
    queryFn: () =>
      call(endpoints.transactions, {
        query: { accountId, from, to, undone: 'hide', limit: 200 },
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
  /** Deleted (undone) entries and their undos: hidden unless shown. */
  undone?: 'show' | 'hide' | undefined;
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

/** Brings back a deleted (undone) entry as a copy of it. */
export function restoreTransaction(id: string) {
  return call(endpoints.restoreTransaction, { params: { id } });
}

/**
 * Goes back to an earlier version of an edited entry: the entry as it
 * stands now is replaced by a copy of that version.
 */
export function revertTransaction(id: string) {
  return call(endpoints.revertTransaction, { params: { id } });
}

/**
 * Moves an entry within its day to right after `afterId` (oldest first),
 * or to the start of the day when that is null.
 */
export function moveTransaction(id: string, afterId: string | null) {
  return call(endpoints.moveTransaction, { params: { id }, body: { afterId } });
}

/** Opens an account; its opening balance is an entry. */
export function createAccount(body: CreateAccountBody) {
  return call(endpoints.createAccount, { body });
}

/** Moves an account on or off budget from today: a dated entry. */
export function switchBudgetGroup(
  id: string,
  budgetGroup: AccountView['budgetGroup'],
) {
  return call(endpoints.updateAccount, {
    params: { id },
    body: { budgetGroup },
  });
}

/** Renames an account; no entry is written. */
export function renameAccount(id: string, name: string) {
  return call(endpoints.updateAccount, { params: { id }, body: { name } });
}

/** How a remaining balance is cleared before the account is archived. */
export type Settle =
  { method: 'transfer'; toAccountId: string } | { method: 'write_off' };

/** Archives an account, clearing its balance first in the same request. */
export function archiveAccount(id: string, settle?: Settle) {
  return call(endpoints.archiveAccount, {
    params: { id },
    body: settle === undefined ? {} : { settle },
  });
}

/**
 * How much each way of clearing the balance would lower today's figure.
 * Under `accounts`, so any new entry refreshes it.
 */
export function archiveImpactQuery(id: string) {
  return queryOptions({
    queryKey: ['accounts', id, 'archive-impact'],
    queryFn: () => call(endpoints.archiveImpact, { params: { id } }),
  });
}

/**
 * Compares the bank's balance with the ledger's; a match is recorded. With
 * `adjust`, the difference the user saw is posted as an Unrecorded entry.
 */
export function reconcileAccount(id: string, body: ReconcileBody) {
  return call(endpoints.reconcileAccount, { params: { id }, body });
}
