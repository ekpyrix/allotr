import {
  addDays,
  money,
  nextDayOfMonth,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { Bill, BillPayment } from './types.ts';

// Per-user behaviour as strategies (docs/domain.md "Policies"). M1 ships the
// defaults only; M4 adds the alternatives behind the same interfaces.

/**
 * What a bill reserves for one due date. A variable bill follows the latest
 * payment for an earlier due date that took an amount; a paid due date
 * shows what its own payment took.
 */
export function billAmount(bill: Bill, dueOn: LocalDate): Money {
  const took = (payment: BillPayment): Money | null =>
    payment.paid?.currency === bill.amount.currency ? payment.paid : null;
  const own = bill.payments.find((payment) => payment.dueOn === dueOn);
  const ownPaid = own === undefined ? null : took(own);
  if (ownPaid !== null) return ownPaid;
  if (bill.variable !== true) return bill.amount;
  let latest: BillPayment | undefined;
  for (const payment of bill.payments) {
    if (payment.dueOn >= dueOn || took(payment) === null) continue;
    if (latest === undefined || payment.dueOn > latest.dueOn) latest = payment;
  }
  return (latest === undefined ? null : took(latest)) ?? bill.amount;
}

/** Days from `from` up to, not including, `to`. */
export type DateWindow = Readonly<{ from: LocalDate; to: LocalDate }>;

export interface BillsStrategy {
  /** Bill money still set aside at the end of `date`, per currency. */
  reserved(
    bills: readonly Bill[],
    cycle: DateWindow,
    date: LocalDate,
  ): ReadonlyMap<CurrencyCode, bigint>;
}

/** What happens to a cycle's leftover or deficit at payday. */
export type Settlement = Readonly<{
  /** Stays in the on-budget accounts for the next cycle. */
  carried: Money;
  /** Moved out of the budget, such as a sweep to savings. */
  swept: Money;
}>;

export interface LeftoverStrategy {
  /** `leftover` is zero or more. */
  atPayday(leftover: Money): Settlement;
}

export interface OverspendStrategy {
  /** `deficit` is below zero. */
  atPayday(deficit: Money): Settlement;
}

/** Leave a reconcile difference reported only, or post it now. */
export type ReconcileAction = 'report' | 'adjust';

export interface ReconcileStrategy {
  /**
   * What happens to a difference between the bank's balance and the
   * ledger's; `requested` is true when the user asked for the adjustment.
   */
  onDifference(requested: boolean): ReconcileAction;
}

export type Policies = Readonly<{
  bills: BillsStrategy;
  leftover: LeftoverStrategy;
  overspend: OverspendStrategy;
  reconcile: ReconcileStrategy;
}>;

/** The days in a window that fall on a bill's due day. */
export function dueDates(dueDay: number, window: DateWindow): LocalDate[] {
  const dates: LocalDate[] = [];
  let due = nextDayOfMonth(addDays(window.from, -1), dueDay);
  while (due < window.to) {
    dates.push(due);
    due = nextDayOfMonth(due, dueDay);
  }
  return dates;
}

/**
 * Default: every bill due in the cycle is set aside when the cycle opens and
 * released on the day it is paid.
 */
export const reserveAtPayday: BillsStrategy = {
  reserved(bills, cycle, date) {
    const totals = new Map<CurrencyCode, bigint>();
    for (const bill of bills) {
      for (const due of dueDates(bill.dueDay, cycle)) {
        const paid = bill.payments.some(
          (payment) => payment.dueOn === due && payment.paidOn <= date,
        );
        if (paid) continue;
        const { currency, amountMinor } = billAmount(bill, due);
        totals.set(
          currency,
          (totals.get(currency) ?? 0n) + BigInt(amountMinor),
        );
      }
    }
    return totals;
  },
};

function carryAll(amount: Money): Settlement {
  return { carried: amount, swept: money(0, amount.currency) };
}

/** Default: the leftover stays on budget and raises the next cycle. */
export const leftoverStays: LeftoverStrategy = { atPayday: carryAll };

/** Default: the deficit carries into the next cycle and lowers it. */
export const carryDeficit: OverspendStrategy = { atPayday: carryAll };

/**
 * Default: a difference is reported, with a one-tap "Unrecorded"
 * adjustment posted only when the user asks for it.
 */
export const offerAdjustment: ReconcileStrategy = {
  onDifference: (requested) => (requested ? 'adjust' : 'report'),
};

export const defaultPolicies: Policies = {
  bills: reserveAtPayday,
  leftover: leftoverStays,
  overspend: carryDeficit,
  reconcile: offerAdjustment,
};
