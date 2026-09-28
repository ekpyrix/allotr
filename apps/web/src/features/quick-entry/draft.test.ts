import { formatMoney, money, type AccountView } from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { keyForBody, toBody, type QuickEntryDraft } from './draft.ts';

function account(
  id: string,
  currency: string,
  budgetGroup: 'on' | 'off' = 'on',
): AccountView {
  return {
    id,
    name: id,
    kind: 'asset',
    currency,
    budgetGroup,
    balance: money(0, currency),
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  } as AccountView;
}

const accounts = [
  account('usd', 'USD'),
  account('jpy', 'JPY'),
  account('bhd', 'BHD'),
  account('eur', 'EUR'),
];

const draft = (patch: Partial<QuickEntryDraft> = {}): QuickEntryDraft => ({
  kind: 'expense',
  amount: '12.50',
  accountId: 'usd',
  toAccountId: '',
  received: '',
  categoryId: 'food',
  tagIds: [],
  note: '',
  occurredOn: '2026-03-14',
  ...patch,
});

const ctx = { accounts, locale: 'en-US' };

describe('toBody', () => {
  it.each([
    ['usd', '12.50', 1250, 'USD'],
    ['usd', '1,234.5', 123450, 'USD'],
    ['jpy', '1,200', 1200, 'JPY'],
    ['bhd', '1.234', 1234, 'BHD'],
  ])('keeps %s %s as %i minor units', (accountId, amount, minor, currency) => {
    const result = toBody(draft({ accountId, amount }), ctx);
    expect(result).toEqual({
      ok: true,
      body: {
        kind: 'expense',
        accountId,
        amount: { amountMinor: minor, currency },
        categoryId: 'food',
        occurredOn: '2026-03-14',
      },
    });
  });

  it('reads a comma-decimal locale', () => {
    const result = toBody(draft({ accountId: 'eur', amount: '1.234,56' }), {
      accounts,
      locale: 'de-DE',
    });
    expect(result).toEqual({
      ok: true,
      body: {
        kind: 'expense',
        accountId: 'eur',
        amount: { amountMinor: 123456, currency: 'EUR' },
        categoryId: 'food',
        occurredOn: '2026-03-14',
      },
    });
  });

  it.each([
    ['usd', '1.234', 'quickEntry.errors.amountDecimals'],
    ['jpy', '12.5', 'quickEntry.errors.amountDecimals'],
    ['usd', '0', 'quickEntry.errors.amountPositive'],
    ['usd', '-4', 'quickEntry.errors.amountPositive'],
    ['usd', 'abc', 'quickEntry.errors.amountInvalid'],
    ['usd', '  ', 'quickEntry.errors.amountRequired'],
  ])('rejects %s %j', (accountId, amount, error) => {
    expect(toBody(draft({ accountId, amount }), ctx)).toEqual({
      ok: false,
      errors: { amount: error },
    });
  });

  it('requires an account and a category for spending', () => {
    expect(toBody(draft({ accountId: 'gone', categoryId: '' }), ctx)).toEqual({
      ok: false,
      errors: {
        accountId: 'quickEntry.errors.accountRequired',
        categoryId: 'quickEntry.errors.categoryRequired',
      },
    });
  });

  it('adds note and tags only when given, trimmed', () => {
    const result = toBody(
      draft({ kind: 'income', note: '  lunch  ', tagIds: ['t1'] }),
      ctx,
    );
    expect(result).toEqual({
      ok: true,
      body: {
        kind: 'income',
        accountId: 'usd',
        amount: { amountMinor: 1250, currency: 'USD' },
        categoryId: 'food',
        occurredOn: '2026-03-14',
        note: 'lunch',
        tagIds: ['t1'],
      },
    });
  });

  it('leaves the date to the server when it is empty', () => {
    expect(toBody(draft({ occurredOn: '' }), ctx)).toEqual({
      ok: true,
      body: {
        kind: 'expense',
        accountId: 'usd',
        amount: { amountMinor: 1250, currency: 'USD' },
        categoryId: 'food',
      },
    });
  });

  it('rejects a malformed date', () => {
    expect(toBody(draft({ occurredOn: '2026-02-30' }), ctx)).toEqual({
      ok: false,
      errors: { occurredOn: 'quickEntry.errors.dateInvalid' },
    });
  });

  describe('transfers', () => {
    const transfer = (patch: Partial<QuickEntryDraft>) =>
      draft({ kind: 'transfer', categoryId: '', ...patch });

    it('rejects a transfer to the same account', () => {
      expect(
        toBody(transfer({ toAccountId: 'usd', accountId: 'usd' }), ctx),
      ).toEqual({
        ok: false,
        errors: { toAccountId: 'quickEntry.errors.sameAccount' },
      });
    });

    it('sends the amount in the source currency, no category needed', () => {
      const usdPair = [...accounts, account('usd2', 'USD', 'off')];
      expect(
        toBody(transfer({ toAccountId: 'usd2' }), {
          ...ctx,
          accounts: usdPair,
        }),
      ).toEqual({
        ok: true,
        body: {
          kind: 'transfer',
          fromAccountId: 'usd',
          toAccountId: 'usd2',
          sent: { amountMinor: 1250, currency: 'USD' },
          occurredOn: '2026-03-14',
        },
      });
    });

    it('needs the received amount across currencies, in the target currency', () => {
      expect(toBody(transfer({ toAccountId: 'jpy' }), ctx)).toEqual({
        ok: false,
        errors: { received: 'quickEntry.errors.amountRequired' },
      });
      expect(
        toBody(transfer({ toAccountId: 'jpy', received: '1,850' }), ctx),
      ).toEqual({
        ok: true,
        body: {
          kind: 'transfer',
          fromAccountId: 'usd',
          toAccountId: 'jpy',
          sent: { amountMinor: 1250, currency: 'USD' },
          received: { amountMinor: 1850, currency: 'JPY' },
          occurredOn: '2026-03-14',
        },
      });
    });

    it('ignores a leftover received amount within one currency', () => {
      const usdPair = [...accounts, account('usd2', 'USD')];
      const result = toBody(transfer({ toAccountId: 'usd2', received: '9' }), {
        ...ctx,
        accounts: usdPair,
      });
      expect(result).toEqual({
        ok: true,
        body: {
          kind: 'transfer',
          fromAccountId: 'usd',
          toAccountId: 'usd2',
          sent: { amountMinor: 1250, currency: 'USD' },
          occurredOn: '2026-03-14',
        },
      });
    });

    it('requires a target account', () => {
      expect(toBody(transfer({ toAccountId: '' }), ctx)).toEqual({
        ok: false,
        errors: { toAccountId: 'quickEntry.errors.toAccountRequired' },
      });
    });
  });

  it('round-trips any formatted amount to the same minor units', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('usd', 'jpy', 'bhd'),
        fc.integer({ min: 1, max: 1_000_000_000 }),
        (accountId, minor) => {
          const currency = accounts.find((a) => a.id === accountId)?.currency;
          if (currency === undefined) throw new Error('unknown account');
          const typed = formatMoney(money(minor, currency), 'en-US');
          const result = toBody(draft({ accountId, amount: typed }), ctx);
          expect(result).toMatchObject({
            ok: true,
            body: { amount: { amountMinor: minor, currency } },
          });
        },
      ),
    );
  });
});

describe('keyForBody', () => {
  const body = (amountMinor: number) => {
    const result = toBody(draft({ amount: String(amountMinor) }), ctx);
    if (!result.ok) throw new Error('fixture must be valid');
    return result.body;
  };
  let n = 0;
  const makeKey = () => `k${String((n += 1))}`;

  it('keeps the key while the body is unchanged', () => {
    const first = keyForBody(null, body(5), makeKey);
    expect(keyForBody(first, body(5), makeKey)).toBe(first);
  });

  it('gives a changed body a new key', () => {
    const first = keyForBody(null, body(5), makeKey);
    expect(keyForBody(first, body(6), makeKey).key).not.toBe(first.key);
  });

  it('gives a new key after a save (previous cleared)', () => {
    const first = keyForBody(null, body(5), makeKey);
    expect(keyForBody(null, body(5), makeKey).key).not.toBe(first.key);
  });
});
