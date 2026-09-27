import { describe, expect, it } from 'vitest';
import { bundleSchema } from './bundle.ts';

// All names and amounts are made up.

const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' });

const full = {
  format: 'allotr.bundle',
  version: 1,
  settings: { timeZone: 'UTC', defaultCurrency: 'EUR', paydayDay: 25 },
  categories: [
    { name: 'Coffee', parent: 'Food' },
    { name: 'Side gigs', kind: 'income' },
  ],
  accounts: [
    {
      name: 'Wallet',
      currency: 'EUR',
      openingBalance: eur(12_000),
      openedOn: '2026-03-01',
    },
    { name: 'Savings', currency: 'EUR', budgetGroup: 'off' },
  ],
  rates: [{ base: 'USD', quote: 'EUR', rate: '0.92', asOf: '2026-03-01' }],
  transactions: [
    {
      kind: 'expense',
      account: 'Wallet',
      amount: eur(350),
      category: 'Food/Coffee',
      occurredOn: '2026-03-02',
      tags: ['trip'],
    },
    {
      kind: 'transfer',
      from: 'Wallet',
      to: 'Savings',
      sent: eur(5_000),
      occurredOn: '2026-03-03',
    },
    {
      kind: 'expense',
      ref: 'rent-mar',
      account: 'Wallet',
      amount: eur(8_000),
      category: 'Housing/Rent',
      occurredOn: '2026-03-05',
    },
  ],
  bills: [
    {
      name: 'Rent',
      account: 'Wallet',
      amount: eur(8_000),
      dueDay: 5,
      payments: [
        { dueOn: '2026-03-05', paidOn: '2026-03-05', transaction: 'rent-mar' },
      ],
    },
  ],
};

const spend = full.transactions[0];

describe('bundleSchema', () => {
  it('accepts a full bundle and fills defaults', () => {
    const bundle = bundleSchema.parse(full);
    expect(bundle.accounts[1]).toMatchObject({
      kind: 'asset',
      budgetGroup: 'off',
    });
    expect(bundle.categories[0]?.isPaycheck).toBeUndefined();
    expect(bundle.bills[0]).toMatchObject({ active: true });
  });

  it('accepts a bundle with only the header', () => {
    expect(
      bundleSchema.parse({ format: 'allotr.bundle', version: 1 }),
    ).toMatchObject({
      categories: [],
      accounts: [],
      rates: [],
      transactions: [],
      bills: [],
    });
  });

  it.each([
    ['an unknown top-level key', { ...full, extra: 1 }, []],
    [
      'an unknown item key',
      { ...full, accounts: [{ ...full.accounts[0], colour: 'red' }] },
      ['accounts', 0],
    ],
    ['another version', { ...full, version: 2 }, ['version']],
    ['another format', { ...full, format: 'other' }, ['format']],
    [
      'a transaction without a date',
      {
        ...full,
        transactions: [
          {
            kind: 'expense',
            account: 'Wallet',
            amount: eur(1),
            category: 'Fun',
          },
        ],
      },
      ['transactions', 0, 'occurredOn'],
    ],
    [
      'a slash in a category name',
      { ...full, categories: [{ name: 'A/B', kind: 'expense' }] },
      ['categories', 0, 'name'],
    ],
    [
      'a rate between one currency',
      {
        ...full,
        rates: [{ base: 'EUR', quote: 'EUR', rate: '1', asOf: '2026-03-01' }],
      },
      ['rates', 0, 'quote'],
    ],
    [
      'a zero bill amount',
      {
        ...full,
        bills: [{ name: 'X', account: 'Wallet', amount: eur(0), dueDay: 1 }],
      },
      ['bills', 0, 'amount'],
    ],
    [
      'more than 20 tags',
      {
        ...full,
        transactions: [
          {
            ...spend,
            tags: Array.from({ length: 21 }, (_, i) => `t${String(i)}`),
          },
        ],
      },
      ['transactions', 0, 'tags'],
    ],
  ])('rejects %s', (_, input, path) => {
    const result = bundleSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path)).toContainEqual(path);
  });

  it('rejects more than 1,000 accounts', () => {
    const accounts = Array.from({ length: 1_001 }, (_, i) => ({
      name: `A${String(i)}`,
      currency: 'EUR',
    }));
    expect(bundleSchema.safeParse({ ...full, accounts }).success).toBe(false);
  });
});
