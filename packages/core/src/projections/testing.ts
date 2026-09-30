import { currencyCode, localDate, money } from '@allotr/shared';
import { expense, income, opening } from '../ledger/build.ts';
import { food, meta, salary, testChart } from '../ledger/testing.ts';
import { accountId, type Transaction } from '../ledger/types.ts';
import type { LedgerSettings, LedgerView } from './types.ts';

// Test helpers with made-up figures; not exported from the package.

export const chart = testChart();
export const card = accountId('card-USD');
export const cash = accountId('cash-USD');
export const savings = accountId('savings-USD');
export const wallet = accountId('card-EUR');
export const usd = currencyCode('USD');

export function settings(
  overrides: Partial<LedgerSettings> = {},
): LedgerSettings {
  return {
    defaultCurrency: usd,
    startedOn: localDate('2026-02-18'),
    paydayRule: 'fixed',
    paydayDay: 1,
    paydayOverride: null,
    ...overrides,
  };
}

export function view(
  ledger: readonly Transaction[],
  overrides: Partial<LedgerView> = {},
): LedgerView {
  return {
    chart,
    ledger,
    paycheckCategories: new Set([salary]),
    settings: settings(),
    bills: [],
    rates: [],
    ...overrides,
  };
}

/** A view whose user started on `startedOn`. */
export function viewFrom(
  startedOn: string,
  ledger: readonly Transaction[],
): LedgerView {
  return view(ledger, {
    settings: settings({ startedOn: localDate(startedOn) }),
  });
}

export const day = localDate;

export function openingUsd(on: string, amountMinor: number, account = card) {
  return opening(chart, meta(on), {
    accountId: account,
    amount: money(amountMinor, 'USD'),
  });
}

export function paycheck(on: string, amountMinor: number, account = card) {
  return income(chart, meta(on), {
    accountId: account,
    amount: money(amountMinor, 'USD'),
    categoryId: salary,
  });
}

export function spend(
  on: string,
  amountMinor: number,
  categoryId = food,
  account = card,
) {
  return expense(chart, meta(on), {
    accountId: account,
    amount: money(amountMinor, chart.get(account)?.currency ?? 'USD'),
    categoryId,
  });
}
