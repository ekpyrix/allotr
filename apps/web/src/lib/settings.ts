import type {
  CreateCategoryBody,
  UpdateCategoryBody,
  UpdateLedgerSettingsBody,
} from '@allotr/shared';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
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
