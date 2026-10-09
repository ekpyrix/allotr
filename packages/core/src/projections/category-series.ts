import {
  addDays,
  lastDayOfMonth,
  localDate,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { CategoryId } from '../ledger/types.ts';
import { categoryTotalsBetween, rollUpCategories } from './category-summary.ts';
import type { Cycle, LedgerView } from './types.ts';

// Category spending across consecutive periods, for the trends chart. Each
// point is exactly what the single-period category summary reports for that
// period (a subcategory counts in its top-level parent, a merged category in
// the one it merged into, converted at the rate of the period's last day), so
// the series never disagrees with the summary. Computed, never stored.

/** An inclusive run of days. */
export type SeriesPeriod = Readonly<{ from: LocalDate; to: LocalDate }>;

/** One top-level category (or null: no category) across the periods. */
export type SeriesGroup = Readonly<{
  categoryId: CategoryId | null;
  /** One amount per period, oldest first, zero where nothing was booked. */
  points: readonly Money[];
}>;

export type CategorySeries = Readonly<{
  periods: readonly SeriesPeriod[];
  /** Largest total across the periods first. */
  groups: readonly SeriesGroup[];
  /** Everything spent in each period; the sum of the groups' points. */
  totals: readonly Money[];
  missingRates: readonly CurrencyCode[];
}>;

/**
 * The `count` cycles up to and including the one opened on `endingOn`,
 * oldest first. The open cycle runs through `today`; a closed one through the
 * day before the next opened. Fewer are returned if history is shorter.
 */
export function cyclePeriods(
  cycles: readonly Cycle[],
  endingOn: LocalDate,
  count: number,
  today: LocalDate,
): SeriesPeriod[] {
  const end = cycles.findIndex((c) => c.openedOn === endingOn);
  if (end < 0) return [];
  return cycles.slice(Math.max(0, end + 1 - count), end + 1).map((c) => ({
    from: c.openedOn,
    to: c.closedOn === null ? today : addDays(c.closedOn, -1),
  }));
}

/** The `count` calendar months ending with `endMonth` (`YYYY-MM`), oldest first. */
export function monthPeriods(endMonth: string, count: number): SeriesPeriod[] {
  const periods: SeriesPeriod[] = [];
  let first = localDate(`${endMonth}-01`);
  for (let i = 0; i < count; i += 1) {
    periods.unshift({ from: first, to: lastDayOfMonth(first) });
    first = localDate(`${addDays(first, -1).slice(0, 7)}-01`);
  }
  return periods;
}

/**
 * Spending per top-level category for each of `periods`, in the default
 * currency. `periods` must be ordered and not overlap; nothing else is
 * assumed, so months and cycles both work.
 */
export function categorySeries(
  view: LedgerView,
  periods: readonly SeriesPeriod[],
  parentOf: ReadonlyMap<CategoryId, CategoryId | null>,
  mergedInto: ReadonlyMap<CategoryId, CategoryId> = new Map(),
): CategorySeries {
  const currency = view.settings.defaultCurrency;
  const missing = new Set<CurrencyCode>();
  const perPeriod = periods.map((period) => {
    const spending = categoryTotalsBetween(
      view,
      period,
      'expenses',
      mergedInto,
    );
    for (const code of spending.missingRates) missing.add(code);
    return rollUpCategories(spending.totals, parentOf);
  });
  const ids = new Set(perPeriod.flatMap((p) => p.map((g) => g.categoryId)));
  const groups = [...ids].map((categoryId) => ({
    categoryId,
    points: perPeriod.map(
      (inPeriod) =>
        inPeriod.find((g) => g.categoryId === categoryId)?.amount ??
        money(0, currency),
    ),
  }));
  const sum = (points: readonly Money[]) =>
    points.reduce((acc, p) => acc + p.amountMinor, 0);
  groups.sort(
    (a, b) =>
      sum(b.points) - sum(a.points) ||
      (a.categoryId ?? '').localeCompare(b.categoryId ?? ''),
  );
  return {
    periods,
    groups,
    totals: periods.map((_, i) =>
      money(
        groups.reduce((acc, g) => acc + (g.points[i]?.amountMinor ?? 0), 0),
        currency,
      ),
    ),
    missingRates: [...missing].sort(),
  };
}
