import {
  money,
  type AccountHistoryView,
  type Money,
  type ReconcileResultView,
} from '@allotr/shared';
import type { ChartTick } from '@/charts/chart';
import type { Point } from '@/charts/math';
import { formatDay } from '@/features/today/format';
import type { ReconcileMode } from '@/features/accounts/reconcile-draft';
import { formatMoneyShort } from '@/lib/format-money';

// The account detail as view models: positions for the chart and the words
// for a reconcile result. Every amount is the server's; the only change made
// to one is its sign, so a debt reads as "owed" and a difference as a size.

export type HistoryChart = Readonly<{
  points: readonly Point[];
  yTicks: readonly ChartTick[];
  xTicks: readonly ChartTick[];
}>;

export function historyChart(
  history: AccountHistoryView['points'],
  locale: string,
): HistoryChart {
  const points = history.map((p, x) => ({ x, y: p.balance.amountMinor }));
  const first = history[0];
  if (first === undefined) return { points, yTicks: [], xTicks: [] };
  const low = history.reduce((a, p) =>
    p.balance.amountMinor < a.balance.amountMinor ? p : a,
  );
  const high = history.reduce((a, p) =>
    p.balance.amountMinor > a.balance.amountMinor ? p : a,
  );
  const extremes =
    low.balance.amountMinor === high.balance.amountMinor ? [low] : [low, high];
  const yTicks = extremes.map((p) => ({
    value: p.balance.amountMinor,
    label: formatMoneyShort(p.balance, locale),
  }));
  const mid = Math.floor((history.length - 1) / 2);
  const xs = [...new Set([0, mid, history.length - 1])];
  const xTicks = xs.map((value) => ({
    value,
    label: formatDay(history[value]?.date ?? first.date, locale),
  }));
  return { points, yTicks, xTicks };
}

export const flip = (m: Money): Money => money(-m.amountMinor, m.currency);
const size = (m: Money): Money => money(Math.abs(m.amountMinor), m.currency);

export type ReconcileOutcome =
  | Readonly<{ kind: 'match' }>
  | Readonly<{
      kind: 'difference';
      /** Which sentence says it; `less` and `more` are for balances. */
      says: 'less' | 'more' | 'owedMore' | 'owedLess';
      /** How an adjustment would be recorded. */
      adjust: 'expense' | 'income';
      /** The size of the difference, unsigned. */
      amount: Money;
      /** The two sides as the form asked for them. */
      ledger: Money;
      bank: Money;
    }>;

/** What a compare result means, in the terms of the form the user filled in. */
export function reconcileOutcome(
  result: ReconcileResultView,
  mode: ReconcileMode,
): ReconcileOutcome {
  if (result.reconciled || result.difference.amountMinor === 0)
    return { kind: 'match' };
  const lower = result.difference.amountMinor < 0;
  const owed = mode === 'owed';
  return {
    kind: 'difference',
    says: owed ? (lower ? 'owedMore' : 'owedLess') : lower ? 'less' : 'more',
    adjust: lower ? 'expense' : 'income',
    amount: size(result.difference),
    ledger: owed ? flip(result.ledgerBalance) : result.ledgerBalance,
    bank: owed ? flip(result.stated) : result.stated,
  };
}
