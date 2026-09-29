import {
  money,
  type LocalDate,
  type Rate,
  type TransactionView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { rateText } from './format.ts';

// Postings laid out as core builds them (packages/core build.ts): the
// exchange legs book what was given up positive and what came out negative.
// Made-up amounts.
const leg = (
  role: 'expenses' | 'income' | 'conversion' | null,
  amountMinor: number,
  currency: string,
) => ({
  accountId: role ?? 'own',
  systemRole: role,
  amount: money(amountMinor, currency),
  categoryId: null,
});

function entry(
  kind: TransactionView['kind'],
  impliedRate: string | null,
  postings: ReturnType<typeof leg>[],
): TransactionView {
  return {
    id: 'e-1',
    kind,
    occurredOn: '2026-03-11' as LocalDate,
    createdAt: '2026-03-11T09:00:00.000Z',
    source: 'api',
    categoryId: null,
    note: null,
    postings,
    reversesId: null,
    reversedById: null,
    impliedRate: impliedRate as Rate | null,
    budgetSwitch: null,
    tagIds: [],
  };
}

const undo = (original: TransactionView): TransactionView => ({
  ...original,
  kind: 'reversal',
  postings: original.postings.map((p) => ({
    ...p,
    amount: money(-p.amount.amountMinor, p.amount.currency),
  })),
});

// 13.50 USD paid for a 12.40 EUR price: 0.9185… EUR per USD.
const expense = entry('expense', '0.918518', [
  leg(null, -1350, 'USD'),
  leg('conversion', 1350, 'USD'),
  leg('conversion', -1240, 'EUR'),
  leg('expenses', 1240, 'EUR'),
]);
// 100.00 EUR earned, 108.00 USD received.
const income = entry('income', '1.08', [
  leg('income', -10000, 'EUR'),
  leg('conversion', 10000, 'EUR'),
  leg('conversion', -10800, 'USD'),
  leg(null, 10800, 'USD'),
]);
// 500 JPY sent, 3.10 USD received.
const transfer = entry('transfer', '0.0062', [
  leg(null, -500, 'JPY'),
  leg('conversion', 500, 'JPY'),
  leg('conversion', -310, 'USD'),
  leg(null, 310, 'USD'),
]);

describe('rateText', () => {
  it.each([
    ['a foreign-price expense', expense, '1 USD = 0.918518 EUR'],
    ['a foreign-price income', income, '1 EUR = 1.08 USD'],
    ['a cross-currency transfer', transfer, '1 JPY = 0.0062 USD'],
    ['the undo of an expense', undo(expense), '1 USD = 0.918518 EUR'],
    ['the undo of an income', undo(income), '1 EUR = 1.08 USD'],
    ['the undo of a transfer', undo(transfer), '1 JPY = 0.0062 USD'],
  ])('reads %s', (_name, value, expected) => {
    expect(rateText(value)).toBe(expected);
  });

  it('is null without a rate', () => {
    expect(
      rateText(
        entry('expense', null, [
          leg(null, -100, 'USD'),
          leg('expenses', 100, 'USD'),
        ]),
      ),
    ).toBeNull();
  });
});
