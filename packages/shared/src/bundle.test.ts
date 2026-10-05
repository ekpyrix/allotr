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

  it('accepts a split entry with lines instead of a category', () => {
    const split = {
      kind: 'expense',
      account: 'Wallet',
      amount: eur(350),
      occurredOn: '2026-03-02',
      lines: [
        { category: 'Food/Coffee', amount: eur(200) },
        { category: 'Fun', amount: eur(150) },
      ],
    };
    expect(
      bundleSchema.parse({ ...full, transactions: [split] }).transactions[0],
    ).toMatchObject({ lines: split.lines });
  });

  it('accepts IOU entries and refuses nonsense in them', () => {
    const iou = {
      kind: 'iou',
      direction: 'owed-to-me',
      account: 'Wallet',
      people: [
        { ref: 'sam', person: 'Sam Example', amount: eur(3_000) },
        { person: 'Alex Example', amount: eur(3_000), dueOn: '2026-04-05' },
      ],
      ownShare: { amount: eur(3_000), category: 'Food' },
      occurredOn: '2026-03-04',
    };
    const payment = {
      kind: 'iou_payment',
      account: 'Wallet',
      settles: [{ iou: 'sam', amount: eur(1_000) }],
      occurredOn: '2026-03-09',
    };
    const writeOff = {
      kind: 'iou_write_off',
      iou: 'sam',
      category: 'Other',
      occurredOn: '2026-06-09',
    };
    const ok = bundleSchema.safeParse({
      ...full,
      settings: { ...full.settings, iouWriteOffAfterDays: 30 },
      transactions: [iou, payment, writeOff],
    });
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    for (const bad of [
      { ...iou, people: [] },
      { ...iou, people: [{ person: 'Sam Example', amount: eur(0) }] },
      { ...payment, settles: [] },
      { ...writeOff, iou: '' },
      { ...iou, unknown: true },
    ]) {
      expect(
        bundleSchema.safeParse({ ...full, transactions: [bad] }).success,
      ).toBe(false);
    }
  });

  it('accepts pools, budgets and cover, and refuses nonsense in them', () => {
    const setup = {
      settings: {
        ...full.settings,
        dailyMode: 'daily-budgets',
        budgetPeriod: 'month',
        countSavingsInDaily: true,
      },
      pools: [
        { name: 'Budget', kind: 'spending', defaultFor: 'on' },
        { name: 'Savings', kind: 'savings', defaultFor: 'off' },
        { name: 'Trips', kind: 'savings', archived: true },
      ],
      accounts: [
        {
          name: 'Wallet',
          currency: 'EUR',
          poolMoves: [{ on: '2026-03-10', pool: 'Trips' }],
        },
      ],
      budgets: [
        {
          name: 'Food',
          target: { kind: 'category', category: 'Food' },
          amounts: [{ from: '2026-03-01', amount: eur(30_000) }],
        },
        {
          name: 'Buffer',
          target: { kind: 'buffer' },
          amounts: [{ from: '2026-03-01', amount: eur(0) }],
        },
      ],
      coverOrder: ['free', { budget: 'Buffer' }],
      coverOverrides: [
        {
          transaction: 'rent-mar',
          covers: [{ source: { budget: 'Food' }, amount: eur(500) }],
        },
      ],
    };
    const ok = bundleSchema.safeParse({ ...full, ...setup });
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    const budget = setup.budgets[0];
    for (const bad of [
      { pools: [{ name: 'Budget', kind: 'savings', defaultFor: 'on' }] },
      {
        pools: [
          {
            name: 'Budget',
            kind: 'spending',
            defaultFor: 'on',
            countsTowardDaily: false,
          },
        ],
      },
      { budgets: [{ ...budget, amounts: [] }] },
      {
        budgets: [
          { ...budget, amounts: [{ from: '2026-03-01', amount: eur(-1) }] },
        ],
      },
      {
        budgets: [
          {
            name: 'Buffer',
            target: { kind: 'buffer' },
            mode: 'daily',
            amounts: budget?.amounts,
          },
        ],
      },
      { budgets: [{ ...budget, target: { kind: 'tag', category: 'Food' } }] },
      { coverOrder: ['budget:Food'] },
      { coverOverrides: [{ transaction: 'x', covers: [] }] },
      {
        coverOverrides: [
          { transaction: 'x', covers: [{ source: 'free', amount: eur(0) }] },
        ],
      },
    ]) {
      expect(bundleSchema.safeParse({ ...full, ...bad }).success).toBe(false);
    }
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
    [
      'an entry with both a category and lines',
      {
        ...full,
        transactions: [
          {
            ...spend,
            lines: [
              { category: 'Fun', amount: eur(100) },
              { category: 'Food', amount: eur(250) },
            ],
          },
        ],
      },
      ['transactions', 0, 'category'],
    ],
    [
      'a split with one line',
      {
        ...full,
        transactions: [
          {
            kind: 'expense',
            account: 'Wallet',
            amount: eur(350),
            occurredOn: '2026-03-02',
            lines: [{ category: 'Fun', amount: eur(350) }],
          },
        ],
      },
      ['transactions', 0, 'lines'],
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
