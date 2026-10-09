import { describe, expect, it } from 'vitest';
import {
  searchOf,
  validateTransactionsSearch,
  viewOf,
} from './search-params.ts';

describe('validateTransactionsSearch', () => {
  it('keeps valid values and drops the defaults', () => {
    expect(
      validateTransactionsSearch({
        q: '  coffee ',
        period: 'month',
        type: 'expense',
        categories: ['c1', 'c2', 'c1'],
        accounts: 'a1,a2',
        group: 'category',
        entry: 'e1',
      }),
    ).toEqual({
      q: 'coffee',
      period: 'month',
      type: 'expense',
      categories: ['c1', 'c2'],
      accounts: ['a1', 'a2'],
      group: 'category',
      entry: 'e1',
    });
    const plain = validateTransactionsSearch({ period: 'cycle', group: 'day' });
    expect(plain.period).toBeUndefined();
    expect(plain.group).toBeUndefined();
  });

  it('drops anything malformed', () => {
    expect(
      validateTransactionsSearch({
        q: 5,
        period: 'decade',
        type: 'loan',
        categories: [1, {}, ''],
        accounts: 7,
        group: 'week',
        entry: '',
      }),
    ).toEqual({
      q: undefined,
      period: undefined,
      type: undefined,
      categories: undefined,
      accounts: undefined,
      group: undefined,
      entry: undefined,
    });
  });

  it('caps a list at 50 ids', () => {
    const many = Array.from({ length: 80 }, (_, i) => `id${String(i)}`);
    expect(
      validateTransactionsSearch({ accounts: many }).accounts,
    ).toHaveLength(50);
  });
});

describe('viewOf and searchOf', () => {
  it('fill in and strip the defaults', () => {
    expect(viewOf({})).toMatchObject({
      period: 'cycle',
      group: 'day',
      categories: [],
      accounts: [],
    });
    expect(searchOf({ period: 'cycle', group: 'day', categories: [] })).toEqual(
      {
        q: undefined,
        period: undefined,
        type: undefined,
        categories: undefined,
        accounts: undefined,
        group: undefined,
        entry: undefined,
      },
    );
    expect(searchOf({ period: 'all', accounts: ['a1'] })).toMatchObject({
      period: 'all',
      accounts: ['a1'],
    });
  });
});
