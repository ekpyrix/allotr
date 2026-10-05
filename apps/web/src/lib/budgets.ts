import type {
  CoverOverrideBody,
  CoverPreviewBody,
  CreateBudgetBody,
  CreatePoolBody,
  UpdateBudgetBody,
  UpdatePoolBody,
} from '@allotr/shared';
import { queryOptions } from '@tanstack/react-query';
import { call } from './api.ts';
import { endpoints } from './endpoints.ts';

// Pools, budgets and cover (ADR 0021). Budget figures are folded from the
// ledger on every read, so they sit under ['today'] and refresh with any
// new entry; pools hold balances, so they sit under ['accounts'].

export const poolsQuery = queryOptions({
  queryKey: ['accounts', 'pools'],
  queryFn: () => call(endpoints.pools),
});

export const budgetsQuery = queryOptions({
  queryKey: ['today', 'budgets'],
  queryFn: () => call(endpoints.budgets),
});

export const coversQuery = queryOptions({
  queryKey: ['today', 'budgets', 'covers'],
  queryFn: () => call(endpoints.covers),
});

/** What a change to budgets or cover touches. */
export const budgetQueryKeys = [
  ['today'],
  ['transactions'],
  ['settings', 'ledger'],
] as const;

export const poolQueryKeys = [['accounts'], ['today']] as const;

export function createBudget(body: CreateBudgetBody) {
  return call(endpoints.createBudget, { body });
}

export function updateBudget(id: string, body: UpdateBudgetBody) {
  return call(endpoints.updateBudget, { params: { id }, body });
}

export function endBudget(id: string) {
  return call(endpoints.endBudget, { params: { id } });
}

/** Removes a budget started this period, as if it was never planned. */
export function deleteBudget(id: string) {
  return call(endpoints.endBudget, {
    params: { id },
    query: { mode: 'delete' },
  });
}

export function setCoverOrder(order: readonly string[]) {
  return call(endpoints.setCoverOrder, { body: { order: [...order] } });
}

export function createPool(body: CreatePoolBody) {
  return call(endpoints.createPool, { body });
}

export function updatePool(id: string, body: UpdatePoolBody) {
  return call(endpoints.updatePool, { params: { id }, body });
}

export function previewCover(body: CoverPreviewBody) {
  return call(endpoints.coverPreview, { body });
}

export function setCoverOverride(id: string, body: CoverOverrideBody) {
  return call(endpoints.setCoverOverride, { params: { id }, body });
}

export function clearCoverOverride(id: string) {
  return call(endpoints.clearCoverOverride, { params: { id } });
}
