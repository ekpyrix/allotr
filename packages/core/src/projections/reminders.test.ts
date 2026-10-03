import { money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dueReminders } from './reminders.ts';
import { iouId } from './ious.ts';
import { day, paycheck, spend, view, viewFrom } from './testing.ts';
import { billId, type LedgerView } from './types.ts';

const usd = (amountMinor: number) => money(amountMinor, 'USD');
const ledger = [paycheck('2026-04-01', 300000)];
const base = viewFrom('2026-04-01', ledger);
const rentOn = (dueDay: number, paid = false): LedgerView =>
  view(ledger, {
    settings: base.settings,
    bills: [
      {
        id: billId('rent'),
        amount: usd(80000),
        dueDay,
        payments: paid
          ? [
              {
                dueOn: day(`2026-04-${String(dueDay).padStart(2, '0')}`),
                paidOn: day('2026-04-05'),
              },
            ]
          : [],
      },
    ],
  });
const withIou = (dueOn: string | null): LedgerView =>
  view(ledger, {
    settings: base.settings,
    ious: {
      ious: [
        {
          id: iouId('i1'),
          direction: 'owed-to-me',
          person: 'Alex Example',
          amount: usd(4000),
          originId: spend('2026-04-02', 1).id,
          recordedOn: day('2026-04-02'),
          dueOn: dueOn === null ? null : day(dueOn),
          settlements: [],
        },
      ],
      writeOffAfterDays: 90,
    },
  });
const kinds = (v: LedgerView, today: string) =>
  dueReminders(v, day(today)).map((r) => r.kind);

describe('dueReminders', () => {
  it('reminds of an unpaid bill due today or tomorrow, not before or after', () => {
    expect(kinds(rentOn(10), '2026-04-08')).not.toContain('bill_due');
    expect(kinds(rentOn(10), '2026-04-09')).toContain('bill_due');
    expect(kinds(rentOn(10), '2026-04-10')).toContain('bill_due');
    expect(kinds(rentOn(10), '2026-04-11')).not.toContain('bill_due');
  });

  it('leaves out a bill that is paid, and keeps one key for one due date', () => {
    expect(kinds(rentOn(10, true), '2026-04-10')).not.toContain('bill_due');
    const keys = (today: string) =>
      dueReminders(rentOn(10), day(today))
        .filter((r) => r.kind === 'bill_due')
        .map((r) => r.key);
    expect(keys('2026-04-09')).toEqual(keys('2026-04-10'));
  });

  it('reminds on the due date, then once a week while overdue', () => {
    const v = withIou('2026-04-10');
    expect(kinds(v, '2026-04-09')).not.toContain('iou_due');
    expect(kinds(v, '2026-04-10')).toContain('iou_due');
    const overdue = (today: string) =>
      dueReminders(v, day(today)).filter((r) => r.kind === 'iou_overdue');
    expect(overdue('2026-04-11').map((r) => r.key)).toEqual([
      'iou-overdue:i1:0',
    ]);
    expect(overdue('2026-04-17')[0]?.key).toBe('iou-overdue:i1:0');
    expect(overdue('2026-04-18')[0]?.key).toBe('iou-overdue:i1:1');
    expect(overdue('2026-04-18')[0]).toMatchObject({ daysOverdue: 8 });
  });

  it('says nothing about an IOU with no due date', () => {
    expect(kinds(withIou(null), '2026-06-01')).toEqual(['weekly_review']);
  });

  it('has one weekly review key per ISO week', () => {
    const review = (today: string) =>
      dueReminders(base, day(today)).find((r) => r.kind === 'weekly_review');
    // 2026-04-06 is a Monday.
    expect(review('2026-04-06')?.key).toBe('review:2026-04-06');
    expect(review('2026-04-12')?.key).toBe('review:2026-04-06');
    expect(review('2026-04-13')?.key).toBe('review:2026-04-13');
  });

  it('is the same however many times it is asked', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), (offset) => {
        const today = day(
          `2026-04-${String(1 + (offset % 28)).padStart(2, '0')}`,
        );
        const v = withIou('2026-04-10');
        expect(dueReminders(v, today)).toEqual(dueReminders(v, today));
        const keys = dueReminders(v, today).map((r) => r.key);
        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });
});
