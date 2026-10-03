import {
  addDays,
  daysBetween,
  isoWeekday,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { cycleOn, cyclesOf } from './cycles.ts';
import { billsInCycle } from './daily.ts';
import { iouStatuses } from './ious.ts';
import type { BillId, LedgerView } from './types.ts';

// What the user should be reminded of today (ADR 0024). Each reminder has a
// key that stays the same however often this runs, so a scheduler can ask
// every hour and record each reminder once. Pure: nothing here knows what
// was already sent.

/** A bill is reminded from this many days before it is due. */
export const BILL_LEAD_DAYS = 1;

export type ReminderKind =
  'bill_due' | 'iou_due' | 'iou_overdue' | 'weekly_review';

export type DueReminder =
  | Readonly<{
      kind: 'bill_due';
      key: string;
      billId: BillId;
      dueOn: LocalDate;
      amount: Money;
    }>
  | Readonly<{
      kind: 'iou_due' | 'iou_overdue';
      key: string;
      iouId: string;
      person: string;
      direction: 'owed-to-me' | 'owed-by-me';
      dueOn: LocalDate;
      outstanding: Money;
      /** Zero on the due date itself. */
      daysOverdue: number;
    }>
  | Readonly<{ kind: 'weekly_review'; key: string; weekOf: LocalDate }>;

/**
 * Bills due today or tomorrow and not yet paid; IOUs due today, and, once
 * past due, one reminder for each week they stay unsettled; and the weekly
 * review, once per ISO week.
 */
export function dueReminders(
  view: LedgerView,
  today: LocalDate,
): DueReminder[] {
  const out: DueReminder[] = [];

  const cycles = cyclesOf(view, today);
  const cycle = cycleOn(cycles, today);
  const horizon = addDays(today, BILL_LEAD_DAYS);
  for (const bill of billsInCycle(view, cycle)) {
    if (bill.paidOn !== null || bill.dueOn < today || bill.dueOn > horizon)
      continue;
    out.push({
      kind: 'bill_due',
      key: `bill:${bill.billId}:${bill.dueOn}`,
      billId: bill.billId,
      dueOn: bill.dueOn,
      amount: bill.amount,
    });
  }

  for (const status of iouStatuses(view, today)) {
    const due = status.iou.dueOn;
    if (due === null || status.settled || due > today) continue;
    const base = {
      iouId: status.iou.id,
      person: status.iou.person,
      direction: status.iou.direction,
      dueOn: due,
      outstanding: status.outstanding,
    };
    if (due === today)
      out.push({
        kind: 'iou_due',
        key: `iou-due:${status.iou.id}`,
        ...base,
        daysOverdue: 0,
      });
    else
      out.push({
        kind: 'iou_overdue',
        key: `iou-overdue:${status.iou.id}:${String(Math.floor((daysBetween(due, today) - 1) / 7))}`,
        ...base,
        daysOverdue: daysBetween(due, today),
      });
  }

  const weekOf = addDays(today, 1 - isoWeekday(today));
  out.push({ kind: 'weekly_review', key: `review:${weekOf}`, weekOf });
  return out;
}
