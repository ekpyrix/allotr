import type { Money } from '@allotr/shared';

/**
 * How full a budget's bar is, 0 to 100: the server's `spent` against what
 * it had (`spent` plus `left`). It places a bar and is never shown as a
 * figure; every amount on screen is the server's.
 */
export function spentShare(spent: Money, left: Money): number {
  const total = spent.amountMinor + left.amountMinor;
  if (spent.amountMinor <= 0 || total <= 0)
    return spent.amountMinor > 0 ? 100 : 0;
  return Math.min(100, (spent.amountMinor / total) * 100);
}
