import {
  addDays,
  daysBetween,
  type BillView,
  type LocalDate,
  type Money,
  type TodayView,
} from '@allotr/shared';
import type { TimelineEvent } from '@/charts/timeline';
import { barFraction } from '@/shell/summary-math';

// View model for the Budget · bills sub-tab. Amounts are the server's; this
// joins the cycle's due dates to their bills, counts days for the timeline
// and sizes the "set aside of" bar.

export type DueItem = Readonly<{
  id: string;
  billId: string;
  /** Empty when the bill no longer exists. */
  name: string;
  dueOn: LocalDate;
  paidOn: LocalDate | null;
  amount: Money;
  /** What the due date sets aside; a ratio of two server figures for a bar. */
  reserve: Money | null;
  fraction: number;
}>;

export type BillsView = Readonly<{
  /** Unpaid due dates this cycle, earliest first. */
  upcoming: readonly DueItem[];
  /** Due dates marked paid this cycle, latest first. */
  paid: readonly DueItem[];
  next: DueItem | null;
  /** Active bills with no due date this cycle. */
  later: readonly BillView[];
  timeline: Readonly<{
    days: number;
    today: number;
    events: readonly TimelineEvent[];
  }>;
}>;

export function billsView(
  today: TodayView,
  bills: readonly BillView[],
  labels: Readonly<{ payday: string; unknown: string }>,
): BillsView {
  const byId = new Map(bills.map((bill) => [bill.id, bill]));
  const items: DueItem[] = today.cycleBills.map((due) => {
    const bill = byId.get(due.billId);
    const reserve = due.paidOn === null ? (bill?.reserve ?? null) : null;
    return {
      id: `${due.billId}:${due.dueOn}`,
      billId: due.billId,
      name: bill?.name ?? '',
      dueOn: due.dueOn,
      paidOn: due.paidOn,
      amount: due.amount,
      reserve,
      fraction:
        reserve === null
          ? 0
          : barFraction(reserve.amountMinor, due.amount.amountMinor),
    };
  });
  const upcoming = items.filter((item) => item.paidOn === null);
  const paid = items
    .filter((item) => item.paidOn !== null)
    .sort((a, b) => (b.paidOn ?? '').localeCompare(a.paidOn ?? ''));
  const inCycle = new Set(items.map((item) => item.billId));

  const opened = today.cycle.openedOn;
  const days = Math.max(1, daysBetween(opened, today.cycleEnd) + 1);
  const events: TimelineEvent[] = [
    ...items.map((item) => ({
      id: item.id,
      day: Math.min(days - 1, Math.max(0, daysBetween(opened, item.dueOn))),
      kind: 'bill' as const,
      label: item.name === '' ? labels.unknown : item.name,
      paid: item.paidOn !== null,
    })),
    {
      id: 'payday',
      day: days - 1,
      kind: 'payday' as const,
      label: labels.payday,
    },
  ];
  return {
    upcoming,
    paid,
    next: upcoming[0] ?? null,
    later: bills.filter((bill) => bill.active && !inCycle.has(bill.id)),
    timeline: {
      days,
      today: Math.min(days - 1, Math.max(0, daysBetween(opened, today.today))),
      events,
    },
  };
}

/** The date a cycle day falls on, for the timeline's labels. */
export function cycleDayDate(opened: LocalDate, day: number): LocalDate {
  return addDays(opened, day);
}
