import { currencyCode, formatMoneyInput, money } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  newReconcileDraft,
  reconcileMode,
  toReconcileCheck,
} from './reconcile-draft.ts';

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

describe('reconcileMode', () => {
  it('asks for the amount owed on a debt', () => {
    expect(
      reconcileMode({ kind: 'asset', balance: money(12_000, 'USD') }),
    ).toBe('balance');
    expect(reconcileMode({ kind: 'asset', balance: money(0, 'USD') })).toBe(
      'balance',
    );
    expect(reconcileMode({ kind: 'asset', balance: money(-1, 'USD') })).toBe(
      'owed',
    );
    expect(reconcileMode({ kind: 'liability', balance: money(0, 'USD') })).toBe(
      'owed',
    );
    expect(reconcileMode({ kind: 'payable', balance: money(500, 'USD') })).toBe(
      'owed',
    );
  });
});

describe('toReconcileCheck for a debt', () => {
  it('sends the typed amount as the amount owed', () => {
    expect(
      toReconcileCheck(
        { ...draft, balance: '210.00' },
        { currency: currencyCode('USD') },
        today,
        'en-US',
        'owed',
      ),
    ).toEqual({
      ok: true,
      check: { amountOwed: money(21_000, 'USD'), on: today },
    });
    expect(
      toReconcileCheck(
        draft,
        { currency: currencyCode('USD') },
        today,
        'en-US',
        'owed',
      ),
    ).toEqual({
      ok: false,
      errors: { balance: 'accounts.reconcileFlow.errors.owedRequired' },
    });
  });

  it('reads any amount owed as typed, in 0-, 2- and 3-digit currencies', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('JPY', 'USD', 'KWD'),
        fc.integer({ min: -1e9, max: 1e9 }),
        (currency, minor) => {
          const owed = money(minor, currency);
          const typed = `${minor < 0 ? '-' : ''}${formatMoneyInput(owed, 'en-US')}`;
          const account = { currency: currencyCode(currency) };
          const asOwed = toReconcileCheck(
            { ...draft, balance: typed },
            account,
            today,
            'en-US',
            'owed',
          );
          const asBalance = toReconcileCheck(
            { ...draft, balance: typed },
            account,
            today,
            'en-US',
          );
          expect(asOwed).toEqual({
            ok: true,
            check: { amountOwed: owed, on: today },
          });
          expect(asBalance).toEqual({
            ok: true,
            check: { balance: owed, on: today },
          });
        },
      ),
    );
  });
});
