import {
  currencyCode,
  money,
  type CreateTransactionBody,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { toLoanBody, toSplitBody } from './draft.ts';

const usd = (n: number) => money(n, 'USD');
const dinner = {
  kind: 'expense',
  accountId: 'a1',
  amount: usd(2500),
  categoryId: 'c1',
  occurredOn: '2026-10-02',
} as CreateTransactionBody;

describe('toSplitBody', () => {
  it('keeps the typed amount as the own share and adds each person', () => {
    const result = toSplitBody(
      dinner,
      [
        { person: ' Alex Example ', amount: '25', dueOn: '' },
        { person: 'Sam Example', amount: '12.50', dueOn: '2026-11-01' },
      ],
      'en-US',
    );
    expect(result).toEqual({
      ok: true,
      body: {
        direction: 'owed-to-me',
        accountId: 'a1',
        people: [
          { person: 'Alex Example', amount: usd(2500) },
          { person: 'Sam Example', amount: usd(1250), dueOn: '2026-11-01' },
        ],
        ownShare: { amount: usd(2500), categoryId: 'c1' },
        occurredOn: '2026-10-02',
      },
    });
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
