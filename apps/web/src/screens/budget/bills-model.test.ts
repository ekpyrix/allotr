import {
  localDate,
  money,
  type BillView,
  type TodayView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { billsView } from './bills-model.ts';

const labels = { payday: 'Payday', unknown: 'Bill' };
const usd = (minor: number) => money(minor, 'USD');

function bill(over: Partial<BillView> & { id: string }): BillView {
  return {
    name: over.id,
    amount: usd(10000),
    price: null,
    reserve: usd(10000),
    accountId: 'acc',
    categoryId: null,
    dueDay: 5,
    active: true,
    payments: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

function today(cycleBills: TodayView['cycleBills']): TodayView {
  return {
    today: localDate('2026-10-10'),
    cycle: {
      openedOn: localDate('2026-10-01'),
      openedBy: null,
      payday: localDate('2026-10-31'),
    },
    cycleEnd: localDate('2026-10-31'),
    cycleBills,
  } as TodayView;
}

describe('billsView', () => {
  const due = (
    billId: string,
    dueOn: string,
    paidOn: string | null,
  ): TodayView['cycleBills'][number] => ({
    billId,
    dueOn: localDate(dueOn),
    amount: usd(10000),
    paidOn: paidOn === null ? null : localDate(paidOn),
  });

  it('splits due dates into upcoming and paid and picks the next one', () => {
    const view = billsView(
      today([
        due('rent', '2026-10-05', '2026-10-04'),
        due('power', '2026-10-14', null),
        due('phone', '2026-10-20', null),
      ]),
      [bill({ id: 'rent' }), bill({ id: 'power' }), bill({ id: 'phone' })],
      labels,
    );
    expect(view.upcoming.map((i) => i.billId)).toEqual(['power', 'phone']);
    expect(view.paid.map((i) => i.billId)).toEqual(['rent']);
    expect(view.next?.billId).toBe('power');
    expect(view.paid[0]?.reserve).toBeNull();
  });

  it('places events on cycle days with payday last', () => {
    const view = billsView(
      today([due('rent', '2026-10-05', null)]),
      [bill({ id: 'rent' })],
      labels,
    );
    expect(view.timeline.days).toBe(31);
    expect(view.timeline.today).toBe(9);
    expect(view.timeline.events.map((e) => [e.kind, e.day])).toEqual([
      ['bill', 4],
      ['payday', 30],
    ]);
  });

  it('sizes the set-aside bar from the bill reserve and lists the rest as later', () => {
    const view = billsView(
      today([due('rent', '2026-10-05', null)]),
      [
        bill({ id: 'rent', reserve: usd(2500) }),
        bill({ id: 'gym' }),
        bill({ id: 'old', active: false }),
      ],
      labels,
    );
    expect(view.upcoming[0]?.fraction).toBe(0.25);
    expect(view.later.map((b) => b.id)).toEqual(['gym']);
  });

  it('keeps a due date whose bill is gone, with an empty name', () => {
    const view = billsView(
      today([due('gone', '2026-10-05', null)]),
      [],
      labels,
    );
    expect(view.upcoming[0]?.name).toBe('');
    expect(view.timeline.events[0]?.label).toBe('Bill');
  });
});
