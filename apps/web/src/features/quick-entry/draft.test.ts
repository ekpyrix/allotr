import {
  formatMoney,
  money,
  parseMoney,
  type AccountView,
} from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addLine,
  amountExample,
  draftErrorText,
  endSplit,
  fieldOrder,
  keyForBody,
  MAX_SPLIT_LINES,
  removeLine,
  splitRemainder,
  startSplit,
  toBody,
  updateLine,
  type QuickEntryDraft,
} from './draft.ts';

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
  foreign: '',
  foreignCurrency: '',
  lines: [],
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

    it('sends the optional category of a transfer', () => {
      const usdPair = [...accounts, account('usd2', 'USD', 'off')];
      expect(
        toBody(transfer({ toAccountId: 'usd2', categoryId: 'fees' }), {
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
          categoryId: 'fees',
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

describe('amountExample', () => {
  it.each([
    ['USD', 'en-US', '$12.50'],
    ['JPY', 'en-US', '¥12'],
    ['BHD', 'en-US', 'BHD\u00a012.500'],
    ['EUR', 'de-DE', '12,50\u00a0€'],
  ])('shows 12.50 in %s digits for %s', (currency, locale, expected) => {
    expect(amountExample(currency, locale)).toBe(expected);
  });

  it('is always something the parser accepts', () => {
    for (const currency of ['USD', 'JPY', 'BHD', 'EUR'])
      for (const locale of ['en-US', 'de-DE', 'fr-FR', 'ja-JP'])
        expect(() =>
          parseMoney(amountExample(currency, locale), currency, locale),
        ).not.toThrow();
  });
});

describe('draftErrorText', () => {
  it('names the example in the invalid amount message', () => {
    expect(draftErrorText('quickEntry.errors.amountInvalid', '€12,50')).toBe(
      'Enter an amount, for example €12,50.',
    );
  });

  it('leaves the other messages as they are', () => {
    expect(draftErrorText('quickEntry.errors.amountRequired', '$12.50')).toBe(
      'Enter an amount.',
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

describe('splits', () => {
  const split = (
    lines: [string, string][],
    patch: Partial<QuickEntryDraft> = {},
  ) =>
    draft({
      amount: '80.00',
      categoryId: '',
      lines: lines.map(([categoryId, amount]) => ({ categoryId, amount })),
      ...patch,
    });

  it('sends lines instead of a category', () => {
    expect(
      toBody(
        split([
          ['food', '60'],
          ['fun', '20.00'],
        ]),
        ctx,
      ),
    ).toEqual({
      ok: true,
      body: {
        kind: 'expense',
        accountId: 'usd',
        amount: money(8000, 'USD'),
        lines: [
          { categoryId: 'food', amount: money(6000, 'USD') },
          { categoryId: 'fun', amount: money(2000, 'USD') },
        ],
        occurredOn: '2026-03-14',
      },
    });
  });

  it('puts lines in the foreign price currency when there is one', () => {
    const result = toBody(
      split(
        [
          ['food', '30'],
          ['fun', '15'],
        ],
        { amount: '49.20', foreign: '45', foreignCurrency: 'EUR' },
      ),
      ctx,
    );
    expect(
      result.ok && result.body.kind === 'expense' && result.body.lines,
    ).toEqual([
      { categoryId: 'food', amount: money(3000, 'EUR') },
      { categoryId: 'fun', amount: money(1500, 'EUR') },
    ]);
  });

  it('reports each line, and a sum that misses the amount', () => {
    expect(
      toBody(
        split([
          ['', '60'],
          ['fun', 'x'],
          ['fun', '5'],
        ]),
        ctx,
      ),
    ).toEqual({
      ok: false,
      errors: {
        'lines.0.categoryId': 'quickEntry.errors.categoryRequired',
        'lines.1.amount': 'quickEntry.errors.amountInvalid',
        'lines.2.categoryId': 'quickEntry.errors.categoryTwice',
      },
    });
    expect(
      toBody(
        split([
          ['food', '60'],
          ['fun', '19.99'],
        ]),
        ctx,
      ),
    ).toEqual({
      ok: false,
      errors: { lines: 'quickEntry.errors.splitMismatch' },
    });
  });

  it('shows what is left to assign', () => {
    expect(
      splitRemainder(
        split([
          ['food', '60'],
          ['fun', ''],
        ]),
        ctx,
      ),
    ).toEqual(money(2000, 'USD'));
    expect(
      splitRemainder(split([['food', '90']], { amount: '' }), ctx),
    ).toBeNull();
  });

  it('starts from the chosen category and returns to the first line', () => {
    const started = startSplit(draft({ categoryId: 'food' }));
    expect(started).toMatchObject({
      categoryId: '',
      lines: [
        { categoryId: 'food', amount: '' },
        { categoryId: '', amount: '' },
      ],
    });
    const edited = updateLine(started, 0, { categoryId: 'fun' });
    expect(endSplit(edited)).toMatchObject({ categoryId: 'fun', lines: [] });
  });

  it('keeps between two and the maximum number of lines', () => {
    const two = startSplit(draft());
    expect(removeLine(two, 0)).toBe(two);
    const three = addLine(two);
    expect(removeLine(three, 0).lines).toEqual(three.lines.slice(1));
    let full = two;
    for (let i = 0; i < MAX_SPLIT_LINES; i += 1) full = addLine(full);
    expect(full.lines).toHaveLength(MAX_SPLIT_LINES);
  });

  it('orders line fields between the category and the date', () => {
    const order = fieldOrder(startSplit(draft()));
    expect(order.slice(order.indexOf('categoryId'))).toEqual([
      'categoryId',
      'lines.0.categoryId',
      'lines.0.amount',
      'lines.1.categoryId',
      'lines.1.amount',
      'lines',
      'occurredOn',
    ]);
  });
});
