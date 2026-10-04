import {
  money,
  type AccountView,
  type CategoryView,
  type LocalDate,
  type TransactionView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { afterIdAt, byDay, ledgerRows } from './rows.ts';

// Made-up accounts, categories and entries.
const usd = (amountMinor: number) => money(amountMinor, 'USD');

const accounts = [
  { id: 'a-everyday', name: 'Everyday' },
  { id: 'a-savings', name: 'Savings' },
] as AccountView[];
const categories = [
  { id: 'c-food', name: 'Food', colour: 'series-6', icon: 'utensils' },
  { id: 'c-fun', name: 'Fun', colour: null, icon: null },
] as CategoryView[];

function entry(overrides: Partial<TransactionView>): TransactionView {
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
    impliedRate: null,
    budgetSwitch: null,
    tagIds: [],
    ...overrides,
  } as TransactionView;
}

const posting = (accountId: string, amountMinor: number) => ({
  accountId,
  systemRole: null,
  amount: usd(amountMinor),
  categoryId: null,
});
const balancing = (amountMinor: number) => ({
  accountId: 'sys-expenses',
  systemRole: 'expenses' as const,
  amount: usd(amountMinor),
  categoryId: 'c-food',
});

describe('ledgerRows', () => {
  it('names every line of a split, with the whole amount', () => {
    const [row] = ledgerRows(
      [
        entry({
          postings: [
            posting('a-everyday', -8000),
            balancing(6000),
            { ...balancing(2000), categoryId: 'c-fun' },
          ],
        }),
      ],
      accounts,
      categories,
    );
    expect(row).toMatchObject({
      title: 'Split: Food, Fun',
      amount: usd(-8000),
    });
  });

  it('shows an undo as its own row, signed the other way', () => {
    const rows = ledgerRows(
      [
        entry({
          id: 'e-2',
          kind: 'reversal',
          reversesId: 'e-1',
          categoryId: 'c-food',
          postings: [posting('a-everyday', 1250), balancing(-1250)],
        }),
        entry({
          categoryId: 'c-food',
          note: 'Lunch',
          reversedById: 'e-2',
          postings: [posting('a-everyday', -1250), balancing(1250)],
        }),
      ],
      accounts,
      categories,
    );
    expect(rows).toEqual([
      {
        id: 'e-2',
        kind: 'reversal',
        occurredOn: '2026-03-11',
        occurredTime: null,
        title: 'Food',
        note: null,
        accounts: ['Everyday'],
        amount: usd(1250),
        moves: false,
        undone: false,
        reversesId: 'e-1',
        originalKind: 'expense',
        budgetGroup: null,
        style: { colour: 'series-6', icon: 'utensils' },
      },
      {
        id: 'e-1',
        kind: 'expense',
        occurredOn: '2026-03-11',
        occurredTime: null,
        title: 'Food',
        note: 'Lunch',
        accounts: ['Everyday'],
        amount: usd(-1250),
        moves: false,
        undone: true,
        reversesId: null,
        originalKind: null,
        budgetGroup: null,
        style: { colour: 'series-6', icon: 'utensils' },
      },
    ]);
  });

  it('keeps a transfer’s direction on its undo', () => {
    const rows = ledgerRows(
      [
        entry({
          id: 'e-2',
          kind: 'reversal',
          reversesId: 'e-9',
          postings: [
            posting('a-everyday', 30000),
            posting('a-savings', -30000),
          ],
        }),
      ],
      accounts,
      categories,
    );
    expect(rows[0]).toMatchObject({
      title: null,
      accounts: ['Everyday', 'Savings'],
      amount: usd(30000),
      moves: true,
      originalKind: null,
    });
  });

  it('names an undo by the undone entry’s note when it has no category', () => {
    const [undo] = ledgerRows(
      [
        entry({ id: 'e-2', kind: 'reversal', reversesId: 'e-1' }),
        entry({ kind: 'transfer', note: 'Rent pot', reversedById: 'e-2' }),
      ],
      accounts,
      categories,
    );
    expect(undo?.title).toBe('Rent pot');
  });

  it('shows a budget switch with its account and no amount', () => {
    const [row] = ledgerRows(
      [
        entry({
          kind: 'budget_switch',
          budgetSwitch: { accountId: 'a-savings', budgetGroup: 'on' },
        }),
      ],
      accounts,
      categories,
    );
    expect(row).toMatchObject({
      accounts: ['Savings'],
      amount: null,
      budgetGroup: 'on',
    });
  });
});

describe('byDay', () => {
  it('groups consecutive rows by their date', () => {
    const rows = ledgerRows(
      [
        entry({ id: 'a', occurredOn: '2026-03-12' as LocalDate }),
        entry({ id: 'b', occurredOn: '2026-03-11' as LocalDate }),
        entry({ id: 'c', occurredOn: '2026-03-11' as LocalDate }),
      ],
      accounts,
      categories,
    );
    expect(byDay(rows).map((d) => [d.day, d.rows.map((r) => r.id)])).toEqual([
      ['2026-03-12', ['a']],
      ['2026-03-11', ['b', 'c']],
    ]);
  });
});

describe('afterIdAt', () => {
  const day = [{ id: 'c' }, { id: 'b' }, { id: 'a' }];

  it('names the row listed below, which is the one before it in time', () => {
    expect(afterIdAt(day, 0)).toBe('b');
    expect(afterIdAt(day, 1)).toBe('a');
  });

  it('is null at the bottom, the start of the day', () => {
    expect(afterIdAt(day, 2)).toBeNull();
  });
});
