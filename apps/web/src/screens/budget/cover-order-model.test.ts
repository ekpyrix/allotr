import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { BudgetView } from '@allotr/shared';
import { previewRequest, reorder } from './cover-order-model.ts';

describe('reorder', () => {
  const list = ['free', 'buffer', 'a', 'b', 'c'];

  it('moves a row before or after a target', () => {
    expect(reorder(list, new Set(['c']), 'free', 'before')).toEqual([
      'c',
      'free',
      'buffer',
      'a',
      'b',
    ]);
    expect(reorder(list, new Set(['free']), 'a', 'after')).toEqual([
      'buffer',
      'a',
      'free',
      'b',
      'c',
    ]);
  });

  it('ignores a drop onto itself or an unknown target', () => {
    expect(reorder(list, new Set(['a']), 'a', 'after')).toEqual(list);
    expect(reorder(list, new Set(['a']), 'zzz', 'after')).toEqual(list);
  });

  it('keeps every row exactly once', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1 }), {
          minLength: 2,
          maxLength: 12,
        }),
        fc.nat(),
        fc.nat(),
        fc.boolean(),
        (ids, a, b, before) => {
          const moved = ids[a % ids.length] as string;
          const target = ids[b % ids.length] as string;
          const next = reorder(
            ids,
            new Set([moved]),
            target,
            before ? 'before' : 'after',
          );
          expect([...next].sort()).toEqual([...ids].sort());
        },
      ),
    );
  });
});

describe('previewRequest', () => {
  const budget = {
    target: { kind: 'category', categoryId: 'cat' },
  } as BudgetView;

  it('is null until a budget, account and positive amount are given', () => {
    const base = { budget, accountId: 'acc', currency: 'USD', amount: '12.50' };
    expect(previewRequest({ ...base, budget: undefined })).toBeNull();
    expect(previewRequest({ ...base, accountId: '' })).toBeNull();
    expect(previewRequest({ ...base, amount: '' })).toBeNull();
    expect(previewRequest({ ...base, amount: 'abc' })).toBeNull();
    expect(previewRequest({ ...base, amount: '0' })).toBeNull();
    expect(
      previewRequest({
        ...base,
        budget: { target: { kind: 'buffer' } } as BudgetView,
      }),
    ).toBeNull();
  });

  it('parses the amount into minor units', () => {
    expect(
      previewRequest({
        budget,
        accountId: 'acc',
        currency: 'USD',
        amount: '12.50',
      }),
    ).toEqual({
      accountId: 'acc',
      categoryId: 'cat',
      amount: { amountMinor: 1250, currency: 'USD' },
    });
  });
});
