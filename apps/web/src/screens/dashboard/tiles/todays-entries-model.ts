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
  /** The note, else the category; null when the entry has neither. */
  payee: string | null;
  /** The category, only when the payee column is not already showing it. */
  category: string | null;
}

export function dashboardEntries(
  transactions: readonly TransactionView[],
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): DashboardEntry[] {
  const times = new Map(transactions.map((e) => [e.id, e.occurredTime]));
  return entryRows(transactions, accounts, categories).map((row) => {
    const payee = row.note ?? row.title;
    return {
      ...row,
      time: times.get(row.id)?.slice(0, 5) ?? null,
      payee,
      category: row.title === payee ? null : row.title,
    };
  });
}
