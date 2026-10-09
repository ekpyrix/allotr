import { money, type CurrencyCode, type Money } from '@allotr/shared';
import type { Chart } from '../ledger/chart.ts';
import type { Transaction } from '../ledger/types.ts';

// Totals for a set of entries, such as what a filtered transaction list
// matches. Spent and income are the balancing legs of expenses and income,
// as category reports count them, so:
//
// - a transfer, a lend or borrow, a repayment, an opening balance and a
//   budget switch are neither spent nor income (they move money, they do
//   not earn or spend it);
// - a split counts each line in its own category, and only the user's own
//   share of a split bill is spent (the rest sits in Receivables);
// - an undo carries the opposite legs, so it cancels its entry;
// - a write-off is spent, as in category reports.
//
// Amounts stay in their own currency; nothing is summed across currencies
// and no rate is applied. Spent and income are positive when money went
// out or came in, and net = income - spent, so a net below zero means more
// went out than came in.

/** One currency's figures for a set of entries. */
export type CurrencyTotals = Readonly<{
  spent: Money;
  income: Money;
  net: Money;
}>;

export type EntryTotals = Readonly<{
  /** Entries in the set, undos included. */
  count: number;
  /** One per currency that has spent or income, ordered by currency code. */
  byCurrency: readonly CurrencyTotals[];
}>;

/** How to split a set of entries into groups. */
export type EntryGrouping = 'day' | 'category';

export type EntryGroupTotals = EntryTotals &
  Readonly<{
    /**
     * The day (`YYYY-MM-DD`) or the category ID; null for entries with no
     * category. Days run newest first; categories by ID, none last.
     */
    key: string | null;
  }>;

type TotalsEntry = Pick<Transaction, 'occurredOn' | 'categoryId' | 'postings'>;

type Sums = Map<CurrencyCode, { spent: number; income: number }>;

function add(
  sums: Sums,
  currency: CurrencyCode,
  field: 'spent' | 'income',
  amountMinor: number,
) {
  const current = sums.get(currency) ?? { spent: 0, income: 0 };
  current[field] += amountMinor;
  sums.set(currency, current);
}

function totalsOf(count: number, sums: Sums): EntryTotals {
  return {
    count,
    byCurrency: [...sums]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, { spent, income }]) => ({
        spent: money(spent, currency),
        income: money(income, currency),
        net: money(income - spent, currency),
      })),
  };
}

type Leg = Readonly<{
  field: 'spent' | 'income';
  currency: CurrencyCode;
  /** Positive when money went out (spent) or came in (income). */
  amountMinor: number;
  categoryId: string | null;
}>;

/** The spent and income legs of an entry, with the category of each. */
function legs(chart: Chart, entry: TotalsEntry): Leg[] {
  return entry.postings.flatMap((posting): Leg[] => {
    const role = chart.get(posting.accountId)?.systemRole;
    if (role === 'expenses') {
      return [
        {
          field: 'spent',
          currency: posting.amount.currency,
          amountMinor: posting.amount.amountMinor,
          categoryId: posting.categoryId,
        },
      ];
    }
    if (role === 'income') {
      return [
        {
          field: 'income',
          currency: posting.amount.currency,
          amountMinor: -posting.amount.amountMinor,
          categoryId: posting.categoryId,
        },
      ];
    }
    return [];
  });
}

/** Count, spent, income and net of the entries, per currency. */
export function entryTotals(
  chart: Chart,
  entries: readonly TotalsEntry[],
): EntryTotals {
  const sums: Sums = new Map();
  for (const entry of entries) {
    for (const leg of legs(chart, entry)) {
      add(sums, leg.currency, leg.field, leg.amountMinor);
    }
  }
  return totalsOf(entries.length, sums);
}

function compareKeys(
  grouping: EntryGrouping,
  a: string | null,
  b: string | null,
) {
  if (grouping === 'day') return (b ?? '').localeCompare(a ?? '');
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

/**
 * The same figures per group. By day, every entry falls in its day. By
 * category, each spent or income leg falls in its own category, so a split
 * entry is in several groups and counted in each (the groups' counts can add
 * up to more than the set's); an entry with neither, such as a transfer, is
 * in its own category's group, or in none. Spent, income and net always add
 * up to the set's.
 */
export function entryGroupTotals(
  chart: Chart,
  entries: readonly TotalsEntry[],
  grouping: EntryGrouping,
): EntryGroupTotals[] {
  const groups = new Map<string | null, { count: number; sums: Sums }>();
  const group = (key: string | null) => {
    const found = groups.get(key) ?? { count: 0, sums: new Map() };
    groups.set(key, found);
    return found;
  };
  for (const entry of entries) {
    const entryLegs = legs(chart, entry);
    const keyOf = (leg: Leg) =>
      grouping === 'day' ? entry.occurredOn : leg.categoryId;
    const keys = new Set<string | null>(
      grouping === 'day'
        ? [entry.occurredOn]
        : entryLegs.length === 0
          ? [entry.categoryId]
          : entryLegs.map(keyOf),
    );
    for (const key of keys) group(key).count += 1;
    for (const leg of entryLegs) {
      add(group(keyOf(leg)).sums, leg.currency, leg.field, leg.amountMinor);
    }
  }
  return [...groups]
    .sort(([a], [b]) => compareKeys(grouping, a, b))
    .map(([key, { count, sums }]) => ({ key, ...totalsOf(count, sums) }));
}
