import {
  currencyCode,
  localDate,
  money,
  type ReminderView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { attentionItems } from './needs-attention-model.ts';

const base = {
  today: localDate('2026-03-10'),
  overdue: false,
  billsDue: [],
  missingRates: [],
};

const reminder = (
  id: string,
  kind: ReminderView['kind'],
  readAt: string | null = null,
): ReminderView => ({
  id,
  kind,
  title: `title ${id}`,
  body: `body ${id}`,
  url: '/budget/ious',
  createdAt: '2026-03-10T08:00:00.000Z',
  readAt,
});

describe('attentionItems', () => {
  it('is empty when nothing needs attention', () => {
    expect(attentionItems(base, [])).toEqual([]);
  });

  it('orders payday, bills, rates, then reminders', () => {
    const items = attentionItems(
      {
        ...base,
        overdue: true,
        missingRates: [currencyCode('EUR')],
        billsDue: [
          {
            billId: 'b1',
            name: 'Rent',
            dueOn: localDate('2026-03-10'),
            amount: money(90000, 'USD'),
            price: null,
          },
        ],
      },
      [reminder('r1', 'iou_overdue')],
    );
    expect(items.map((i) => i.kind)).toEqual([
      'payday-overdue',
      'bill-due',
      'missing-rate',
      'reminder',
    ]);
    expect(items[1]).toMatchObject({ today: true, name: 'Rent' });
  });

  it('marks a bill from an earlier day as not due today', () => {
    const [item] = attentionItems(
      {
        ...base,
        billsDue: [
          {
            billId: 'b1',
            name: 'Phone',
            dueOn: localDate('2026-03-08'),
            amount: money(4000, 'USD'),
            price: null,
          },
        ],
      },
      [],
    );
    expect(item).toMatchObject({ kind: 'bill-due', today: false });
  });

  it('leaves out read reminders and bill reminders', () => {
    const items = attentionItems(base, [
      reminder('r1', 'bill_due'),
      reminder('r2', 'iou_due', '2026-03-10T09:00:00.000Z'),
      reminder('r3', 'weekly_review'),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ reminderId: 'r3' });
  });
});
