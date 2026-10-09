import {
  money,
  type AccountView,
  type CategoryView,
  type TransactionView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { dashboardEntries } from './todays-entries-model.ts';

// Made-up accounts, categories and entries.
const usd = (amountMinor: number) => money(amountMinor, 'USD');
const accounts = [{ id: 'a-everyday', name: 'Everyday' }] as AccountView[];
const categories = [
  { id: 'c-food', name: 'Food', colour: 'series-6', icon: null },
] as CategoryView[];

function entry(overrides: Partial<TransactionView>): TransactionView {
  return {
    id: 'e-1',
    kind: 'expense',
    occurredOn: '2026-03-11',
    occurredTime: '12:30:00',
    categoryId: null,
    note: null,
    postings: [
      {
        accountId: 'a-everyday',
        systemRole: null,
        amount: usd(-1250),
        categoryId: null,
      },
      {
        accountId: 'sys-expenses',
        systemRole: 'expenses',
        amount: usd(1250),
        categoryId: overrides.categoryId ?? null,
      },
    ],
    reversedById: null,
    ...overrides,
  } as TransactionView;
}

describe('dashboardEntries', () => {
  it('shows the note as the payee and the category beside it', () => {
    const [row] = dashboardEntries(
      [entry({ categoryId: 'c-food', note: 'Lunch' })],
      accounts,
      categories,
    );
    expect(row).toMatchObject({
      time: '12:30',
      payee: 'Lunch',
      category: 'Food',
    });
  });

  it('does not repeat the category when there is no note', () => {
    const [row] = dashboardEntries(
      [entry({ categoryId: 'c-food', occurredTime: null })],
      accounts,
      categories,
    );
    expect(row).toMatchObject({ time: null, payee: 'Food', category: null });
  });

  it('does not repeat the note when there is no category', () => {
    const [row] = dashboardEntries(
      [entry({ note: 'Market' })],
      accounts,
      categories,
    );
    expect(row).toMatchObject({ payee: 'Market', category: null });
  });
});
