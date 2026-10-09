import type { LocalDate, Money, ReminderView, TodayView } from '@allotr/shared';

// The "needs attention" tile's items, in the order they are shown: payday
// overdue, bills due and unpaid, missing exchange rates, then the unread
// IOU and review reminders the server made. Bill reminders are left out
// because the due bills already say it.

export type AttentionItem =
  | { id: string; kind: 'payday-overdue' }
  | {
      id: string;
      kind: 'bill-due';
      name: string;
      amount: Money;
      dueOn: LocalDate;
      today: boolean;
    }
  | { id: string; kind: 'missing-rate'; currency: string }
  | {
      id: string;
      kind: 'reminder';
      reminderId: string;
      reminderKind: Exclude<ReminderView['kind'], 'bill_due'>;
      title: string;
      body: string;
      url: string;
    };

export function attentionItems(
  today: Pick<TodayView, 'today' | 'overdue' | 'billsDue' | 'missingRates'>,
  reminders: readonly ReminderView[],
): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (today.overdue) {
    items.push({ id: 'payday-overdue', kind: 'payday-overdue' });
  }
  for (const bill of today.billsDue) {
    items.push({
      id: `bill-${bill.billId}-${bill.dueOn}`,
      kind: 'bill-due',
      name: bill.name,
      amount: bill.amount,
      dueOn: bill.dueOn,
      today: bill.dueOn === today.today,
    });
  }
  for (const currency of today.missingRates) {
    items.push({ id: `rate-${currency}`, kind: 'missing-rate', currency });
  }
  for (const reminder of reminders) {
    if (reminder.readAt !== null || reminder.kind === 'bill_due') continue;
    items.push({
      id: `reminder-${reminder.id}`,
      kind: 'reminder',
      reminderId: reminder.id,
      reminderKind: reminder.kind,
      title: reminder.title,
      body: reminder.body,
      url: reminder.url,
    });
  }
  return items;
}
