import {
  currencyCode,
  money,
  type AccountView,
  type CreateTransactionBody,
  type LocalDate,
  type Money,
  type TransactionView,
} from '@allotr/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toBody } from '@/features/quick-entry/draft';
import { draftFromEntry, isEditable } from './edit-draft.ts';

// Made-up accounts in currencies with 2, 0 and 3 decimals.
const currencies = ['USD', 'JPY', 'BHD', 'EUR'] as const;
// Two USD accounts, so same-currency transfers are covered too.
const accounts: AccountView[] = [...currencies, 'USD2'].map((name) => ({
  id: name.toLowerCase(),
  name,
  kind: 'asset',
  currency: currencyCode(name.slice(0, 3)),
  budgetGroup: 'on',
  balance: money(0, name.slice(0, 3)),
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}));

const neg = (m: Money) => money(-m.amountMinor, m.currency);
const own = (accountId: string, amount: Money) => ({
  accountId,
  systemRole: null,
  amount,
  categoryId: null,
});
const system = (
  role: 'expenses' | 'income' | 'conversion',
  amount: Money,
  categoryId: string | null = null,
) => ({
  accountId: `${role}-${amount.currency}`,
  systemRole: role,
  amount,
  categoryId,
});

// The postings core builds for a request (packages/core build.ts).
function entryFor(body: CreateTransactionBody): TransactionView {
  const base = {
    id: 't1',
    occurredOn: body.occurredOn ?? '2026-03-14',
    createdAt: '2026-03-14T10:00:00.000Z',
    source: 'api' as const,
    note: body.note ?? null,
    reversesId: null,
    reversedById: null,
    impliedRate: null,
    budgetSwitch: null,
    tagIds: body.tagIds ?? [],
  };
  if (body.kind === 'transfer') {
    const received = body.received ?? body.sent;
    const cross = received.currency !== body.sent.currency;
    return {
      ...base,
      kind: 'transfer',
      categoryId: body.categoryId ?? null,
      postings: [
        own(body.fromAccountId, neg(body.sent)),
        ...(cross
          ? [
              system('conversion', body.sent),
              system('conversion', neg(received)),
            ]
          : []),
        own(body.toAccountId, received),
      ],
    } as TransactionView;
  }
  const other = body.foreignAmount ?? body.amount;
  const conversion =
    body.foreignAmount === undefined
      ? []
      : body.kind === 'expense'
        ? [system('conversion', body.amount), system('conversion', neg(other))]
        : [system('conversion', other), system('conversion', neg(body.amount))];
  const postings =
    body.kind === 'expense'
      ? [
          own(body.accountId, neg(body.amount)),
          ...conversion,
          system('expenses', other, body.categoryId),
        ]
      : [
          system('income', neg(other), body.categoryId),
          ...conversion,
          own(body.accountId, body.amount),
        ];
  return {
    ...base,
    kind: body.kind,
    categoryId: body.categoryId,
    postings,
  } as TransactionView;
}

const amount = (currency: string) =>
  fc
    .integer({ min: 1, max: 99_999_999 })
    .map((minor) => money(minor, currency));
const currency = fc.constantFrom(...currencies);
const entryFields = fc.record(
  {
    occurredOn: fc.constantFrom<LocalDate[]>(
      '2026-01-31' as LocalDate,
      '2026-03-14' as LocalDate,
    ),
    note: fc.constantFrom('Market', 'Lunch with Alex'),
    tagIds: fc.constantFrom<string[][]>(['trip'], ['trip', 'work']),
  },
  { requiredKeys: ['occurredOn'] },
);

const spend = fc
  .tuple(
    fc.constantFrom('expense' as const, 'income' as const),
    currency,
    fc.option(currency, { nil: undefined }),
    entryFields,
  )
  .chain(([kind, own, foreign, fields]) =>
    fc
      .record({
        amount: amount(own),
        foreignAmount:
          foreign === undefined || foreign === own
            ? fc.constant(undefined)
            : amount(foreign),
      })
      .map(({ amount: value, foreignAmount }): CreateTransactionBody => {
        const common = {
          accountId: own.toLowerCase(),
          amount: value,
          categoryId: 'food',
          ...(foreignAmount === undefined ? {} : { foreignAmount }),
          ...fields,
        };
        return kind === 'expense'
          ? { kind: 'expense', ...common }
          : { kind: 'income', ...common };
      }),
  );

const accountArb = fc.constantFrom(...accounts);
const transferBody = fc
  .tuple(accountArb, accountArb, fc.boolean(), entryFields)
  .filter(([from, to]) => from.id !== to.id)
  .chain(([from, to, withCategory, fields]) =>
    fc
      .record({ sent: amount(from.currency), received: amount(to.currency) })
      .map(({ sent, received }): CreateTransactionBody => ({
        kind: 'transfer',
        fromAccountId: from.id,
        toAccountId: to.id,
        sent,
        ...(sent.currency === received.currency ? {} : { received }),
        ...(withCategory ? { categoryId: 'moves' } : {}),
        ...fields,
      })),
  );

describe('draftFromEntry', () => {
  it('rebuilds the request the entry came from, in any locale', () => {
    fc.assert(
      fc.property(
        fc.oneof(spend, transferBody),
        fc.constantFrom('en-US', 'de-DE', 'fr-FR', 'ar-EG'),
        (body, locale) => {
          const entry = entryFor(body);
          if (!isEditable(entry)) throw new Error('not editable');
          const result = toBody(draftFromEntry(entry, locale), {
            accounts,
            locale,
          });
          expect(result).toEqual({ ok: true, body });
        },
      ),
    );
  });

  it('keeps a foreign price as its own field', () => {
    const entry = entryFor({
      kind: 'expense',
      accountId: 'usd',
      amount: money(1_350, 'USD'),
      foreignAmount: money(1_240, 'EUR'),
      categoryId: 'food',
    });
    if (!isEditable(entry)) throw new Error('not editable');
    expect(draftFromEntry(entry, 'en-US')).toMatchObject({
      amount: '13.50',
      foreign: '12.40',
      foreignCurrency: 'EUR',
    });
  });

  it('only offers the kinds the form can express', () => {
    const entry = entryFor({
      kind: 'expense',
      accountId: 'usd',
      amount: money(100, 'USD'),
      categoryId: 'food',
    });
    expect(isEditable(entry)).toBe(true);
    for (const kind of ['opening', 'write_off', 'reversal', 'budget_switch'])
      expect(isEditable({ ...entry, kind } as TransactionView)).toBe(false);
  });
});
