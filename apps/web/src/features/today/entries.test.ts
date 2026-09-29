import {
  money,
  type AccountView,
  type CategoryView,
  type TransactionView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { entryRows } from './entries.ts';

// Made-up accounts, categories and entries.
const usd = (amountMinor: number) => money(amountMinor, 'USD');

const accounts = [
  { id: 'a-everyday', name: 'Everyday' },
  { id: 'a-savings', name: 'Savings' },
] as AccountView[];
const categories = [{ id: 'c-food', name: 'Food' }] as CategoryView[];

function entry(overrides: Partial<TransactionView>): TransactionView {
  return {
    id: 'e-1',
    kind: 'expense',
    occurredOn: '2026-03-11',
    createdAt: '2026-03-11T09:00:00.000Z',
    source: 'api',
    categoryId: null,
    note: null,
    postings: [],
    reversesId: null,
    reversedById: null,
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

describe('entryRows', () => {
  it('names an expense by category and signs it from the user’s side', () => {
    const rows = entryRows(
      [
        entry({
          categoryId: 'c-food',
          note: 'Lunch',
          postings: [posting('a-everyday', -1250), balancing(1250)],
        }),
      ],
      accounts,
      categories,
    );
    expect(rows).toEqual([
      {
        id: 'e-1',
        kind: 'expense',
        title: 'Food',
        note: 'Lunch',
        accounts: ['Everyday'],
        amount: usd(-1250),
        undone: false,
      },
    ]);
  });

  it('shows a transfer from and to, with the amount sent', () => {
    const [row] = entryRows(
      [
        entry({
          kind: 'transfer',
          postings: [
            posting('a-savings', 30000),
            posting('a-everyday', -30000),
          ],
        }),
      ],
      accounts,
      categories,
    );
    expect(row).toMatchObject({
      title: null,
      accounts: ['Everyday', 'Savings'],
      amount: usd(30000),
    });
  });

  it('marks an undone entry and leaves out the undo itself', () => {
    const rows = entryRows(
      [
        entry({ id: 'e-2', kind: 'reversal', reversesId: 'e-1' }),
        entry({
          reversedById: 'e-2',
          postings: [posting('a-everyday', -500), balancing(500)],
        }),
        entry({
          id: 'e-3',
          kind: 'budget_switch',
          budgetSwitch: { accountId: 'a-savings', budgetGroup: 'on' },
        }),
      ],
      accounts,
      categories,
    );
    expect(rows.map((r) => [r.id, r.undone])).toEqual([['e-1', true]]);
  });
});
