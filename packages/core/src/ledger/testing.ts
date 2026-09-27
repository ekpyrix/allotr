import { currencyCode, localDate, type CurrencyCode } from '@allotr/shared';
import { chartOf, type Chart } from './chart.ts';
import { LedgerError, type LedgerErrorCode } from './errors.ts';
import {
  accountId,
  categoryId,
  transactionId,
  type Account,
  type BudgetGroup,
  type EntryMeta,
  type SystemRole,
} from './types.ts';

// Test helpers with made-up accounts; not exported from the package.

export function errorCode(fn: () => unknown): LedgerErrorCode | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof LedgerError) return error.code;
    throw error;
  }
  return undefined;
}

export function userAccount(
  id: string,
  currency: string,
  budgetGroup: BudgetGroup = 'on',
  archived = false,
): Account {
  return {
    id: accountId(id),
    currency: currencyCode(currency),
    kind: 'asset',
    systemRole: null,
    budgetGroup,
    archived,
  };
}

const kinds = {
  expenses: 'expense',
  income: 'income',
  opening: 'equity',
  conversion: 'equity',
} as const;

export function systemAccounts(currency: CurrencyCode): Account[] {
  return (Object.keys(kinds) as SystemRole[]).map((role) => ({
    id: accountId(`${role}-${currency}`),
    currency,
    kind: kinds[role],
    systemRole: role,
    budgetGroup: null,
    archived: false,
  }));
}

export const testCurrencies = ['USD', 'EUR', 'JPY', 'KWD'].map(currencyCode);

// Two on-budget and one off-budget account per currency, plus system
// accounts, covering 0-, 2- and 3-digit currencies.
export function testChart(extra: Account[] = []): Chart {
  return chartOf([
    ...testCurrencies.flatMap((currency) => [
      userAccount(`card-${currency}`, currency, 'on'),
      userAccount(`cash-${currency}`, currency, 'on'),
      userAccount(`savings-${currency}`, currency, 'off'),
      ...systemAccounts(currency),
    ]),
    ...extra,
  ]);
}

export const food = categoryId('food');
export const salary = categoryId('salary');

let counter = 0;

export function meta(
  occurredOn = '2026-03-10',
  overrides: Partial<EntryMeta> = {},
): EntryMeta {
  counter += 1;
  return {
    id: transactionId(`t${String(counter).padStart(6, '0')}`),
    occurredOn: localDate(occurredOn),
    createdAt: `2026-03-10T12:00:00.${String(counter % 1000).padStart(3, '0')}Z`,
    ...overrides,
  };
}
