import {
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { TransactionId } from '../ledger/types.ts';
import type { LedgerView } from './types.ts';

// Top payees: what a period spent per payee, in each currency on its own.
// The ledger has no payee field; the payee of an entry is its note, the same
// free text the transaction search matches. Computed, never stored, and
// never summed across currencies, so no exchange rate is needed.
//
// What counts (docs/architecture.md, GET /v1/reports/payees):
// - Spending is what an entry posts to the expenses account, so an expense
//   counts, and so does a written-off loan, as in the category report.
//   Transfers, income and opening balances post nothing there and are left
//   out. A cover moves no money, so it has nothing to count.
// - A split is one entry: it adds 1 to the count and all its lines to the
//   total.
// - An entry that was undone, and its reversal, are both left out whatever
//   their dates, so an edit counts once, as the new entry. Entries posted by
//   reconciling are left out too: no one was paid.
// - Entries without a note (or with a blank one) have no payee. They are not
//   listed, but they are in `unnamed` and in the currency's `total`.

/** One payee in one currency. */
export type PayeeTotal = Readonly<{
  /** The note as written most often (ties: the first alphabetically). */
  payee: string;
  /** Entries, not postings. */
  count: number;
  total: Money;
}>;

/** One currency's ranking. */
export type CurrencyPayees = Readonly<{
  currency: CurrencyCode;
  /** Net spending of every entry in the range, named or not, listed or not. */
  total: Money;
  /** The top payees, largest total first. */
  payees: readonly PayeeTotal[];
  /** Payees with spending that did not fit in `limit`. */
  more: number;
  /** Entries without a payee; null when there were none. */
  unnamed: Readonly<{ count: number; total: Money }> | null;
}>;

const cleaned = (note: string) =>
  note.normalize('NFKC').trim().replace(/\s+/gu, ' ');

/**
 * The key two notes share when they name the same payee: surrounding space
 * trimmed, inner runs of whitespace collapsed, case ignored. Null for a
 * missing or blank note.
 */
export function payeeKey(note: string | null): string | null {
  const text = cleaned(note ?? '');
  return text === '' ? null : text.toLowerCase();
}

type Tally = { count: number; total: number; names: Map<string, number> };

const tally = (): Tally => ({ count: 0, total: 0, names: new Map() });

function nameOf(names: ReadonlyMap<string, number>): string {
  let best = '';
  let uses = 0;
  for (const [name, n] of names) {
    if (n > uses || (n === uses && name < best)) {
      best = name;
      uses = n;
    }
  }
  return best;
}

const byCode = (a: CurrencyCode, b: CurrencyCode) =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * The `limit` biggest payees per currency for entries dated from `from` to
 * `to`. Ranked by total, then count, then name, so the order is total and
 * stable. Payees whose net spending is not above zero (a refund booked
 * against them) are not listed. Currencies are in code order; one with no
 * spending is left out.
 */
export function topPayees(
  view: LedgerView,
  range: Readonly<{ from: LocalDate; to: LocalDate }>,
  limit: number,
): CurrencyPayees[] {
  const undone = new Set<TransactionId>();
  for (const t of view.ledger) {
    if (t.reversesId !== null) {
      undone.add(t.id);
      undone.add(t.reversesId);
    }
  }
  const adjustments = view.reconcileAdjustments ?? new Set<TransactionId>();

  type Group = { total: number; unnamed: Tally; payees: Map<string, Tally> };
  const groups = new Map<CurrencyCode, Group>();
  for (const t of view.ledger) {
    if (t.occurredOn < range.from || t.occurredOn > range.to) continue;
    if (undone.has(t.id) || adjustments.has(t.id)) continue;
    const key = payeeKey(t.note);
    const spent = new Map<CurrencyCode, number>();
    for (const p of t.postings) {
      if (view.chart.get(p.accountId)?.systemRole !== 'expenses') continue;
      spent.set(
        p.amount.currency,
        (spent.get(p.amount.currency) ?? 0) + p.amount.amountMinor,
      );
    }
    for (const [currency, amount] of spent) {
      const group = groups.get(currency) ?? {
        total: 0,
        unnamed: tally(),
        payees: new Map<string, Tally>(),
      };
      groups.set(currency, group);
      group.total += amount;
      let into = group.unnamed;
      if (key !== null && t.note !== null) {
        into = group.payees.get(key) ?? tally();
        group.payees.set(key, into);
        const name = cleaned(t.note);
        into.names.set(name, (into.names.get(name) ?? 0) + 1);
      }
      into.count += 1;
      into.total += amount;
    }
  }

  return [...groups]
    .sort(([a], [b]) => byCode(a, b))
    .map(([currency, group]) => {
      const ranked = [...group.payees]
        .filter(([, p]) => p.total > 0)
        .sort(
          ([ka, a], [kb, b]) =>
            b.total - a.total || b.count - a.count || (ka < kb ? -1 : 1),
        );
      return {
        currency,
        total: money(group.total, currency),
        payees: ranked.slice(0, limit).map(([, p]) => ({
          payee: nameOf(p.names),
          count: p.count,
          total: money(p.total, currency),
        })),
        more: Math.max(0, ranked.length - limit),
        unnamed:
          group.unnamed.count === 0
            ? null
            : {
                count: group.unnamed.count,
                total: money(group.unnamed.total, currency),
              },
      };
    })
    .filter((g) => g.total.amountMinor !== 0 || g.payees.length > 0);
}
