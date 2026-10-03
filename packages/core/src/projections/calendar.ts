import {
  addDays,
  daysBetween,
  money,
  type CurrencyCode,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { cyclesOf } from './cycles.ts';
import { paceExclusions, spentSums, toFigure } from './daily.ts';
import { iouStatuses } from './ious.ts';
import { billAmount, dueDates } from './policies.ts';
import type { BillId, LedgerView } from './types.ts';

// The calendar (FR-W2): one row per day of a range with what was spent, and
// what falls due: bills, payday and IOU due dates. Spending is the pace
// spending the cycle charts use, so a payment linked to a bill is left out
// of the heat, and every figure is in the default currency at the rate of
// its own day. Pure: a back-dated entry changes the same rows.

/** The longest range one call covers: two months. */
export const MAX_CALENDAR_DAYS = 62;

/** Spending heat runs 0 (nothing spent) to this many levels. */
export const HEAT_LEVELS = 4;

export type CalendarBill = Readonly<{
  billId: BillId;
  amount: Money;
  paid: boolean;
}>;

export type CalendarIou = Readonly<{
  iouId: string;
  person: string;
  direction: 'owed-to-me' | 'owed-by-me';
  outstanding: Money;
}>;

export type CalendarDay = Readonly<{
  date: LocalDate;
  /** Pace spending dated that day; null after today. */
  spent: Money | null;
  /**
   * 0 for nothing spent, up to HEAT_LEVELS for the day or days that spent
   * most in the range; null after today.
   */
  heat: number | null;
  /** Bills due that day, paid or not. */
  bills: readonly CalendarBill[];
  /** A paycheck is expected, or arrived, that day. */
  payday: boolean;
  /** IOUs not yet settled that fall due that day. */
  ious: readonly CalendarIou[];
}>;

export type Calendar = Readonly<{
  days: readonly CalendarDay[];
  /** The most spent on one day in the range; zero when nothing was. */
  peak: Money;
  missingRates: readonly CurrencyCode[];
}>;

/** The level for `amountMinor` against the range's `peak`, rounded up. */
export function heatLevel(amountMinor: number, peak: number): number {
  if (amountMinor <= 0 || peak <= 0) return 0;
  const level = Math.ceil((amountMinor * HEAT_LEVELS) / peak);
  return Math.min(HEAT_LEVELS, Math.max(1, level));
}

/**
 * The days from `from` through `to`, at most MAX_CALENDAR_DAYS. Paydays
 * are the days paychecks opened a cycle and the open cycle's expected one.
 */
export function calendar(
  view: LedgerView,
  from: LocalDate,
  to: LocalDate,
  today: LocalDate,
): Calendar {
  const count = daysBetween(from, to) + 1;
  if (count < 1 || count > MAX_CALENDAR_DAYS)
    throw new RangeError(
      `A calendar covers 1 to ${String(MAX_CALENDAR_DAYS)} days.`,
    );
  const excluded = paceExclusions(view);
  const missing = new Set<CurrencyCode>();
  const cycles = cyclesOf(view, today);
  const open = cycles.at(-1);
  const paydays = new Set<LocalDate>([
    ...cycles.flatMap((cycle) =>
      cycle.openedBy === null ? [] : [cycle.openedOn],
    ),
    ...(open === undefined ? [] : [open.payday]),
  ]);
  const window = { from, to: addDays(to, 1) };
  const bills = new Map<LocalDate, CalendarBill[]>();
  for (const bill of view.bills) {
    for (const due of dueDates(bill.dueDay, window)) {
      const paid = bill.payments.some((p) => p.dueOn === due);
      bills.set(due, [
        ...(bills.get(due) ?? []),
        { billId: bill.id, amount: billAmount(bill, due), paid },
      ]);
    }
  }
  const ious = new Map<LocalDate, CalendarIou[]>();
  for (const status of iouStatuses(view, today)) {
    const due = status.iou.dueOn;
    if (due === null || status.settled || due < from || due > to) continue;
    ious.set(due, [
      ...(ious.get(due) ?? []),
      {
        iouId: status.iou.id,
        person: status.iou.person,
        direction: status.iou.direction,
        outstanding: status.outstanding,
      },
    ]);
  }

  const spent = Array.from({ length: count }, (_, at) => {
    const date = addDays(from, at);
    if (date > today) return null;
    const { kept } = spentSums(view, date, date, excluded);
    const figure = toFigure(view, kept, date);
    for (const code of figure.missingRates) missing.add(code);
    return figure.amount;
  });
  const peak = spent.reduce(
    (best, s) => Math.max(best, s?.amountMinor ?? 0),
    0,
  );
  const currency = view.settings.defaultCurrency;
  const days = spent.map((amount, at): CalendarDay => {
    const date = addDays(from, at);
    return {
      date,
      spent: amount,
      heat: amount === null ? null : heatLevel(amount.amountMinor, peak),
      bills: (bills.get(date) ?? []).sort((a, b) =>
        a.billId.localeCompare(b.billId),
      ),
      payday: paydays.has(date),
      ious: (ious.get(date) ?? []).sort((a, b) =>
        a.iouId.localeCompare(b.iouId),
      ),
    };
  });
  return {
    days,
    peak: money(peak, currency),
    missingRates: [...missing].sort(),
  };
}
