import {
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { AccountId, CategoryId } from '../ledger/types.ts';
import { totalOn } from './rates.ts';
import { byCategory, type CategoryTotal } from './snapshot.ts';
import type { LedgerView } from './types.ts';

// Category summaries (FR-W2): what a period spent or earned per category,
// with a subcategory counted in its parent. Computed, never stored; the web
// app only shows the figures (architecture §4).

/** One category, or the entries without one (`categoryId` null). */
export type CategoryNode = CategoryTotal;

/** A top-level category with everything under it, largest first. */
export type CategoryGroup = Readonly<{
  categoryId: CategoryId | null;
  /** The sum of `children`. */
  amount: Money;
  /**
   * The subcategories with figures. Entries booked directly on the parent
   * appear as a child with the parent's own id.
   */
  children: readonly CategoryNode[];
}>;

const bigger = (a: CategoryNode, b: CategoryNode) =>
  b.amount.amountMinor - a.amount.amountMinor ||
  (a.categoryId ?? '').localeCompare(b.categoryId ?? '');

/**
 * Rolls category totals up to their top-level parents. Every total is in
 * one currency. `parentOf` maps a subcategory to its parent; a category
 * absent from it, or mapped to null, is top level.
 */
export function rollUpCategories(
  totals: readonly CategoryNode[],
  parentOf: ReadonlyMap<CategoryId, CategoryId | null>,
): CategoryGroup[] {
  const groups = new Map<CategoryId | null, CategoryNode[]>();
  for (const total of totals) {
    const top =
      total.categoryId === null
        ? null
        : (parentOf.get(total.categoryId) ?? total.categoryId);
    groups.set(top, [...(groups.get(top) ?? []), total]);
  }
  return [...groups]
    .map(([categoryId, nodes]) => {
      const currency = nodes[0]?.amount.currency;
      const sum = nodes.reduce((acc, n) => acc + n.amount.amountMinor, 0);
      return {
        categoryId,
        amount: money(sum, currency ?? 'USD'),
        // A top-level category with no children is its own only node.
        children: (categoryId === null ? [] : [...nodes]).sort(bigger),
      };
    })
    .sort(bigger);
}

/**
 * Spending (`expenses`) or income per category for entries dated from
 * `from` to `to`, in the default currency at the rate of `to`. A merged
 * category counts as the one it merged into. Currencies without a rate are
 * left out and named.
 */
export function categoryTotalsBetween(
  view: LedgerView,
  range: Readonly<{ from: LocalDate; to: LocalDate }>,
  role: 'expenses' | 'income',
  mergedInto: ReadonlyMap<CategoryId, CategoryId> = new Map(),
): Readonly<{ totals: CategoryNode[]; missingRates: CurrencyCode[] }> {
  const roleOf = (id: AccountId) => view.chart.get(id)?.systemRole ?? null;
  const sign = role === 'expenses' ? 1 : -1;
  const native = byCategory(
    view.ledger
      .filter((t) => t.occurredOn >= range.from && t.occurredOn <= range.to)
      .flatMap((t) =>
        t.postings
          .filter((p) => roleOf(p.accountId) === role)
          .map(
            (p) =>
              [
                p.categoryId,
                money(sign * p.amount.amountMinor, p.amount.currency),
              ] as const,
          ),
      ),
  );
  const target = view.settings.defaultCurrency;
  const missing = new Set<CurrencyCode>();
  const merged = new Map<CategoryId | null, Money[]>();
  for (const { categoryId, amount } of native) {
    const key =
      categoryId === null ? null : (mergedInto.get(categoryId) ?? categoryId);
    merged.set(key, [...(merged.get(key) ?? []), amount]);
  }
  const totals = [...merged]
    .map(([categoryId, amounts]) => {
      const result = totalOn(view.rates, amounts, target, range.to);
      for (const currency of result.missingRates) missing.add(currency);
      return { categoryId, amount: result.amount };
    })
    .filter(({ amount }) => amount.amountMinor !== 0)
    .sort(bigger);
  return { totals, missingRates: [...missing].sort() };
}
