import {
  MoneyError,
  parseMoney,
  type Money,
  type TodayView,
} from '@allotr/shared';

// Turning the bill and rate forms' text into API values. The server still
// validates everything; this only gives errors next to the field.

export type AmountError = 'required' | 'invalid' | 'decimals' | 'positive';

export function parseBillAmount(
  text: string,
  currency: string,
  locale: string,
): { ok: true; amount: Money } | { ok: false; error: AmountError } {
  if (text.trim() === '') return { ok: false, error: 'required' };
  try {
    const amount = parseMoney(text, currency, locale);
    return amount.amountMinor > 0
      ? { ok: true, amount }
      : { ok: false, error: 'positive' };
  } catch (error) {
    if (!(error instanceof MoneyError)) throw error;
    return {
      ok: false,
      error: error.code === 'money.too_many_decimals' ? 'decimals' : 'invalid',
    };
  }
}

/** "1,0856" or "1.0856" as the API's decimal string, or null. */
export function parseRate(text: string): string | null {
  const rate = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(rate)) return null;
  return /[1-9]/.test(rate) ? rate : null;
}

export type CycleBill = TodayView['cycleBills'][number];

/** A bill's due dates in the current cycle, earliest first. */
export function dueThisCycle(
  billId: string,
  cycleBills: readonly CycleBill[],
): CycleBill[] {
  return cycleBills.filter((bill) => bill.billId === billId);
}
