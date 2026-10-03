import type { Money } from '@allotr/shared';

// The share of a cycle's income that went to savings (docs/domain.md
// "Payday plan and insights"), in hundredths of a percent so no float
// reaches the API. Both amounts are in the default currency.

/**
 * `savingsNetChange` over `income`, in basis points, rounded half to even.
 * Negative when savings fell. Null when there was no income to compare
 * with, rather than an invented rate.
 */
export function savingsRate(
  income: Money,
  savingsNetChange: Money,
): number | null {
  if (income.amountMinor <= 0) return null;
  const scaled = savingsNetChange.amountMinor * 10_000;
  const whole = Math.trunc(scaled / income.amountMinor);
  const rest = scaled - whole * income.amountMinor;
  const twice = Math.abs(rest) * 2;
  if (twice < income.amountMinor) return whole;
  if (twice > income.amountMinor || whole % 2 !== 0)
    return whole + (scaled < 0 ? -1 : 1);
  return whole;
}
