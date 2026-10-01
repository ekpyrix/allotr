import {
  convert,
  convertInverse,
  currencyCode,
  impliedRate,
  minorUnit,
  money,
  MoneyError,
  parseMoney,
  type BillView,
  type ExchangeRateView,
  type LocalDate,
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

// One whole unit of a currency: $1.00 is 100 minor units, ¥1 is 1.
function oneOf(currency: string): Money {
  const code = currencyCode(currency);
  return money(10 ** minorUnit(code), code);
}

/** What one unit of the price's currency cost in a payment: paid ÷ price. */
export function paidUnit(paid: Money, price: Money): Money {
  return convert(
    oneOf(price.currency),
    impliedRate(price, paid),
    paid.currency,
  );
}

/**
 * The latest stored rate between two currencies, quoted either way round,
 * as what one unit of `from` buys in `to`; null without one.
 */
export function storedUnit(
  rates: readonly ExchangeRateView[],
  from: string,
  to: string,
): { unit: Money; asOf: LocalDate } | null {
  let latest: ExchangeRateView | undefined;
  for (const rate of rates) {
    const pair =
      (rate.base === from && rate.quote === to) ||
      (rate.base === to && rate.quote === from);
    if (pair && (latest === undefined || rate.asOf > latest.asOf)) {
      latest = rate;
    }
  }
  if (latest === undefined) return null;
  const unit =
    latest.base === from
      ? convert(oneOf(from), latest.rate, to)
      : convertInverse(oneOf(from), latest.rate, to);
  return { unit, asOf: latest.asOf };
}

export type BillPayment = BillView['payments'][number];

/** The latest payment that recorded both what it took and its price. */
export function lastPricedPayment(
  bill: BillView,
): (BillPayment & { paid: Money; price: Money }) | null {
  for (const payment of [...bill.payments].reverse()) {
    const { paid, price } = payment;
    if (paid !== null && price !== null) return { ...payment, paid, price };
  }
  return null;
}
