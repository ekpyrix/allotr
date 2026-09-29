import {
  addDays,
  daysBetween,
  localDateIn,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { accountBalances, budgetGroupsOn } from '../ledger/balances.ts';
import { billWindow, cycleOn, cyclesOf } from './cycles.ts';
import { defaultPolicies, dueDates, type Policies } from './policies.ts';
import { totalOn } from './rates.ts';
import type {
  BillDue,
  Cycle,
  DailyFigures,
  Figure,
  LedgerView,
} from './types.ts';

// The daily usable figures (docs/domain.md "Daily usable", FR-C4, FR-C5).
// Sums stay per currency until the end and each is converted once to the
// default currency (ADR 0010). Figures for any day come from the same
// functions, so a back-dated entry corrects past and present alike.

type Sums = Map<CurrencyCode, bigint>;

function add(sums: Sums, currency: CurrencyCode, amount: bigint): void {
  sums.set(currency, (sums.get(currency) ?? 0n) + amount);
}

export function policiesOf(view: LedgerView): Policies {
  return { ...defaultPolicies, ...view.policies };
}

/** On-budget balances minus unpaid reserved bills, per currency. */
export function availableSums(
  view: LedgerView,
  cycles: readonly Cycle[],
  date: LocalDate,
): Sums {
  const groups = budgetGroupsOn(view.chart, view.ledger, date);
  const sums: Sums = new Map();
  for (const [id, balance] of accountBalances(view.ledger, date)) {
    if (groups.get(id) === 'on') {
      add(sums, balance.currency, BigInt(balance.amountMinor));
    }
  }
  const reserved = policiesOf(view).bills.reserved(
    view.bills,
    billWindow(cycleOn(cycles, date)),
    date,
  );
  for (const [currency, amount] of reserved) add(sums, currency, -amount);
  return sums;
}

/**
 * What left the budget as spending from `from` through `to`, per currency:
 * the on-budget side of every entry that reaches an Expenses account, less
 * its undo. Each entry counts by the budget groups of its own day.
 */
function spentSums(view: LedgerView, from: LocalDate, to: LocalDate): Sums {
  const groupsByDay = new Map<LocalDate, ReturnType<typeof budgetGroupsOn>>();
  const groupsOn = (date: LocalDate) => {
    let groups = groupsByDay.get(date);
    if (groups === undefined) {
      groups = budgetGroupsOn(view.chart, view.ledger, date);
      groupsByDay.set(date, groups);
    }
    return groups;
  };
  const expenseAccounts = new Set(
    [...view.chart.values()]
      .filter((a) => a.systemRole === 'expenses')
      .map((a) => a.id),
  );
  const sums: Sums = new Map();
  for (const t of view.ledger) {
    if (t.occurredOn < from || t.occurredOn > to) continue;
    if (!t.postings.some((p) => expenseAccounts.has(p.accountId))) continue;
    const groups = groupsOn(t.occurredOn);
    for (const p of t.postings) {
      if (groups.get(p.accountId) === 'on') {
        add(sums, p.amount.currency, -BigInt(p.amount.amountMinor));
      }
    }
  }
  return sums;
}

/**
 * Bill due dates in the cycle's bill window, on or before `date`, that are
 * not paid by the end of it, earliest first.
 */
export function billsDueOn(
  view: LedgerView,
  cycle: Cycle,
  date: LocalDate,
): BillDue[] {
  const window = billWindow(cycle);
  const due: BillDue[] = [];
  for (const bill of view.bills) {
    for (const dueOn of dueDates(bill.dueDay, window)) {
      if (dueOn > date) break;
      const paid = bill.payments.some(
        (payment) => payment.dueOn === dueOn && payment.paidOn <= date,
      );
      if (!paid) due.push({ billId: bill.id, dueOn, amount: bill.amount });
    }
  }
  return due.sort(
    (a, b) =>
      a.dueOn.localeCompare(b.dueOn) || a.billId.localeCompare(b.billId),
  );
}

function toFigure(view: LedgerView, sums: Sums, date: LocalDate): Figure {
  return totalOn(
    view.rates,
    [...sums].map(([currency, sum]) => money(Number(sum), currency)),
    view.settings.defaultCurrency,
    date,
  );
}

/** Available budget at the end of `date`, as seen from `today`. */
export function availableOn(
  view: LedgerView,
  date: LocalDate,
  today: LocalDate,
): Figure {
  return toFigure(view, availableSums(view, cyclesOf(view, today), date), date);
}

// Rounds down (toward negative infinity) so a daily figure never promises
// more than is there; the spare minor units show up in later days.
function perDay(amount: Money, days: number): Money {
  const total = BigInt(amount.amountMinor);
  const n = BigInt(days);
  let quotient = total / n;
  if (total % n !== 0n && total < 0n) quotient -= 1n;
  return money(Number(quotient), amount.currency);
}

function minus(a: Money, b: Money): Money {
  return money(a.amountMinor - b.amountMinor, a.currency);
}

/** Today's figures for the user's local day at `now`. */
export function dailyFigures(
  view: LedgerView,
  now: Date,
  timeZone: string,
): DailyFigures {
  return dailyFiguresOn(view, localDateIn(now, timeZone));
}

export function dailyFiguresOn(
  view: LedgerView,
  today: LocalDate,
): DailyFigures {
  const cycles = cyclesOf(view, today);
  const cycle = cycleOn(cycles, today);
  // From payday on, until a paycheck arrives, the cycle runs one day at a
  // time; the day after payday it is overdue.
  const overdue = today > cycle.payday;
  const cycleEnd = today >= cycle.payday ? addDays(today, 1) : cycle.payday;
  const daysLeft = Math.max(1, daysBetween(today, cycleEnd));

  const availableNative = availableSums(view, cycles, today);
  const spentNative = spentSums(view, today, today);
  const cycleSpentNative = spentSums(view, cycle.openedOn, today);
  // The start of the day counts everything dated today except spending,
  // so a paycheck that lands today is in today's allowance.
  const startNative: Sums = new Map(availableNative);
  for (const [currency, amount] of spentNative) {
    add(startNative, currency, amount);
  }

  const available = toFigure(view, availableNative, today);
  const startOfDay = toFigure(view, startNative, today);
  const spentToday = toFigure(view, spentNative, today);
  const cycleSpent = toFigure(view, cycleSpentNative, today);
  const todayAllowance = perDay(startOfDay.amount, daysLeft);

  return {
    today,
    cycle,
    cycleEnd,
    overdue,
    daysLeft,
    available: available.amount,
    startOfDay: startOfDay.amount,
    spentToday: spentToday.amount,
    todayAllowance,
    leftToday: minus(todayAllowance, spentToday.amount),
    liveDaily: perDay(available.amount, daysLeft),
    cycleSpent: cycleSpent.amount,
    billsDue: billsDueOn(view, cycle, today),
    missingRates: [
      ...new Set([
        ...available.missingRates,
        ...startOfDay.missingRates,
        ...spentToday.missingRates,
        ...cycleSpent.missingRates,
      ]),
    ].sort(),
  };
}
