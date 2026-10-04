import {
  currencyCode,
  localDate,
  money,
  parseRate as rate,
  type BillView,
  type ExchangeRateView,
  type TransactionView,
} from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import {
  dueThisCycle,
  lastPricedPayment,
  linkCandidates,
  paidUnit,
  parseBillAmount,
  parseRate,
  storedUnit,
} from './bill-draft.ts';

describe('parseBillAmount', () => {
  it('reads an amount in the locale', () => {
    expect(parseBillAmount('1.234,50', 'EUR', 'de-DE')).toEqual({
      ok: true,
      amount: money(123_450, 'EUR'),
    });
  });

  it('names what is wrong', () => {
    expect(parseBillAmount(' ', 'USD', 'en-US')).toEqual({
      ok: false,
      error: 'required',
    });
    expect(parseBillAmount('abc', 'USD', 'en-US')).toMatchObject({
      error: 'invalid',
    });
    expect(parseBillAmount('1.234', 'USD', 'en-US')).toMatchObject({
      error: 'decimals',
    });
    expect(parseBillAmount('0', 'USD', 'en-US')).toMatchObject({
      error: 'positive',
    });
    expect(parseBillAmount('-5', 'USD', 'en-US')).toMatchObject({
      ok: false,
    });
  });
});

describe('parseRate', () => {
  it('accepts a dot or a comma', () => {
    expect(parseRate('1.0856')).toBe('1.0856');
    expect(parseRate(' 0,92 ')).toBe('0.92');
    expect(parseRate('12')).toBe('12');
  });

  it('refuses zero, signs and text', () => {
    expect(parseRate('0')).toBeNull();
    expect(parseRate('0.000')).toBeNull();
    expect(parseRate('-1')).toBeNull();
    expect(parseRate('1e3')).toBeNull();
    expect(parseRate('')).toBeNull();
  });
});

describe('dueThisCycle', () => {
  it('keeps one bill’s due dates', () => {
    const due = (billId: string, dueOn: string) => ({
      billId,
      dueOn: localDate(dueOn),
      amount: money(100, 'USD'),
      paidOn: null,
    });
    expect(
      dueThisCycle('a', [due('a', '2026-03-05'), due('b', '2026-03-06')]),
    ).toEqual([due('a', '2026-03-05')]);
  });
});

describe('paidUnit', () => {
  it('is what one unit of the price cost', () => {
    expect(paidUnit(money(46275, 'THB'), money(1250, 'USD'))).toEqual(
      money(3702, 'THB'),
    );
    expect(paidUnit(money(1500, 'JPY'), money(1000, 'USD'))).toEqual(
      money(150, 'JPY'),
    );
    expect(paidUnit(money(3100, 'USD'), money(9500, 'KWD'))).toEqual(
      money(326, 'USD'),
    );
  });
});

describe('storedUnit', () => {
  const at = (
    base: string,
    quote: string,
    value: string,
    asOf: string,
  ): ExchangeRateView => ({
    id: `${base}${quote}${asOf}`,
    base: currencyCode(base),
    quote: currencyCode(quote),
    rate: rate(value),
    asOf: localDate(asOf),
    source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('takes the latest rate for the pair, either way round', () => {
    const rates = [
      at('USD', 'THB', '33.1', '2026-09-01'),
      at('THB', 'USD', '0.03', '2026-09-28'),
      at('USD', 'EUR', '0.9', '2026-09-30'),
    ];
    expect(storedUnit(rates, 'USD', 'THB')).toEqual({
      unit: money(3333, 'THB'),
      asOf: '2026-09-28',
    });
    expect(storedUnit(rates.slice(0, 1), 'USD', 'THB')).toEqual({
      unit: money(3310, 'THB'),
      asOf: '2026-09-01',
    });
  });

  it('is null without a rate for the pair', () => {
    expect(
      storedUnit([at('USD', 'EUR', '0.9', '2026-09-30')], 'USD', 'THB'),
    ).toBeNull();
  });
});

describe('lastPricedPayment', () => {
  const payment = (dueOn: string, paid: number | null) => ({
    dueOn: localDate(dueOn),
    paidOn: localDate(dueOn),
    transactionId: paid === null ? null : `entry-${dueOn}`,
    recorded: paid !== null,
    paid: paid === null ? null : money(paid, 'THB'),
    price: paid === null ? null : money(1250, 'USD'),
  });
  const bill = (payments: BillView['payments']): BillView => ({
    id: 'bill',
    name: 'Streaming',
    amount: money(45000, 'THB'),
    price: money(1250, 'USD'),
    reserve: money(45000, 'THB'),
    accountId: 'account',
    categoryId: null,
    dueDay: 20,
    active: true,
    payments,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  it('skips payments without an amount taken', () => {
    expect(
      lastPricedPayment(
        bill([
          payment('2026-07-20', 45510),
          payment('2026-08-20', 46275),
          payment('2026-09-20', null),
        ]),
      ),
    ).toMatchObject({ dueOn: '2026-08-20', paid: money(46275, 'THB') });
    expect(lastPricedPayment(bill([payment('2026-09-20', null)]))).toBeNull();
  });
});

describe('linkCandidates', () => {
  const entry = (
    id: string,
    postings: [string, number][],
    more: Partial<TransactionView> = {},
  ): TransactionView => ({
    id,
    kind: 'expense',
    occurredOn: localDate('2026-03-18'),
    occurredTime: null,
    createdAt: '2026-03-18T09:00:00.000Z',
    sortRank: 'V',
    source: 'api',
    categoryId: null,
    note: null,
    postings: postings.map(([accountId, minor]) => ({
      accountId,
      systemRole: null,
      amount: money(minor, 'USD'),
      categoryId: null,
    })),
    reversesId: null,
    reversedById: null,
    restoredById: null,
    impliedRate: null,
    budgetSwitch: null,
    tagIds: [],
    ...more,
  });

  it("keeps entries in effect that took money from the bill's account", () => {
    const paid = entry('paid', [
      ['cards', -30000],
      ['expenses', 30000],
    ]);
    const funded = entry('funded', [
      ['main', -30000],
      ['cards', 30000],
    ]);
    const undone = entry(
      'undone',
      [
        ['cards', -1200],
        ['expenses', 1200],
      ],
      { reversedById: 'undo' },
    );
    const undo = entry(
      'undo',
      [
        ['cards', 1200],
        ['expenses', -1200],
      ],
      { reversesId: 'undone' },
    );
    const taken = entry('taken', [
      ['cards', -500],
      ['expenses', 500],
    ]);
    expect(
      linkCandidates(
        [paid, funded, undone, undo, taken],
        'cards',
        new Set(['taken']),
      ),
    ).toEqual([{ entry: paid, took: money(30000, 'USD') }]);
  });
});
