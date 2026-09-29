import type { CurrencyCode, LocalDate, Money, Rate } from '@allotr/shared';
import type { Chart } from '../ledger/chart.ts';
import type {
  CategoryId,
  Transaction,
  TransactionId,
} from '../ledger/types.ts';
import type { Policies } from './policies.ts';

// Inputs and results of the projections: cycles and the daily figures
// (docs/domain.md "Daily usable" and "Cycles"). Everything is computed from
// these inputs; nothing is stored (invariant 8).

declare const brand: unique symbol;
export type BillId = string & { readonly [brand]: 'BillId' };
export const billId = (id: string) => id as BillId;

export type BillPayment = Readonly<{
  /** The due date this payment settles. */
  dueOn: LocalDate;
  paidOn: LocalDate;
  /** The entry that paid it, when linked; pace leaves it out. */
  transactionId?: TransactionId | null;
}>;

/** A bill reserved at payday until it is paid. */
export type Bill = Readonly<{
  id: BillId;
  amount: Money;
  /** Day of the month; shorter months use their last day. */
  dueDay: number;
  payments: readonly BillPayment[];
}>;

/** How many units of `quote` one unit of `base` buys from `asOf`. */
export type ExchangeRate = Readonly<{
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: Rate;
  asOf: LocalDate;
}>;

export type LedgerSettings = Readonly<{
  defaultCurrency: CurrencyCode;
  /** The day the user started: the first cycle opens then, from opening balances. */
  startedOn: LocalDate;
  /** Day of the month that payday falls on (FR-C2). */
  paydayDay: number;
  /** The next payday, when it differs from the predicted one. */
  paydayOverride: LocalDate | null;
}>;

/** Everything the projections read. */
export type LedgerView = Readonly<{
  chart: Chart;
  ledger: readonly Transaction[];
  /** Income categories whose entries are paychecks. */
  paycheckCategories: ReadonlySet<CategoryId>;
  settings: LedgerSettings;
  bills: readonly Bill[];
  rates: readonly ExchangeRate[];
  /**
   * Entries posted by reconciling to make up a difference; pace leaves
   * them out. None when omitted.
   */
  reconcileAdjustments?: ReadonlySet<TransactionId>;
  /** Defaults to the default strategies (docs/domain.md "Policies"). */
  policies?: Partial<Policies>;
}>;

/**
 * One period from a paycheck to the next. The first cycle opens when the
 * user started, or with an earlier paycheck from imported history.
 */
export type Cycle = Readonly<{
  openedOn: LocalDate;
  /** The paycheck that opened it; null for the first cycle. */
  openedBy: TransactionId | null;
  /** The payday it runs to: the override or the predicted day. */
  payday: LocalDate;
  /** The day the next cycle opened; null for the open cycle. */
  closedOn: LocalDate | null;
}>;

/** A projected figure, and the currencies left out for lack of a rate. */
export type Figure = Readonly<{
  amount: Money;
  missingRates: readonly CurrencyCode[];
}>;

/** An unpaid bill due date, on or before the day asked about. */
export type BillDue = Readonly<{
  billId: BillId;
  dueOn: LocalDate;
  amount: Money;
}>;

/** A bill's due date in the current cycle, and when it was marked paid. */
export type CycleBill = Readonly<{
  billId: BillId;
  dueOn: LocalDate;
  amount: Money;
  paidOn: LocalDate | null;
}>;

export type DailyFigures = Readonly<{
  today: LocalDate;
  cycle: Cycle;
  /** The payday, or tomorrow while payday is overdue. */
  cycleEnd: LocalDate;
  /** Payday has passed without a paycheck; the cycle runs day by day. */
  overdue: boolean;
  daysLeft: number;
  /** On-budget money minus unpaid reserved bills, now. */
  available: Money;
  /** `available` before today's spending: what today's allowance splits. */
  startOfDay: Money;
  spentToday: Money;
  todayAllowance: Money;
  leftToday: Money;
  liveDaily: Money;
  /** Spending since the cycle opened, today included. */
  cycleSpent: Money;
  /**
   * `cycleSpent` without the entries pace leaves out: payments linked to a
   * bill, reconcile adjustments, and their undos.
   */
  paceSpent: Money;
  /** Bills in the cycle due by today and not yet paid. */
  billsDue: readonly BillDue[];
  /** Every due date the cycle reserves, paid or not, earliest first. */
  cycleBills: readonly CycleBill[];
  /** Currencies without a rate to the default one, left out of the figures. */
  missingRates: readonly CurrencyCode[];
}>;
