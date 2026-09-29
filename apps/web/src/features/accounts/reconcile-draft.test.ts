import { currencyCode, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { newReconcileDraft, toReconcileCheck } from './reconcile-draft.ts';

const today = '2026-03-15';
const draft = newReconcileDraft(today);

describe('toReconcileCheck', () => {
  it('parses the balance in the account currency and keeps the date', () => {
    expect(
      toReconcileCheck(
        { balance: '1.234,50', on: '2026-03-10' },
        { currency: currencyCode('EUR') },
        today,
        'de-DE',
      ),
    ).toEqual({
      ok: true,
      check: { balance: money(123_450, 'EUR'), on: '2026-03-10' },
    });
  });

  it('takes zero and negative balances for debts', () => {
    expect(
      toReconcileCheck(
        { ...draft, balance: '0' },
        { currency: currencyCode('USD') },
        today,
        'en-US',
      ),
    ).toMatchObject({ ok: true, check: { balance: money(0, 'USD') } });
    expect(
      toReconcileCheck(
        { ...draft, balance: '-210.00' },
        { currency: currencyCode('USD') },
        today,
        'en-US',
      ),
    ).toMatchObject({ ok: true, check: { balance: money(-21_000, 'USD') } });
  });

  it('asks for a balance and refuses extra decimals', () => {
    expect(
      toReconcileCheck(
        draft,
        { currency: currencyCode('USD') },
        today,
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: { balance: 'accounts.reconcileFlow.errors.balanceRequired' },
    });
    expect(
      toReconcileCheck(
        { ...draft, balance: '12.5' },
        { currency: currencyCode('JPY') },
        today,
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: { balance: 'accounts.reconcileFlow.errors.balanceDecimals' },
    });
  });

  it('refuses a missing or future date', () => {
    expect(
      toReconcileCheck(
        { balance: '1', on: '' },
        { currency: currencyCode('USD') },
        today,
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: { on: 'accounts.reconcileFlow.errors.dateInvalid' },
    });
    expect(
      toReconcileCheck(
        { balance: '1', on: '2026-03-16' },
        { currency: currencyCode('USD') },
        today,
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: { on: 'accounts.reconcileFlow.errors.dateFuture' },
    });
  });
});
