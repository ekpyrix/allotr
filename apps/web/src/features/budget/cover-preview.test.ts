import { money, type CreateTransactionBody } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { coverKey, coverRequest } from './cover-preview.ts';

const expense = (extra: object = {}): CreateTransactionBody => ({
  kind: 'expense',
  accountId: 'a1',
  amount: money(2000, 'USD'),
  categoryId: 'c1',
  ...extra,
});

describe('coverRequest', () => {
  it('asks about a plain expense', () => {
    expect(coverRequest(expense({ occurredOn: '2026-10-02' }))).toEqual({
      accountId: 'a1',
      amount: money(2000, 'USD'),
      categoryId: 'c1',
      occurredOn: '2026-10-02',
    });
  });

  it('does not ask about income, a split or nothing', () => {
    expect(coverRequest(null)).toBeNull();
    expect(
      coverRequest({
        kind: 'income',
        accountId: 'a1',
        amount: money(2000, 'USD'),
        categoryId: 'c1',
      }),
    ).toBeNull();
    expect(
      coverRequest(
        expense({ categoryId: undefined, lines: [{ categoryId: 'c1' }] }),
      ),
    ).toBeNull();
  });

  it('keys the same request the same way', () => {
    expect(coverKey(coverRequest(expense()))).toBe(
      coverKey(coverRequest(expense())),
    );
    expect(coverKey(null)).toBeNull();
  });
});
