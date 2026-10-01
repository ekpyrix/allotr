import {
  addDays,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { accountBalances } from '../ledger/balances.ts';
import type { AccountId, CategoryId } from '../ledger/types.ts';
import { budgetStatus } from './budget-status.ts';
import { countedSpendLines, type BudgetId, type TagId } from './budgets.ts';
import { cyclesOf } from './cycles.ts';
import { dailyFiguresOn, paceExclusions } from './daily.ts';
import { groupsOn } from './pools.ts';
import { cycleSnapshot } from './snapshot.ts';
import { totalOn } from './rates.ts';
import type { LedgerView } from './types.ts';

// The payday plan, the emergency fund, net worth and the weekly review
// (ADR 0021, docs/domain.md "Payday plan and insights"). All are computed from
// the ledger and settings when read.

/** What the user sets aside first at payday. */
export type PayYourselfFirst =
  | Readonly<{ kind: 'fixed'; amount: Money }>
  /** Hundredths of a percent of the paycheck: 1000 is 10%. */
  | Readonly<{ kind: 'percent'; basisPoints: number }>;

/**
 * The savings line for a paycheck: a fixed amount, never more than the
 * paycheck, or a share of it rounded down so the plan never promises more
 * than there is.
 */
export function savingsLine(
  rule: PayYourselfFirst | null | undefined,
  income: Money,
): Money {
  if (rule === null || rule === undefined) return money(0, income.currency);
  if (rule.kind === 'fixed') {
    const amount = Math.min(rule.amount.amountMinor, income.amountMinor);
    return rule.amount.currency === income.currency
      ? money(Math.max(0, amount), income.currency)
      : money(0, income.currency);
  }
  const share =
    (BigInt(Math.max(0, income.amountMinor)) * BigInt(rule.basisPoints)) /
    10_000n;
  return money(Number(share), income.currency);
}

/** Cycles' worth of history the averages look at. */
const HISTORY_CYCLES = 3;

type Average = Readonly<{
  /** Per category, in the default currency, over the cycles counted. */
  byCategory: ReadonlyMap<CategoryId | null, bigint>;
  total: bigint;
  cycles: number;
  missingRates: readonly CurrencyCode[];
}>;

// Average spending per cycle over the last closed cycles (up to three), each
// converted at the rate of its last day. A cycle with no spending still
// counts, so a quiet month lowers the average.
function averageSpending(view: LedgerView, today: LocalDate): Average {
  const cycles = cyclesOf(view, today);
  const closed = cycles
    .filter((c) => c.closedOn !== null)
    .slice(-HISTORY_CYCLES);
  const currency = view.settings.defaultCurrency;
  const sums = new Map<CategoryId | null, bigint>();
  const missing = new Set<CurrencyCode>();
  for (const cycle of closed) {
    const snapshot = cycleSnapshot(view, cycle, today, cycles);
    const byCategory = new Map<CategoryId | null, Money[]>();
    for (const row of snapshot.spending) {
      byCategory.set(row.categoryId, [
        ...(byCategory.get(row.categoryId) ?? []),
        row.amount,
      ]);
    }
    for (const [category, amounts] of byCategory) {
      const figure = totalOn(view.rates, amounts, currency, snapshot.lastDay);
      for (const c of figure.missingRates) missing.add(c);
      sums.set(
        category,
        (sums.get(category) ?? 0n) + BigInt(figure.amount.amountMinor),
      );
    }
  }
  const n = BigInt(Math.max(1, closed.length));
  const byCategory = new Map(
    [...sums].map(([category, sum]) => [category, sum / n] as const),
  );
  return {
    byCategory,
    total: [...byCategory.values()].reduce((a, b) => a + b, 0n),
    cycles: closed.length,
    missingRates: [...missing].sort(),
  };
}

/** One line of the payday sheet. */
export type PlanLine = Readonly<{
  /** The budget it changes, or null when it would plan a new one. */
  budgetId: BudgetId | null;
  categoryId: CategoryId | null;
  tagId: TagId | null;
  /** What the budget plans this period; zero for a new line. */
  current: Money;
  /** Average spending in the category over past cycles. */
  suggested: Money;
  /** What the sheet fills in: the plan so far, else the suggestion. */
  prefill: Money;
}>;

export type PaydayPlan = Readonly<{
  today: LocalDate;
  /** Paychecks that opened or joined the current cycle. */
  income: Money;
  /** The savings line, first in the plan; zero when none is set. */
  savings: Money;
  /** The rest of the paycheck after savings. */
  toPlan: Money;
  lines: readonly PlanLine[];
  /** Past cycles the suggestions average over; zero means none yet. */
  historyCycles: number;
  missingRates: readonly CurrencyCode[];
}>;

/**
 * The payday sheet: the savings line first (pay yourself first), then the
 * budgets prefilled with this period's plan, and a suggestion for every
 * category without a budget that has been spending, so one tap confirms it.
 */
export function paydayPlan(view: LedgerView, today: LocalDate): PaydayPlan {
  const currency = view.settings.defaultCurrency;
  const cycles = cyclesOf(view, today);
  const cycle = cycles.at(-1);
  const m = (amount: bigint) => money(Number(amount), currency);
  const paychecks = new Set(view.paycheckCategories);
  const reversed = new Set(
    view.ledger.flatMap((t) => (t.reversesId === null ? [] : [t.reversesId])),
  );
  const income = totalOn(
    view.rates,
    view.ledger
      .filter(
        (t) =>
          t.kind === 'income' &&
          !reversed.has(t.id) &&
          cycle !== undefined &&
          t.occurredOn >= cycle.openedOn &&
          t.occurredOn <= today,
      )
      .flatMap((t) =>
        t.postings
          .filter((p) => p.categoryId !== null && paychecks.has(p.categoryId))
          .map((p) => money(-p.amount.amountMinor, p.amount.currency)),
      ),
    currency,
    today,
  );
  const savings = savingsLine(view.settings.payYourselfFirst, income.amount);
  const average = averageSpending(view, today);
  const status = budgetStatus(view, today);
  const planned = new Set<CategoryId>();
  const lines: PlanLine[] = [];
  for (const line of status.lines) {
    const target = line.budget.target;
    if (target.kind === 'buffer') continue;
    const category = target.kind === 'category' ? target.categoryId : null;
    if (category !== null) planned.add(category);
    const suggested = m(
      category === null ? 0n : (average.byCategory.get(category) ?? 0n),
    );
    lines.push({
      budgetId: line.budget.id,
      categoryId: category,
      tagId: target.kind === 'tag' ? target.tagId : null,
      current: line.planned,
      suggested,
      prefill: line.planned.amountMinor > 0 ? line.planned : suggested,
    });
  }
  for (const [category, amount] of average.byCategory) {
    if (category === null || planned.has(category) || amount <= 0n) continue;
    // Suggest only categories a budget can go on: expense categories the
    // budgets know about.
    if (view.budgets !== undefined && !view.budgets.categories.has(category)) {
      continue;
    }
    lines.push({
      budgetId: null,
      categoryId: category,
      tagId: null,
      current: m(0n),
      suggested: m(amount),
      prefill: m(amount),
    });
  }
  return {
    today,
    income: income.amount,
    savings,
    toPlan: money(income.amount.amountMinor - savings.amountMinor, currency),
    lines,
    historyCycles: average.cycles,
    missingRates: [
      ...new Set([...income.missingRates, ...average.missingRates]),
    ].sort(),
  };
}

export type EmergencyFund = Readonly<{
  /** Average spending per cycle over past cycles; zero without history. */
  monthlyExpenses: Money;
  historyCycles: number;
  /** The months the user aims at (3 to 6 is the usual range). */
  months: number;
  /** `months` of expenses, and the usual 3 and 6. */
  target: Money;
  targetLow: Money;
  targetHigh: Money;
  /** What the accounts that do not count toward the daily number hold. */
  saved: Money;
  /** Saved over target in hundredths of a percent, capped at 10000. */
  progressBasisPoints: number;
  /** How many months of expenses the savings cover; null without history. */
  monthsCovered: number | null;
  missingRates: readonly CurrencyCode[];
}>;

/** Savings against a target of months of average expenses. */
export function emergencyFund(
  view: LedgerView,
  today: LocalDate,
): EmergencyFund {
  const currency = view.settings.defaultCurrency;
  const average = averageSpending(view, today);
  const months = view.settings.emergencyMonths ?? 3;
  const groups = groupsOn(view, today);
  const balances = accountBalances(view.ledger, today);
  const saved = totalOn(
    view.rates,
    [...balances].flatMap(([id, balance]) =>
      groups.get(id) === 'off' ? [balance] : [],
    ),
    currency,
    today,
  );
  const monthly = average.total;
  const target = monthly * BigInt(months);
  const savedMinor = BigInt(saved.amount.amountMinor);
  const progress =
    target <= 0n
      ? 0
      : Number(
          savedMinor <= 0n
            ? 0n
            : (savedMinor * 10_000n) / target > 10_000n
              ? 10_000n
              : (savedMinor * 10_000n) / target,
        );
  return {
    monthlyExpenses: money(Number(monthly), currency),
    historyCycles: average.cycles,
    months,
    target: money(Number(target), currency),
    targetLow: money(Number(monthly * 3n), currency),
    targetHigh: money(Number(monthly * 6n), currency),
    saved: saved.amount,
    progressBasisPoints: progress,
    monthsCovered:
      monthly <= 0n
        ? null
        : Math.floor((Number(savedMinor) * 10) / Number(monthly)) / 10,
    missingRates: [
      ...new Set([...average.missingRates, ...saved.missingRates]),
    ].sort(),
  };
}

export type NetWorthPoint = Readonly<{ date: LocalDate; amount: Money }>;

export type NetWorth = Readonly<{
  /** Every account, savings included, receivables and payables with their sign. */
  amount: Money;
  missingRates: readonly CurrencyCode[];
}>;

/** Net worth at the end of `date`: all accounts, in the default currency. */
export function netWorthOn(view: LedgerView, date: LocalDate): NetWorth {
  const balances = accountBalances(view.ledger, date);
  const user = (id: AccountId) => view.chart.get(id)?.systemRole === null;
  const figure = totalOn(
    view.rates,
    [...balances].flatMap(([id, balance]) => (user(id) ? [balance] : [])),
    view.settings.defaultCurrency,
    date,
  );
  return { amount: figure.amount, missingRates: figure.missingRates };
}

/** Net worth for each day from `from` through `to`, from one pass over the ledger. */
export function netWorthSeries(
  view: LedgerView,
  from: LocalDate,
  to: LocalDate,
): { points: NetWorthPoint[]; missingRates: CurrencyCode[] } {
  const currency = view.settings.defaultCurrency;
  const sums = new Map<CurrencyCode, bigint>();
  const byDay = new Map<LocalDate, Map<CurrencyCode, bigint>>();
  for (const t of view.ledger) {
    if (t.occurredOn > to) continue;
    for (const p of t.postings) {
      if (view.chart.get(p.accountId)?.systemRole !== null) continue;
      const amount = BigInt(p.amount.amountMinor);
      if (t.occurredOn < from) {
        sums.set(
          p.amount.currency,
          (sums.get(p.amount.currency) ?? 0n) + amount,
        );
      } else {
        const day = byDay.get(t.occurredOn) ?? new Map<CurrencyCode, bigint>();
        day.set(p.amount.currency, (day.get(p.amount.currency) ?? 0n) + amount);
        byDay.set(t.occurredOn, day);
      }
    }
  }
  const points: NetWorthPoint[] = [];
  const missing = new Set<CurrencyCode>();
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const [c, amount] of byDay.get(date) ?? []) {
      sums.set(c, (sums.get(c) ?? 0n) + amount);
    }
    const figure = totalOn(
      view.rates,
      [...sums].map(([c, sum]) => money(Number(sum), c)),
      currency,
      date,
    );
    for (const c of figure.missingRates) missing.add(c);
    points.push({ date, amount: figure.amount });
  }
  return { points, missingRates: [...missing].sort() };
}

export type WeeklyReview = Readonly<{
  /** The seven days ending today, and the seven before them. */
  from: LocalDate;
  to: LocalDate;
  spent: Money;
  previousSpent: Money;
  /** Largest spending categories of the week, biggest first (at most three). */
  topCategories: readonly Readonly<{
    categoryId: CategoryId | null;
    amount: Money;
  }>[];
  entries: number;
  leftToday: Money;
  free: Money;
  daysLeft: number;
  /** Budgets whose spending passed what they had this period. */
  overBudget: number;
  /** Shortfall this period that cover paid, and what nothing covered. */
  covered: Money;
  uncovered: Money;
  missingRates: readonly CurrencyCode[];
}>;

/** The figures a weekly review shows, from the same ledger as every other. */
export function weeklyReview(view: LedgerView, today: LocalDate): WeeklyReview {
  const currency = view.settings.defaultCurrency;
  const from = addDays(today, -6);
  const previousFrom = addDays(today, -13);
  const missing = new Set<CurrencyCode>();
  // Like the pace figures: linked bill payments and reconcile adjustments
  // are not spending of the week.
  const lines = countedSpendLines(view, today, paceExclusions(view), missing);
  const week = lines.filter((l) => l.date >= from);
  const before = lines.filter((l) => l.date >= previousFrom && l.date < from);
  const sum = (rows: readonly { amount: bigint }[]) =>
    rows.reduce((total, row) => total + row.amount, 0n);
  const byCategory = new Map<CategoryId | null, bigint>();
  for (const l of week) {
    byCategory.set(
      l.categoryId,
      (byCategory.get(l.categoryId) ?? 0n) + l.amount,
    );
  }
  const status = budgetStatus(view, today);
  const daily = dailyFiguresOn(view, today);
  return {
    from,
    to: today,
    spent: money(Number(sum(week)), currency),
    previousSpent: money(Number(sum(before)), currency),
    topCategories: [...byCategory]
      .sort(
        ([a, x], [b, y]) =>
          Number(y - x) || String(a ?? '').localeCompare(String(b ?? '')),
      )
      .slice(0, 3)
      .map(([categoryId, amount]) => ({
        categoryId,
        amount: money(Number(amount), currency),
      })),
    entries: new Set(week.map((l) => l.entryId)).size,
    leftToday: daily.leftToday,
    free: status.free,
    daysLeft: daily.daysLeft,
    overBudget: status.lines.filter((l) => l.overflow.amountMinor > 0).length,
    covered: status.covered.shortfall,
    uncovered: status.covered.uncovered,
    missingRates: [...new Set([...missing, ...daily.missingRates])].sort(),
  };
}
