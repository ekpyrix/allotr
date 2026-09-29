import { money, type AccountView } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { newAccountDraft, toCreateBody } from './create-draft.ts';
import { groupAccounts, transferTargets } from './groups.ts';

function account(
  id: string,
  currency: string,
  extra: Partial<Pick<AccountView, 'budgetGroup' | 'archived'>> = {},
): AccountView {
  return {
    id,
    name: id,
    kind: 'asset',
    currency,
    budgetGroup: 'on',
    balance: money(0, currency),
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  } as AccountView;
}

const draft = newAccountDraft('USD', '2026-03-15');

describe('toCreateBody', () => {
  it('sends only a name, currency and group without a balance', () => {
    expect(toCreateBody({ ...draft, name: '  Everyday  ' }, 'en-US')).toEqual({
      ok: true,
      body: { name: 'Everyday', currency: 'USD', budgetGroup: 'on' },
    });
  });

  it('parses the balance in the account currency and dates it', () => {
    expect(
      toCreateBody(
        {
          ...draft,
          name: 'Yen wallet',
          currency: 'JPY',
          budgetGroup: 'off',
          openingBalance: '12,000',
          openedOn: '2026-03-01',
        },
        'en-US',
      ),
    ).toEqual({
      ok: true,
      body: {
        name: 'Yen wallet',
        currency: 'JPY',
        budgetGroup: 'off',
        openingBalance: money(12_000, 'JPY'),
        openedOn: '2026-03-01',
      },
    });
  });

  it('takes a negative balance for a debt and the locale’s separators', () => {
    const result = toCreateBody(
      { ...draft, name: 'Card', currency: 'EUR', openingBalance: '-1.234,56' },
      'de-DE',
    );
    expect(result.ok && result.body.openingBalance).toEqual(
      money(-123_456, 'EUR'),
    );
  });

  it('leaves out a zero balance and its date', () => {
    expect(
      toCreateBody(
        { ...draft, name: 'Empty', openingBalance: '0', openedOn: '' },
        'en-US',
      ),
    ).toEqual({
      ok: true,
      body: { name: 'Empty', currency: 'USD', budgetGroup: 'on' },
    });
  });

  it('reports every invalid field', () => {
    expect(
      toCreateBody({ ...draft, openingBalance: '1.234' }, 'en-US'),
    ).toEqual({
      ok: false,
      errors: {
        name: 'accounts.create.errors.nameRequired',
        openingBalance: 'accounts.create.errors.balanceDecimals',
      },
    });
    expect(
      toCreateBody(
        { ...draft, name: 'x'.repeat(101), currency: 'ZZZ' },
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: {
        name: 'accounts.create.errors.nameLong',
        currency: 'accounts.create.errors.currencyRequired',
      },
    });
    expect(
      toCreateBody(
        { ...draft, name: 'A', openingBalance: 'lots', openedOn: '2026-02-30' },
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: { openingBalance: 'accounts.create.errors.balanceInvalid' },
    });
    expect(
      toCreateBody(
        { ...draft, name: 'A', openingBalance: '5', openedOn: '2026-02-30' },
        'en-US',
      ),
    ).toEqual({
      ok: false,
      errors: { openedOn: 'accounts.create.errors.dateInvalid' },
    });
  });
});

describe('groupAccounts', () => {
  it('splits open accounts by today’s group and lists archived ones apart', () => {
    const everyday = account('everyday', 'USD');
    const savings = account('savings', 'USD', { budgetGroup: 'off' });
    const closed = account('closed', 'USD', {
      budgetGroup: 'off',
      archived: true,
    });
    expect(groupAccounts([everyday, closed, savings])).toEqual({
      on: [everyday],
      off: [savings],
      archived: [closed],
    });
  });
});

describe('transferTargets', () => {
  it('offers other open accounts in the same currency, in either group', () => {
    const from = account('from', 'USD');
    const savings = account('savings', 'USD', { budgetGroup: 'off' });
    const accounts = [
      from,
      savings,
      account('euros', 'EUR'),
      account('closed', 'USD', { archived: true }),
    ];
    expect(transferTargets(from, accounts)).toEqual([savings]);
  });
});
