import type { UpdateLedgerSettingsBody } from '@allotr/shared';
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
