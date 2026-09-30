import { money, type Money } from '@allotr/shared';
import type { CategoryTotal } from './snapshot.ts';

// A chart shows a few categories and one "Other" bar (ADR 0020). The sum
// of the rest is worked out here, so the client adds nothing up.

export type RankedTotals = Readonly<{
  /** The first `keep` totals, as given (largest first). */
  top: readonly CategoryTotal[];
  /** The rest folded into one; null when nothing, or only one, was left. */
  other: Readonly<{ count: number; amount: Money }> | null;
}>;

/**
 * Keeps the first `keep` of `totals`, which are in one currency, and sums
 * the rest. A single leftover is shown as itself: a bar called "Other"
 * that stands for one category says less than its name.
 */
export function rankTotals(
  totals: readonly CategoryTotal[],
  keep: number,
): RankedTotals {
  const [first] = totals;
  if (first === undefined || totals.length <= keep + 1)
    return { top: totals, other: null };
  const rest = totals.slice(keep);
  const sum = rest.reduce((s, t) => s + BigInt(t.amount.amountMinor), 0n);
  return {
    top: totals.slice(0, keep),
    other: {
      count: rest.length,
      amount: money(Number(sum), first.amount.currency),
    },
  };
}
