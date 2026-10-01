import {
  daysBetween,
  localDateIn,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { AccountId, TransactionId } from '../ledger/types.ts';
import { accountBalances } from '../ledger/balances.ts';
import type { Transaction } from '../ledger/types.ts';
import { billWindow, cycleEndOn, cycleOn, cyclesOf } from './cycles.ts';
import {
  billAmount,
  defaultPolicies,
  dueDates,
  type Policies,
} from './policies.ts';
import { foldBudgets, heldBy, leftOf, type BudgetFold } from './budgets.ts';
import { groupsOn } from './pools.ts';
import { totalOn } from './rates.ts';
import type { DailyMode } from './budgets.ts';
import type {
  BillDue,
  Cycle,
  CycleBill,
  DailyFigures,
  Figure,
  LedgerView,
} from './types.ts';

// The daily usable figures (docs/domain.md "Daily usable", FR-C4, FR-C5).
// Sums stay per currency until the end and each is converted once to the
// default currency (ADR 0010). Figures for any day come from the same
// functions, so a back-dated entry corrects past and present alike.

export type Sums = Map<CurrencyCode, bigint>;

export function add(sums: Sums, currency: CurrencyCode, amount: bigint): void {
  sums.set(currency, (sums.get(currency) ?? 0n) + amount);
}

export function policiesOf(view: LedgerView): Policies {
  return { ...defaultPolicies, ...view.policies };
}

/**
 * On-budget balances at the end of `date`, per currency. `balances` may be
 * passed in when the caller already has them for that day.
 */
export function onBudgetSums(
  view: LedgerView,
  date: LocalDate,
  balances: ReadonlyMap<AccountId, Money> = accountBalances(view.ledger, date),
): Sums {
  const groups = groupsOn(view, date);
  const sums: Sums = new Map();
  for (const [id, balance] of balances) {
    if (groups.get(id) === 'on') {
      add(sums, balance.currency, BigInt(balance.amountMinor));
    }
  }
  return sums;
}

/** On-budget sums less the bills reserved and unpaid at the end of `date`. */
export function lessReserved(
  view: LedgerView,
  cycles: readonly Cycle[],
  date: LocalDate,
  onBudget: Sums,
): Sums {
  const sums: Sums = new Map(onBudget);
  const reserved = policiesOf(view).bills.reserved(
    view.bills,
    billWindow(cycleOn(cycles, date)),
    date,
  );
  for (const [currency, amount] of reserved) add(sums, currency, -amount);
  return sums;
}

/** On-budget balances minus unpaid reserved bills, per currency. */
export function availableSums(
  view: LedgerView,
  cycles: readonly Cycle[],
  date: LocalDate,
): Sums {
  return lessReserved(view, cycles, date, onBudgetSums(view, date));
}

/**
 * The entries pace leaves out (docs/domain.md "Daily usable"): payments
 * linked to a bill, whose reserve already came out of the budget when
 * the cycle opened, and reconcile adjustments, which make up for past
 * entries rather than record new spending. Their undos go with them, so
 * undoing one never moves pace.
 */
export function paceExclusions(view: LedgerView): Set<TransactionId> {
  const excluded = new Set<TransactionId>(view.reconcileAdjustments ?? []);
  for (const bill of view.bills) {
    for (const payment of bill.payments) {
      const paidBy = payment.transactionId ?? null;
      if (paidBy !== null) excluded.add(paidBy);
    }
  }
  // An undo cannot itself be undone, so one pass finds them all.
  for (const t of view.ledger) {
    if (t.reversesId !== null && excluded.has(t.reversesId)) {
      excluded.add(t.id);
    }
  }
  return excluded;
}

/**
 * What left the budget as spending from `from` through `to`, per currency:
 * the on-budget side of every entry that reaches an Expenses account, less
 * its undo. Each entry counts by the budget groups of its own day. `kept`
 * is the same without the `excluded` entries, found in the same pass.
 */
export function spentSums(
  view: LedgerView,
  from: LocalDate,
  to: LocalDate,
  excluded: ReadonlySet<TransactionId> = new Set(),
): { spent: Sums; kept: Sums } {
  const groupsByDay = new Map<LocalDate, ReturnType<typeof groupsOn>>();
  const groupsByDate = (date: LocalDate) => {
    let groups = groupsByDay.get(date);
    if (groups === undefined) {
      groups = groupsOn(view, date);
      groupsByDay.set(date, groups);
    }
    return groups;
  };
  const expenseAccounts = new Set(
    [...view.chart.values()]
      .filter((a) => a.systemRole === 'expenses')
      .map((a) => a.id),
  );
  const spent: Sums = new Map();
  const kept: Sums = new Map();
  for (const t of view.ledger) {
    if (t.occurredOn < from || t.occurredOn > to) continue;
    if (!t.postings.some((p) => expenseAccounts.has(p.accountId))) continue;
    const groups = groupsByDate(t.occurredOn);
    const keep = !excluded.has(t.id);
    for (const p of t.postings) {
      if (groups.get(p.accountId) === 'on') {
        const amount = -BigInt(p.amount.amountMinor);
        add(spent, p.amount.currency, amount);
        if (keep) add(kept, p.amount.currency, amount);
      }
    }
  }
  return { spent, kept };
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
      if (!paid) {
        due.push({ billId: bill.id, dueOn, amount: billAmount(bill, dueOn) });
      }
    }
  }
  return due.sort(
    (a, b) =>
      a.dueOn.localeCompare(b.dueOn) || a.billId.localeCompare(b.billId),
  );
}

/** Every due date in the cycle's bill window, with its payment day. */
export function billsInCycle(view: LedgerView, cycle: Cycle): CycleBill[] {
  const window = billWindow(cycle);
  const bills: CycleBill[] = [];
  for (const bill of view.bills) {
    for (const dueOn of dueDates(bill.dueDay, window)) {
      const payment = bill.payments.find((p) => p.dueOn === dueOn);
      bills.push({
        billId: bill.id,
        dueOn,
        amount: billAmount(bill, dueOn),
        paidOn: payment?.paidOn ?? null,
      });
    }
  }
  return bills.sort(
    (a, b) =>
      a.dueOn.localeCompare(b.dueOn) || a.billId.localeCompare(b.billId),
  );
}

export function toFigure(
  view: LedgerView,
  sums: ReadonlyMap<CurrencyCode, bigint>,
  date: LocalDate,
): Figure {
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
export function perDay(amount: Money, days: number): Money {
  const total = BigInt(amount.amountMinor);
  const n = BigInt(days);
  let quotient = total / n;
  if (total % n !== 0n && total < 0n) quotient -= 1n;
  return money(Number(quotient), amount.currency);
}

export function minus(a: Money, b: Money): Money {
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

// What the counted accounts held, less unpaid reserved bills, just before each
// entry that has an expense line, in the default currency. A cover reads it to
// tell how much free money an entry found. Entries are taken in time order,
// the order the budgets are folded in.
function availableBeforeEntries(
  view: LedgerView,
  cycles: readonly Cycle[],
  today: LocalDate,
): Map<TransactionId, bigint> {
  const expenses = new Set(
    [...view.chart.values()]
      .filter((a) => a.systemRole === 'expenses')
      .map((a) => a.id),
  );
  const running = new Map<AccountId, bigint>();
  const before = new Map<TransactionId, bigint>();
  const groupsByDate = new Map<LocalDate, ReturnType<typeof groupsOn>>();
  const sorted = [...view.ledger].sort(
    (a, b) =>
      a.occurredOn.localeCompare(b.occurredOn) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  for (const t of sorted) {
    if (t.occurredOn > today) break;
    if (t.postings.some((p) => expenses.has(p.accountId))) {
      let groups = groupsByDate.get(t.occurredOn);
      if (groups === undefined) {
        groups = groupsOn(view, t.occurredOn);
        groupsByDate.set(t.occurredOn, groups);
      }
      const counted: Sums = new Map();
      for (const [id, balance] of running) {
        const currency = view.chart.get(id)?.currency;
        if (groups.get(id) === 'on' && currency !== undefined) {
          add(counted, currency, balance);
        }
      }
      const sums = lessReserved(view, cycles, t.occurredOn, counted);
      before.set(t.id, BigInt(toFigure(view, sums, today).amount.amountMinor));
    }
    for (const p of t.postings) {
      running.set(
        p.accountId,
        (running.get(p.accountId) ?? 0n) + BigInt(p.amount.amountMinor),
      );
    }
  }
  return before;
}

/**
 * The budget figures for the period holding `today`, leaving out the entries
 * pace leaves out (linked bill payments, reconcile adjustments). Null when
 * the view has no budgets.
 */
export function budgetFold(
  view: LedgerView,
  today: LocalDate,
): BudgetFold | null {
  if (view.budgets === undefined || view.budgets.budgets.length === 0) {
    return null;
  }
  const cycles = cyclesOf(view, today);
  let before: Map<TransactionId, bigint> | undefined;
  return foldBudgets(view, today, {
    excluded: paceExclusions(view),
    // Only worked out when an entry actually needs cover.
    availableBefore: (id) => {
      before ??= availableBeforeEntries(view, cycles, today);
      return before.get(id) ?? 0n;
    },
  });
}

type DailyBase = Readonly<{
  mode: DailyMode;
  /** Set-aside holds, and available less them. */
  held: Money;
  free: Money;
  /** What the daily number divides after today's spending, and before. */
  available: Money;
  startOfDay: Money;
  /** Today's spending that counts against the daily number. */
  spentToday: Money;
  fold: BudgetFold | null;
}>;

/**
 * What the daily number divides, by the daily-number mode (docs/domain.md
 * "Daily usable"). Without budgets every mode but the daily-budgets one
 * gives the same figures as before budgets existed.
 */
function dailyBase(
  view: LedgerView,
  today: LocalDate,
  figures: Readonly<{
    available: Money;
    startOfDay: Money;
    spentToday: Money;
    fold: BudgetFold | null;
  }>,
): DailyBase {
  const { fold } = figures;
  const currency = view.settings.defaultCurrency;
  const mode = view.settings.dailyMode ?? 'free';
  const lines = fold?.lines ?? [];
  const held = lines.reduce((sum, line) => sum + heldBy(line), 0n);
  const free = money(figures.available.amountMinor - Number(held), currency);
  const todays = (fold?.spend ?? []).filter((line) => line.date === today);
  const fromHolds = todays.reduce((sum, line) => sum + line.fromHold, 0n);
  const common = { mode, fold, held: money(Number(held), currency), free };
  if (mode === 'pool-minus-bills') {
    return {
      ...common,
      available: figures.available,
      startOfDay: figures.startOfDay,
      spentToday: figures.spentToday,
    };
  }
  if (mode === 'free') {
    // Money paid out of a set-aside hold was never in free money, so it is
    // neither spending against the daily number nor part of its start.
    const dailySpent = BigInt(figures.spentToday.amountMinor) - fromHolds;
    return {
      ...common,
      available: free,
      startOfDay: money(
        figures.startOfDay.amountMinor - Number(held) - Number(fromHolds),
        currency,
      ),
      spentToday: money(Number(dailySpent), currency),
    };
  }
  // Daily budgets only: what the daily budgets have left, spending outside
  // them leaves the number alone.
  const daily = new Set(
    lines.filter((l) => l.budget.mode === 'daily').map((l) => l.budget.id),
  );
  const left = lines
    .filter((l) => l.budget.mode === 'daily')
    .reduce((sum, line) => sum + leftOf(line), 0n);
  // Spending in a daily budget counts against it, and so does what its
  // shortfall took from another daily budget.
  const spent = todays.reduce((sum, line) => {
    const ownDaily =
      line.budgetId !== null && daily.has(line.budgetId) ? line.own : 0n;
    const coveredByDaily = line.covers.reduce(
      (total, take) =>
        take.source !== 'free' && daily.has(take.source)
          ? total + take.amount
          : total,
      0n,
    );
    return sum + ownDaily + coveredByDaily;
  }, 0n);
  return {
    ...common,
    available: money(Number(left), currency),
    startOfDay: money(Number(left + spent), currency),
    spentToday: money(Number(spent), currency),
  };
}

export function dailyFiguresOn(
  view: LedgerView,
  today: LocalDate,
): DailyFigures {
  const cycles = cyclesOf(view, today);
  const cycle = cycleOn(cycles, today);
  const overdue = today > cycle.payday;
  const cycleEnd = cycleEndOn(cycle, today);
  const daysLeft = Math.max(1, daysBetween(today, cycleEnd));

  const onBudgetNative = onBudgetSums(view, today);
  const availableNative = availableSums(view, cycles, today);
  const excluded = paceExclusions(view);
  // Linked bill payments and their undos are left out of today's spending
  // as they are of pace: the bill's reserve already left the budget, so
  // paying it moves neither the allowance nor what is left today.
  const spentNative = spentSums(view, today, today, excluded).kept;
  const { spent: cycleSpentNative, kept: paceSpentNative } = spentSums(
    view,
    cycle.openedOn,
    today,
    excluded,
  );
  // The start of the day counts everything dated today except spending,
  // so a paycheck that lands today is in today's allowance.
  const startNative: Sums = new Map(availableNative);
  for (const [currency, amount] of spentNative) {
    add(startNative, currency, amount);
  }

  const onBudget = toFigure(view, onBudgetNative, today);
  const available = toFigure(view, availableNative, today);
  const startOfDay = toFigure(view, startNative, today);
  const spentToday = toFigure(view, spentNative, today);
  const cycleSpent = toFigure(view, cycleSpentNative, today);
  const paceSpent = toFigure(view, paceSpentNative, today);
  const base = dailyBase(view, today, {
    available: available.amount,
    startOfDay: startOfDay.amount,
    spentToday: spentToday.amount,
    fold: budgetFold(view, today),
  });
  const todayAllowance = perDay(base.startOfDay, daysLeft);

  return {
    today,
    cycle,
    cycleEnd,
    overdue,
    daysLeft,
    available: available.amount,
    onBudget: onBudget.amount,
    // The difference rather than its own conversion, so the split always
    // adds up exactly in the default currency.
    reserved: minus(onBudget.amount, available.amount),
    startOfDay: base.startOfDay,
    spentToday: spentToday.amount,
    todayAllowance,
    leftToday: minus(todayAllowance, base.spentToday),
    liveDaily: perDay(base.available, daysLeft),
    cycleSpent: cycleSpent.amount,
    paceSpent: paceSpent.amount,
    billsDue: billsDueOn(view, cycle, today),
    cycleBills: billsInCycle(view, cycle),
    held: base.held,
    free: base.free,
    dailyMode: base.mode,
    dailySpentToday: base.spentToday,
    missingRates: [
      ...new Set([
        ...(base.fold?.missingRates ?? []),
        ...onBudget.missingRates,
        ...available.missingRates,
        ...startOfDay.missingRates,
        ...spentToday.missingRates,
        ...cycleSpent.missingRates,
        ...paceSpent.missingRates,
      ]),
    ].sort(),
  };
}

/**
 * How much recording `entry` would lower today's "left today" figure, in
 * the default currency; negative when it would raise it. The figures come
 * from the same projection before and after, so an entry is described
 * exactly as it will count: a write-off from an on-budget account is
 * spending, a transfer to savings lowers the allowance (docs/domain.md
 * "Daily usable"). `view.chart` must hold every account the entry posts to.
 */
export function leftTodayDrop(
  view: LedgerView,
  today: LocalDate,
  entry: Transaction,
): Money {
  return leftTodayChange(view, today, entry).drop;
}

/** Left today before and after recording `entry`, and the drop between. */
export function leftTodayChange(
  view: LedgerView,
  today: LocalDate,
  entry: Transaction,
): { before: Money; after: Money; drop: Money } {
  const before = dailyFiguresOn(view, today).leftToday;
  const after = dailyFiguresOn(
    { ...view, ledger: [...view.ledger, entry] },
    today,
  ).leftToday;
  return { before, after, drop: minus(before, after) };
}
