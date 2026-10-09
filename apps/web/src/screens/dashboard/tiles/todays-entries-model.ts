import type {
  AccountView,
  CategoryView,
  TransactionView,
} from '@allotr/shared';
import { entryRows, type EntryRow } from '@/features/today/entries';

// Today's entries for the dashboard tile, in the order the server sent
// them, each with the time of day it was given.

export interface DashboardEntry extends EntryRow {
  /** `HH:MM`, or null when the entry has no time of day. */
  time: string | null;
}

export function dashboardEntries(
  transactions: readonly TransactionView[],
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): DashboardEntry[] {
  const times = new Map(transactions.map((e) => [e.id, e.occurredTime]));
  return entryRows(transactions, accounts, categories).map((row) => ({
    ...row,
    time: times.get(row.id)?.slice(0, 5) ?? null,
  }));
}

/** `series-3` → 3, the index `CategoryIcon` takes. */
export function seriesNumber(
  colour: string,
): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | undefined {
  const n = Number(colour.replace('series-', ''));
  return n >= 1 && n <= 8 ? (n as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) : undefined;
}
