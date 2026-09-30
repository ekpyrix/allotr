import type { CurrencyCode, LocalDate, Money } from '@allotr/shared';
import type { Chart } from '../ledger/chart.ts';
import type { AccountId } from '../ledger/types.ts';
import { totalOn } from './rates.ts';
import type { ExchangeRate } from './types.ts';

// The ledger's day totals (spec §11.2): what a day's entries did to the
// user's own accounts, in the default currency at that day's rate.
// Postings on system accounts (income, expenses, equity) are left out, so
// spending counts against the day, income for it, a transfer between the
// user's accounts nets to nothing, and an undo cancels its entry. With an
// account, only that account's postings count, as a list filtered by it
// shows.

export type DayTotal = Readonly<{
  date: LocalDate;
  net: Money;
  /** Currencies without a rate to the default one that day, left out. */
  missingRates: readonly CurrencyCode[];
}>;

type Entry = Readonly<{
  occurredOn: LocalDate;
  postings: readonly Readonly<{ accountId: AccountId; amount: Money }>[];
}>;

/** One total per day that has entries, newest first. */
export function dayNetTotals(
  chart: Chart,
  entries: readonly Entry[],
  rates: readonly ExchangeRate[],
  target: CurrencyCode,
  account?: AccountId,
): DayTotal[] {
  const byDay = new Map<LocalDate, Money[]>();
  for (const entry of entries) {
    const amounts = byDay.get(entry.occurredOn) ?? [];
    for (const posting of entry.postings) {
      const owner = chart.get(posting.accountId);
      if (owner === undefined || owner.systemRole !== null) continue;
      if (account !== undefined && posting.accountId !== account) continue;
      amounts.push(posting.amount);
    }
    byDay.set(entry.occurredOn, amounts);
  }
  return [...byDay]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, amounts]) => {
      const figure = totalOn(rates, amounts, target, date);
      return {
        date,
        net: figure.amount,
        missingRates: [...figure.missingRates],
      };
    });
}
