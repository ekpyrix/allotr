import type {
  CreateBillBody,
  CreateBillPaymentBody,
  CreateCategoryBody,
  CreateRateBody,
  LocalDate,
  UpdateBillBody,
  UpdateCategoryBody,
  UpdateLedgerSettingsBody,
} from '@allotr/shared';
import {
  queryOptions,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { call } from './api.ts';
import { endpoints } from './endpoints.ts';

// Settings writes shared by the sections of the settings view.

/** Every figure depends on these: the cycle, the currency, bills, rates. */
export const figureQueryKeys = [
  ['settings', 'ledger'],
  ['today'],
  ['accounts'],
] as const;

export async function invalidate(
  queryClient: QueryClient,
  keys: readonly QueryKey[],
): Promise<void> {
  await Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export function updateLedgerSettings(body: UpdateLedgerSettingsBody) {
  return call(endpoints.updateLedgerSettings, { body });
}

/** Category and tag names show on entries, so those lists change too. */
export const categoryQueryKeys = [['categories'], ['transactions']] as const;
export const tagQueryKeys = [['tags'], ['transactions']] as const;

export function createCategory(body: CreateCategoryBody) {
  return call(endpoints.createCategory, { body });
}

export function updateCategory(id: string, body: UpdateCategoryBody) {
  return call(endpoints.updateCategory, { params: { id }, body });
}

/** A category that entries use needs `mergeInto`. */
export async function deleteCategory(id: string, mergeInto?: string) {
  await call(endpoints.deleteCategory, {
    params: { id },
    query: { mergeInto },
  });
}

export function createTag(name: string) {
  return call(endpoints.createTag, { body: { name } });
}

export function renameTag(id: string, name: string) {
  return call(endpoints.renameTag, { params: { id }, body: { name } });
}

export const billsQuery = queryOptions({
  queryKey: ['bills'],
  queryFn: () => call(endpoints.bills),
});

export const ratesQuery = queryOptions({
  queryKey: ['rates'],
  queryFn: () => call(endpoints.rates),
});

/** Bills and rates feed the reserve and the conversions in every figure. */
export const billQueryKeys = [['bills'], ...figureQueryKeys] as const;
/** Paying a bill can record an entry, or undo the one it recorded. */
export const billPaymentQueryKeys = [
  ...billQueryKeys,
  ['transactions'],
] as const;
export const rateQueryKeys = [['rates'], ...figureQueryKeys] as const;

export function createBill(body: CreateBillBody) {
  return call(endpoints.createBill, { body });
}

export function updateBill(id: string, body: UpdateBillBody) {
  return call(endpoints.updateBill, { params: { id }, body });
}

export async function deleteBill(id: string) {
  await call(endpoints.deleteBill, { params: { id } });
}

/**
 * Marks a due date paid, today unless `paidOn` says otherwise; its reserve
 * is released. With `paid`, it also records the expense.
 */
export function payBill(id: string, body: CreateBillPaymentBody) {
  return call(endpoints.payBill, { params: { id }, body });
}

export function unpayBill(id: string, dueOn: LocalDate) {
  return call(endpoints.unpayBill, { params: { id, dueOn } });
}

/** A rate for a pair and day that already has one replaces it. */
export function createRate(body: CreateRateBody) {
  return call(endpoints.createRate, { body });
}

export async function deleteRate(id: string) {
  await call(endpoints.deleteRate, { params: { id } });
}
