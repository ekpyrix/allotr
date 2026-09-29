import { localDate, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { dueThisCycle, parseBillAmount, parseRate } from './bill-draft.ts';

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
