import { bundleSchema } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  categoryKey,
  pointer,
  resolveBundle,
  type ExistingCategory,
} from './import-resolve.ts';

// A slice of the starter categories, with made-up ids. Amounts are made up.

const starters: ExistingCategory[] = [
  {
    id: 'c-food',
    name: 'Food',
    kind: 'expense',
    parentId: null,
    isPaycheck: false,
  },
  {
    id: 'c-groc',
    name: 'Groceries',
    kind: 'expense',
    parentId: 'c-food',
    isPaycheck: false,
  },
  {
    id: 'c-fun',
    name: 'Fun',
    kind: 'expense',
    parentId: null,
    isPaycheck: false,
  },
  {
    id: 'c-pay',
    name: 'Paycheck',
    kind: 'income',
    parentId: null,
    isPaycheck: true,
  },
  {
    id: 'c-oinc',
    name: 'Other income',
    kind: 'income',
    parentId: null,
    isPaycheck: false,
  },
];
const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });
const bundle = (rest: Record<string, unknown>) =>
  bundleSchema.parse({ format: 'allotr.bundle', version: 1, ...rest });
const wallet = { name: 'Wallet', currency: 'EUR' };
const spend = (category: string, extra: Record<string, unknown> = {}) => ({
  kind: 'expense',
  account: 'Wallet',
  amount: eur(100),
  category,
  occurredOn: '2026-03-02',
  ...extra,
});
const phone = (payments: Record<string, unknown>[]) => ({
  name: 'Phone',
  account: 'Wallet',
  amount: eur(1),
  dueDay: 3,
  payments,
});

describe('pointer and keys', () => {
  it('escapes ~ and / as RFC 6901 says', () => {
    expect(pointer(['transactions', 3, 'a/b~c'])).toBe(
      '/transactions/3/a~1b~0c',
    );
  });

  it('compares category paths without case or outer spaces', () => {
    expect(categoryKey(' Food / Coffee ')).toBe('food/coffee');
  });
});

describe('resolveBundle', () => {
  it('reuses existing categories matched by name and parent, in any case', () => {
    const r = resolveBundle(
      bundle({
        categories: [
          { name: 'groceries', parent: 'FOOD' },
          { name: 'Coffee', parent: 'Food' },
        ],
      }),
      starters,
    );
    expect(r.errors).toEqual([]);
    expect(r.matched).toBe(1);
    expect(r.toCreate).toEqual([
      { index: 1, key: 'food/coffee', parentKey: 'food', kind: 'expense' },
    ]);
  });

  it('matches a paycheck category without restating the flag', () => {
    const r = resolveBundle(
      bundle({ categories: [{ name: 'Paycheck', kind: 'income' }] }),
      starters,
    );
    expect(r.errors).toEqual([]);
    expect(r.matched).toBe(1);
  });

  it('creates new parents before their children', () => {
    const r = resolveBundle(
      bundle({
        categories: [
          { name: 'Pets', parent: 'Home' },
          { name: 'Home', kind: 'expense' },
        ],
      }),
      starters,
    );
    expect(r.errors).toEqual([]);
    expect(r.toCreate.map((c) => c.key)).toEqual(['home', 'home/pets']);
  });

  it('accepts references in another case', () => {
    const r = resolveBundle(
      bundle({
        accounts: [wallet],
        transactions: [spend('food/groceries', { account: 'wallet' })],
      }),
      starters,
    );
    expect(r.errors).toEqual([]);
  });

  it.each([
    [
      'a duplicate account name',
      { accounts: [wallet, { name: 'WALLET', currency: 'EUR' }] },
      '/accounts/1/name',
    ],
    [
      'a duplicate category',
      {
        categories: [
          { name: 'Pets', kind: 'expense' },
          { name: 'pets', kind: 'expense' },
        ],
      },
      '/categories/1/name',
    ],
    [
      'an unknown parent',
      { categories: [{ name: 'Pets', parent: 'Home' }] },
      '/categories/0/parent',
    ],
    [
      'a parent that is itself a child',
      { categories: [{ name: 'Organic', parent: 'Groceries' }] },
      '/categories/0/parent',
    ],
    [
      'a new top-level category without a kind',
      { categories: [{ name: 'Pets' }] },
      '/categories/0/kind',
    ],
    [
      'a child whose kind differs from its parent',
      { categories: [{ name: 'Tips', parent: 'Food', kind: 'income' }] },
      '/categories/0/kind',
    ],
    [
      'a match whose kind differs',
      { categories: [{ name: 'Fun', kind: 'income' }] },
      '/categories/0/kind',
    ],
    [
      'a match whose paycheck flag differs',
      { categories: [{ name: 'Other income', isPaycheck: true }] },
      '/categories/0/isPaycheck',
    ],
    [
      'an unknown account',
      { transactions: [spend('Fun')] },
      '/transactions/0/account',
    ],
    [
      'an unknown transfer source',
      {
        accounts: [wallet],
        transactions: [
          {
            kind: 'transfer',
            from: 'Bank',
            to: 'Wallet',
            sent: eur(1),
            occurredOn: '2026-03-02',
          },
        ],
      },
      '/transactions/0/from',
    ],
    [
      'an unknown category',
      { accounts: [wallet], transactions: [spend('Food/Coffee')] },
      '/transactions/0/category',
    ],
    [
      'a path with three parts',
      { accounts: [wallet], transactions: [spend('Food/Groceries/Organic')] },
      '/transactions/0/category',
    ],
    [
      'a category of the wrong kind',
      { accounts: [wallet], transactions: [spend('Paycheck')] },
      '/transactions/0/category',
    ],
    [
      'a duplicate ref',
      {
        accounts: [wallet],
        transactions: [spend('Fun', { ref: 'r' }), spend('Fun', { ref: 'r' })],
      },
      '/transactions/1/ref',
    ],
    [
      'an unknown bill account',
      {
        bills: [{ name: 'Phone', account: 'Bank', amount: eur(1), dueDay: 3 }],
      },
      '/bills/0/account',
    ],
    [
      'an unknown payment ref',
      {
        accounts: [wallet],
        bills: [
          phone([
            { dueOn: '2026-03-03', paidOn: '2026-03-03', transaction: 'nope' },
          ]),
        ],
      },
      '/bills/0/payments/0/transaction',
    ],
    [
      'a ref paid twice',
      {
        accounts: [wallet],
        transactions: [spend('Fun', { ref: 'r' })],
        bills: [
          phone([
            { dueOn: '2026-03-03', paidOn: '2026-03-03', transaction: 'r' },
            { dueOn: '2026-04-03', paidOn: '2026-04-03', transaction: 'r' },
          ]),
        ],
      },
      '/bills/0/payments/1/transaction',
    ],
    [
      'a duplicate rate for a pair and day',
      {
        rates: [
          { base: 'USD', quote: 'EUR', rate: '0.9', asOf: '2026-03-01' },
          { base: 'USD', quote: 'EUR', rate: '0.91', asOf: '2026-03-01' },
        ],
      },
      '/rates/1',
    ],
  ])('reports %s', (_, rest, path) => {
    expect(
      resolveBundle(bundle(rest), starters).errors.map((e) => e.path),
    ).toContain(path);
  });

  it('hints at the full path for a child named alone', () => {
    const r = resolveBundle(
      bundle({ accounts: [wallet], transactions: [spend('Groceries')] }),
      starters,
    );
    expect(r.errors).toEqual([
      {
        path: '/transactions/0/category',
        message:
          'There is no category "Groceries". Did you mean "Food/Groceries"?',
      },
    ]);
  });

  it('reports every problem, up to 100', () => {
    const transactions = Array.from({ length: 150 }, () => spend('Fun'));
    expect(
      resolveBundle(bundle({ transactions }), starters).errors,
    ).toHaveLength(100);
  });
});
