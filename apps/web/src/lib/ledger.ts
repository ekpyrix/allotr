import type { CreateTransactionBody } from '@allotr/shared';
import { queryOptions } from '@tanstack/react-query';
import { call } from './api.ts';
import { endpoints } from './endpoints.ts';

// Ledger reads shared by the views. Sign-out removes every query but the
// session, so none of these outlive the user they belong to.

export const accountsQuery = queryOptions({
  queryKey: ['accounts'],
  queryFn: () => call(endpoints.accounts),
});

export const categoriesQuery = queryOptions({
  queryKey: ['categories'],
  queryFn: () => call(endpoints.categories),
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
