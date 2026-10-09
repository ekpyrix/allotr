import {
  addDays,
  money,
  type BillView,
  type CalendarView,
  type LocalDate,
  type Money,
} from '@allotr/shared';

export type UpcomingKind = 'bill' | 'iou' | 'payday';

export type UpcomingItem = Readonly<{
  key: string;
  date: LocalDate;
  kind: UpcomingKind;
  label: string;
  /** Signed like an entry: money going out is negative; null for a payday. */
  amount: Money | null;
}>;

function negate(amount: Money): Money {
  return money(-amount.amountMinor, amount.currency);
}

/**
 * What falls due from `today` through six days later, earliest first: unpaid
 * bills, IOUs and the expected paycheck. Names come from the bill list; the
 * amounts are the server's, with only the sign set for the direction.
 */
export function upcomingItems(
  calendar: CalendarView,
  bills: readonly BillView[],
  today: LocalDate,
  labels: Readonly<{ payday: string; bill: string }>,
): readonly UpcomingItem[] {
  const last = addDays(today, 6);
  const names = new Map(bills.map((b) => [b.id, b.name]));
  const items: UpcomingItem[] = [];
  for (const day of calendar.days) {
    if (day.date < today || day.date > last) continue;
    if (day.payday) {
      items.push({
        key: `${day.date}:payday`,
        date: day.date,
        kind: 'payday',
        label: labels.payday,
        amount: null,
      });
    }
    for (const bill of day.bills) {
      if (bill.paid) continue;
      items.push({
        key: `${day.date}:bill:${bill.billId}`,
        date: day.date,
        kind: 'bill',
        label: names.get(bill.billId) ?? labels.bill,
        amount: negate(bill.amount),
      });
    }
    for (const iou of day.ious) {
      items.push({
        key: `${day.date}:iou:${iou.iouId}`,
        date: day.date,
        kind: 'iou',
        label: iou.person,
        amount:
          iou.direction === 'owed-to-me'
            ? iou.outstanding
            : negate(iou.outstanding),
      });
    }
  }
  return items;
}
