import {
  currencyCode,
  money,
  type CreateTransactionBody,
} from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  emptyPerson,
  evenShare,
  fillEven,
  ownShareOf,
  toLoanBody,
  toSplitBody,
} from './draft.ts';

const usd = (n: number) => money(n, 'USD');
const dinner = {
  kind: 'expense',
  accountId: 'a1',
  amount: usd(2500),
  categoryId: 'c1',
  occurredOn: '2026-10-02',
} as CreateTransactionBody;

describe('toSplitBody', () => {
  it('takes the typed amount as the whole bill and leaves the rest as the own share', () => {
    const result = toSplitBody(
      dinner,
      [
        { person: ' Alex Example ', amount: '10', dueOn: '' },
        { person: 'Sam Example', amount: '7.50', dueOn: '2026-11-01' },
      ],
      'en-US',
    );
    expect(result).toEqual({
      ok: true,
      body: {
        direction: 'owed-to-me',
        accountId: 'a1',
        people: [
          { person: 'Alex Example', amount: usd(1000) },
          { person: 'Sam Example', amount: usd(750), dueOn: '2026-11-01' },
        ],
        ownShare: { amount: usd(750), categoryId: 'c1' },
        occurredOn: '2026-10-02',
      },
    });
  });

  it('records a loan when people owe the whole bill', () => {
    const result = toSplitBody(
      dinner,
      [{ person: 'Alex Example', amount: '25', dueOn: '' }],
      'en-US',
    );
    expect(result.ok && result.body.ownShare).toBe(undefined);
    expect(result.ok && result.body.people).toEqual([
      { person: 'Alex Example', amount: usd(2500) },
    ]);
  });

  it('refuses people owing more than the bill', () => {
    expect(
      toSplitBody(
        dinner,
        [{ person: 'Alex Example', amount: '25.01', dueOn: '' }],
        'en-US',
      ),
    ).toEqual({ ok: false, errors: {}, total: 'exceeds' });
  });

  it('points at the person line with a missing name or a bad amount', () => {
    expect(
      toSplitBody(
        dinner,
        [
          { person: '', amount: '5', dueOn: '' },
          { person: 'Alex Example', amount: 'x', dueOn: '' },
          { person: 'Sam Example', amount: '0', dueOn: '' },
        ],
        'en-US',
      ),
    ).toEqual({ ok: false, errors: { 0: 'person', 1: 'amount', 2: 'amount' } });
  });
});

describe('toLoanBody', () => {
  it('builds a loan with a note', () => {
    const result = toLoanBody(
      'owed-by-me',
      'a1',
      { person: 'Alex Example', amount: '40', dueOn: '' },
      currencyCode('USD'),
      'en-US',
      ' trip ',
    );
    expect(result).toEqual({
      ok: true,
      body: {
        direction: 'owed-by-me',
        accountId: 'a1',
        people: [{ person: 'Alex Example', amount: usd(4000) }],
        note: 'trip',
      },
    });
  });
});

describe('evenShare', () => {
  it('splits a bill between the people and the user', () => {
    expect(evenShare(100_000, 4)).toBe(20_000);
  });

  it('leaves the odd minor units with the user', () => {
    expect(evenShare(1000, 2)).toBe(333);
  });

  it('never gives the user less than anyone else, or a negative share', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 1, max: 20 }),
        (total, people) => {
          const share = evenShare(total, people);
          const own = total - share * people;
          expect(share).toBeGreaterThanOrEqual(0);
          expect(own).toBeGreaterThanOrEqual(share);
          expect(own - share).toBeLessThanOrEqual(people);
        },
      ),
    );
  });
});

describe('fillEven', () => {
  const people = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...emptyPerson,
      person: `Person ${String(i + 1)}`,
    }));

  it('fills everyone with an even share of the bill', () => {
    const filled = fillEven(people(4), usd(100_000), 'en-US');
    expect(filled.map((p) => p.amount)).toEqual([
      '200.00',
      '200.00',
      '200.00',
      '200.00',
    ]);
    expect(ownShareOf(usd(100_000), filled, 'en-US')).toEqual(usd(20_000));
  });

  it('keeps typed amounts and splits what they leave', () => {
    const filled = fillEven(
      people(4).map((p, i) =>
        i === 0 ? { ...p, amount: '300', edited: true } : p,
      ),
      usd(100_000),
      'en-US',
    );
    expect(filled.map((p) => p.amount)).toEqual([
      '300',
      '175.00',
      '175.00',
      '175.00',
    ]);
  });

  it('leaves the amounts alone without a bill', () => {
    const before = people(2);
    expect(fillEven(before, null, 'en-US')).toBe(before);
  });

  it('always adds up to the bill with the own share', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 1, max: 20 }),
        (total, n) => {
          const bill = usd(total);
          const own = ownShareOf(
            bill,
            fillEven(people(n), bill, 'en-US'),
            'en-US',
          );
          // A share of zero leaves an amount to type, so there is no sum yet.
          if (evenShare(total, n) === 0) expect(own).toBe(null);
          else expect(own?.amountMinor).toBe(total - evenShare(total, n) * n);
        },
      ),
    );
  });
});
