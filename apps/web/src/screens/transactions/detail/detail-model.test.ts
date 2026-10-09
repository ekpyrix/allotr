import {
  money,
  type AccountView,
  type BudgetView,
  type CategoryView,
  type LocalDate,
  type TransactionView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  budgetFor,
  categoryPath,
  coverParts,
  entryDetail,
  isCovered,
  type CoverLine,
} from './detail-model.ts';

// Made-up accounts, categories and entries.
const usd = (amountMinor: number) => money(amountMinor, 'USD');

const accounts = [
  { id: 'a-everyday', name: 'Everyday' },
  { id: 'a-savings', name: 'Savings' },
] as AccountView[];
const categories = [
  { id: 'c-food', name: 'Food', parentId: null, colour: null, icon: null },
  { id: 'c-cafe', name: 'Cafe', parentId: 'c-food', colour: null, icon: null },
  { id: 'c-fun', name: 'Fun', parentId: null, colour: null, icon: null },
] as CategoryView[];

function entry(overrides: Partial<TransactionView>): TransactionView {
  return {
    id: 'e-1',
    kind: 'expense',
    occurredOn: '2026-03-11' as LocalDate,
    occurredTime: null,
    createdAt: '2026-03-11T09:00:00.000Z',
    sortRank: 'V',
    source: 'api',
    categoryId: 'c-cafe',
    note: 'Corner cafe',
    postings: [
      {
        accountId: 'a-everyday',
        systemRole: null,
        amount: usd(-450),
        categoryId: null,
      },
      {
        accountId: 'x-expenses',
        systemRole: 'expenses',
        amount: usd(450),
        categoryId: 'c-cafe',
      },
    ],
    reversesId: null,
    reversedById: null,
    restoredById: null,
    replacesId: null,
    replacedById: null,
    impliedRate: null,
    budgetSwitch: null,
    tagIds: [],
    ...overrides,
  };
}

describe('categoryPath', () => {
  it('shows the parent before the child', () => {
    expect(categoryPath(entry({}), categories)).toBe('Food › Cafe');
  });

  it('shows a top-level category alone', () => {
    expect(categoryPath(entry({ categoryId: 'c-fun' }), categories)).toBe(
      'Fun',
    );
  });

  it('lists the categories of a split', () => {
    const split = entry({
      categoryId: null,
      postings: [
        {
          accountId: 'x',
          systemRole: 'expenses',
          amount: usd(200),
          categoryId: 'c-fun',
        },
        {
          accountId: 'x',
          systemRole: 'expenses',
          amount: usd(250),
          categoryId: 'c-cafe',
        },
      ],
    });
    expect(categoryPath(split, categories)).toBe('Split: Fun, Cafe');
  });

  it('is null without a category', () => {
    expect(
      categoryPath(entry({ categoryId: null, postings: [] }), categories),
    ).toBeNull();
  });
});

describe('entryDetail', () => {
  it('offers every action on a live expense', () => {
    const model = entryDetail(entry({}), accounts, categories);
    expect(model).toMatchObject({
      payee: 'Corner cafe',
      accounts: ['Everyday'],
      canEdit: true,
      canSplit: true,
      canCover: true,
      canDelete: true,
      canRestore: false,
    });
    expect(model.row.amount).toEqual(usd(-450));
  });

  it('does not split an income or a transfer', () => {
    const income = entry({
      kind: 'income',
      postings: [
        {
          accountId: 'a-everyday',
          systemRole: null,
          amount: usd(900),
          categoryId: null,
        },
      ],
    });
    expect(entryDetail(income, accounts, categories)).toMatchObject({
      canEdit: true,
      canSplit: true,
      canCover: false,
    });
    const transfer = entry({
      kind: 'transfer',
      categoryId: null,
      postings: [
        {
          accountId: 'a-everyday',
          systemRole: null,
          amount: usd(-100),
          categoryId: null,
        },
        {
          accountId: 'a-savings',
          systemRole: null,
          amount: usd(100),
          categoryId: null,
        },
      ],
    });
    const model = entryDetail(transfer, accounts, categories);
    expect(model.canSplit).toBe(false);
    expect(model.canEdit).toBe(true);
    expect(model.accounts).toEqual(['Everyday', 'Savings']);
  });

  it('offers restore, not the rest, on a deleted entry', () => {
    const model = entryDetail(
      entry({ reversedById: 'e-2' }),
      accounts,
      categories,
    );
    expect(model).toMatchObject({
      deleted: true,
      canEdit: false,
      canDelete: false,
      canCover: false,
      canRestore: true,
    });
  });

  it('offers no restore once the entry was brought back', () => {
    const model = entryDetail(
      entry({ reversedById: 'e-2', restoredById: 'e-3' }),
      accounts,
      categories,
    );
    expect(model.canRestore).toBe(false);
  });

  it('treats an older version as history only', () => {
    const model = entryDetail(
      entry({ replacedById: 'e-9' }),
      accounts,
      categories,
    );
    expect(model).toMatchObject({
      superseded: true,
      canEdit: false,
      canDelete: false,
    });
  });

  it('flags an edited entry', () => {
    expect(
      entryDetail(entry({ replacesId: 'e-0' }), accounts, categories).edited,
    ).toBe(true);
  });

  it('cannot delete or edit an undo', () => {
    const undo = entry({ kind: 'reversal', reversesId: 'e-0' });
    expect(entryDetail(undo, accounts, categories)).toMatchObject({
      canEdit: false,
      canDelete: false,
      canRestore: false,
    });
  });
});

const line = (overrides: Partial<CoverLine>): CoverLine => ({
  entryId: 'e-1',
  date: '2026-03-11' as LocalDate,
  budgetId: 'b-food',
  loan: false,
  amount: usd(450),
  own: usd(450),
  covers: [],
  uncovered: usd(0),
  overridden: false,
  ...overrides,
});

describe('cover helpers', () => {
  const budgets = [{ id: 'b-food', name: 'Food' }] as BudgetView[];

  const period = { from: '2026-03-01', to: '2026-04-01' };
  const withBudgets = [
    {
      id: 'b-food',
      name: 'Food',
      target: { kind: 'category', categoryId: 'c-food' },
    },
    {
      id: 'b-fun',
      name: 'Fun',
      target: { kind: 'category', categoryId: 'c-fun' },
    },
  ] as BudgetView[];

  it('finds the budget a cover line names', () => {
    expect(
      budgetFor(entry({}), line({}), budgets, categories, period)?.name,
    ).toBe('Food');
  });

  it('falls back to the category, then its parent', () => {
    expect(
      budgetFor(
        entry({ categoryId: 'c-fun' }),
        undefined,
        withBudgets,
        categories,
        period,
      )?.name,
    ).toBe('Fun');
    expect(
      budgetFor(entry({}), undefined, withBudgets, categories, period)?.name,
    ).toBe('Food');
  });

  it('has no budget outside the period or without a category', () => {
    expect(
      budgetFor(
        entry({ occurredOn: '2026-02-27' as LocalDate }),
        undefined,
        withBudgets,
        categories,
        period,
      ),
    ).toBeUndefined();
    expect(
      budgetFor(
        entry({ categoryId: null }),
        undefined,
        withBudgets,
        categories,
        period,
      ),
    ).toBeUndefined();
  });

  it('is not covered when the own budget paid everything', () => {
    expect(isCovered(line({}))).toBe(false);
  });

  it('is covered when another source paid, or something is left over', () => {
    const paid = line({
      own: usd(100),
      covers: [{ source: 'buffer', name: 'Buffer', amount: usd(350) }],
    });
    expect(isCovered(paid)).toBe(true);
    expect(coverParts(paid)).toHaveLength(1);
    expect(isCovered(line({ uncovered: usd(50) }))).toBe(true);
    expect(isCovered(line({ overridden: true }))).toBe(true);
  });
});
