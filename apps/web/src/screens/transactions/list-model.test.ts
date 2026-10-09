import {
  money,
  type AccountView,
  type CategoryView,
  type TransactionListView,
  type TransactionView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  entryCategoryLabel,
  groupTotal,
  sections,
  summaryParts,
  txRows,
} from './list-model.ts';

// Made-up accounts, categories and entries.
const usd = (amountMinor: number) => money(amountMinor, 'USD');

const accounts = [
  { id: 'a-everyday', name: 'Everyday' },
  { id: 'a-savings', name: 'Savings' },
] as AccountView[];
const categories = [
  { id: 'c-food', name: 'Food', parentId: null, colour: null, icon: null },
  { id: 'c-cafe', name: 'Cafés', parentId: 'c-food', colour: null, icon: null },
  { id: 'c-fun', name: 'Fun', parentId: null, colour: null, icon: null },
] as CategoryView[];

function entry(overrides: Record<string, unknown>): TransactionView {
  return {
    id: 'e-1',
    kind: 'expense',
    occurredOn: '2026-03-11',
    occurredTime: null,
    createdAt: '2026-03-11T09:00:00.000Z',
    sortRank: 'V',
    source: 'api',
    categoryId: null,
    note: null,
    postings: [],
    reversesId: null,
    reversedById: null,
    restoredById: null,
    replacesId: null,
    replacedById: null,
    impliedRate: null,
    budgetSwitch: null,
    tagIds: [],
    ...overrides,
  } as unknown as TransactionView;
}

const own = (amountMinor: number) => ({
  accountId: 'a-everyday',
  systemRole: null,
  amount: usd(-amountMinor),
  categoryId: null,
});
const balancing = (amountMinor: number, categoryId: string | null = null) => ({
  accountId: 'sys',
  systemRole: 'expenses' as const,
  amount: usd(amountMinor),
  categoryId,
});
const spend = (amountMinor: number) => [
  own(amountMinor),
  balancing(amountMinor),
];

const entries = [
  entry({
    id: 'e-3',
    occurredOn: '2026-03-12',
    occurredTime: '08:30:00',
    categoryId: 'c-cafe',
    note: 'Corner cafe',
    postings: spend(450),
  }),
  entry({
    id: 'e-2',
    occurredOn: '2026-03-11',
    categoryId: 'c-fun',
    postings: spend(1200),
  }),
  entry({
    id: 'e-1',
    occurredOn: '2026-03-11',
    categoryId: 'c-cafe',
    note: 'Beans',
    postings: spend(900),
  }),
];

const totals = (spent: number, income: number, count: number) => ({
  count,
  byCurrency: [
    {
      spent: usd(spent),
      income: usd(income),
      net: usd(income - spent),
    },
  ],
});

describe('txRows', () => {
  it('shows parent › category, the payee and the time', () => {
    const [first, second] = txRows(entries, accounts, categories);
    expect(first).toMatchObject({
      payee: 'Corner cafe',
      category: 'Food › Cafés',
      account: 'Everyday',
      time: '08:30',
    });
    expect(second).toMatchObject({ payee: 'Fun', category: 'Fun', time: null });
  });

  it('labels a split with its categories', () => {
    const split = entry({
      postings: [own(300), balancing(100, 'c-fun'), balancing(200, 'c-cafe')],
    });
    expect(entryCategoryLabel(split, categories)).toBe(
      'Split: Fun, Food › Cafés',
    );
  });
});

describe('totals', () => {
  it('describes the server figures without adding anything', () => {
    expect(summaryParts(totals(2550, 0, 3))).toEqual([
      '3 entries',
      'spent $25.50',
    ]);
    expect(summaryParts(totals(2550, 10000, 4))).toEqual([
      '4 entries',
      'spent $25.50',
      'income $100.00',
      'net +$74.50',
    ]);
    expect(groupTotal(totals(450, 0, 1))).toBe('$4.50');
    expect(groupTotal(totals(0, 0, 1))).toBeNull();
  });
});

describe('sections', () => {
  const base = {
    transactions: entries,
    accounts,
    categories,
    locale: 'en',
    groups: [] as TransactionListView['groups'],
    dayTotals: [
      { date: '2026-03-12', net: usd(-450), missingRates: [] },
      { date: '2026-03-11', net: usd(-2100), missingRates: [] },
    ] as unknown as TransactionListView['dayTotals'],
  };

  it('groups by day with the server day nets', () => {
    const days = sections({ ...base, group: 'day' });
    expect(days.map((d) => [d.key, d.rows.length, d.total])).toEqual([
      ['2026-03-12', 1, '−$4.50'],
      ['2026-03-11', 2, '−$21.00'],
    ]);
  });

  it('groups by category with the server group figures', () => {
    const groups = [
      { key: 'c-cafe', ...totals(1350, 0, 2) },
      { key: 'c-fun', ...totals(1200, 0, 1) },
    ] as TransactionListView['groups'];
    const byCategory = sections({ ...base, group: 'category', groups });
    expect(byCategory.map((s) => [s.title, s.total, s.rows.length])).toEqual([
      ['Food › Cafés', '$13.50', 2],
      ['Fun', '$12.00', 1],
    ]);
  });

  it('has one headerless section without grouping', () => {
    const [only, ...rest] = sections({ ...base, group: 'none' });
    expect(rest).toEqual([]);
    expect(only?.title).toBeNull();
    expect(only?.rows).toHaveLength(3);
  });
});
