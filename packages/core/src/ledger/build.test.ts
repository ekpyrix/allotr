import { localDate, money } from '@allotr/shared';
import { describe, expect, it } from 'vitest';
import { balanceOf, budgetGroupOn } from './balances.ts';
import {
  budgetSwitch,
  commit,
  expense,
  income,
  opening,
  restore,
  transfer,
  writeOff,
} from './build.ts';
import {
  errorCode,
  food,
  meta,
  salary,
  testChart,
  userAccount,
} from './testing.ts';
import { accountId, type Transaction } from './types.ts';

const chart = testChart([userAccount('old-USD', 'USD', 'on', true)]);
const card = accountId('card-USD');
const cash = accountId('cash-USD');
const wallet = accountId('card-EUR');
const yen = accountId('card-JPY');
const dinar = accountId('card-KWD');

function legs(transaction: Transaction) {
  return transaction.postings.map((p) => [
    p.accountId,
    p.amount.amountMinor,
    p.amount.currency,
    p.categoryId,
  ]);
}

describe('expense', () => {
  it('moves money from the account to Expenses with the category', () => {
    const t = expense(chart, meta(), {
      accountId: card,
      amount: money(1250, 'USD'),
      categoryId: food,
    });
    expect(t.kind).toBe('expense');
    expect(t.categoryId).toBe(food);
    expect(t.impliedRate).toBeNull();
    expect(legs(t)).toEqual([
      ['card-USD', -1250, 'USD', null],
      ['expenses-USD', 1250, 'USD', food],
    ]);
  });

  it('records both amounts of a foreign purchase through Equity:Conversion', () => {
    // €45 charged as $49.20 (docs/grammar.md).
    const t = expense(chart, meta(), {
      accountId: card,
      amount: money(4920, 'USD'),
      categoryId: food,
      foreignAmount: money(4500, 'EUR'),
    });
    expect(legs(t)).toEqual([
      ['card-USD', -4920, 'USD', null],
      ['conversion-USD', 4920, 'USD', null],
      ['conversion-EUR', -4500, 'EUR', null],
      ['expenses-EUR', 4500, 'EUR', food],
    ]);
    expect(t.impliedRate).toBe('0.914634146341');
  });

  it('accepts a foreign amount in the account currency only when equal', () => {
    const t = expense(chart, meta(), {
      accountId: card,
      amount: money(1250, 'USD'),
      categoryId: food,
      foreignAmount: money(1250, 'USD'),
    });
    expect(t.postings).toHaveLength(2);
    expect(
      errorCode(() =>
        expense(chart, meta(), {
          accountId: card,
          amount: money(1250, 'USD'),
          categoryId: food,
          foreignAmount: money(1300, 'USD'),
        }),
      ),
    ).toBe('ledger.invalid_amount');
  });

  it.each([0, -100])('rejects an amount of %i', (amountMinor) => {
    expect(
      errorCode(() =>
        expense(chart, meta(), {
          accountId: card,
          amount: money(amountMinor, 'USD'),
          categoryId: food,
        }),
      ),
    ).toBe('ledger.invalid_amount');
  });

  it('rejects spending from a system account or an archived account', () => {
    expect(
      errorCode(() =>
        expense(chart, meta(), {
          accountId: accountId('opening-USD'),
          amount: money(100, 'USD'),
          categoryId: food,
        }),
      ),
    ).toBe('ledger.not_a_user_account');
    expect(
      errorCode(() =>
        expense(chart, meta(), {
          accountId: accountId('old-USD'),
          amount: money(100, 'USD'),
          categoryId: food,
        }),
      ),
    ).toBe('ledger.account_archived');
  });

  it('rejects an amount in another currency than the account', () => {
    expect(
      errorCode(() =>
        expense(chart, meta(), {
          accountId: card,
          amount: money(100, 'EUR'),
          categoryId: food,
        }),
      ),
    ).toBe('ledger.currency_mismatch');
  });
});

describe('income', () => {
  it('moves money from Income into the account', () => {
    const t = income(chart, meta(), {
      accountId: yen,
      amount: money(250000, 'JPY'),
      categoryId: salary,
    });
    expect(legs(t)).toEqual([
      ['income-JPY', -250000, 'JPY', salary],
      ['card-JPY', 250000, 'JPY', null],
    ]);
  });

  it('records income paid in another currency', () => {
    const t = income(chart, meta(), {
      accountId: dinar,
      amount: money(30750, 'KWD'),
      categoryId: salary,
      foreignAmount: money(10000, 'USD'),
    });
    expect(legs(t)).toEqual([
      ['income-USD', -10000, 'USD', salary],
      ['conversion-USD', 10000, 'USD', null],
      ['conversion-KWD', -30750, 'KWD', null],
      ['card-KWD', 30750, 'KWD', null],
    ]);
    expect(t.impliedRate).toBe('0.3075');
  });
});

describe('transfer', () => {
  it('moves money between two accounts in one currency', () => {
    const t = transfer(chart, meta(), {
      fromId: card,
      toId: cash,
      sent: money(30000, 'USD'),
    });
    expect(legs(t)).toEqual([
      ['card-USD', -30000, 'USD', null],
      ['cash-USD', 30000, 'USD', null],
    ]);
  });

  it('records both amounts across currencies (docs/domain.md example)', () => {
    const t = transfer(chart, meta(), {
      fromId: card,
      toId: wallet,
      sent: money(10000, 'USD'),
      received: money(9150, 'EUR'),
    });
    expect(legs(t)).toEqual([
      ['card-USD', -10000, 'USD', null],
      ['conversion-USD', 10000, 'USD', null],
      ['conversion-EUR', -9150, 'EUR', null],
      ['card-EUR', 9150, 'EUR', null],
    ]);
    expect(t.impliedRate).toBe('0.915');
  });

  it('needs the received amount across currencies', () => {
    expect(
      errorCode(() =>
        transfer(chart, meta(), {
          fromId: card,
          toId: wallet,
          sent: money(10000, 'USD'),
        }),
      ),
    ).toBe('ledger.invalid_amount');
  });

  it('rejects a transfer to the same account', () => {
    expect(
      errorCode(() =>
        transfer(chart, meta(), {
          fromId: card,
          toId: card,
          sent: money(100, 'USD'),
        }),
      ),
    ).toBe('ledger.same_account');
  });
});

describe('opening and write-off', () => {
  it('balances an opening balance with Equity:Opening', () => {
    const t = opening(chart, meta(), {
      accountId: dinar,
      amount: money(1500, 'KWD'),
    });
    expect(legs(t)).toEqual([
      ['card-KWD', 1500, 'KWD', null],
      ['opening-KWD', -1500, 'KWD', null],
    ]);
  });

  it('writes a balance off to zero', () => {
    const open = opening(chart, meta(), {
      accountId: card,
      amount: money(4217, 'USD'),
    });
    const off = writeOff(chart, meta(), {
      accountId: card,
      balance: balanceOf(chart, [open], card),
    });
    expect(balanceOf(chart, [open, off], card)).toEqual(money(0, 'USD'));
    expect(off.kind).toBe('write_off');
  });
});

describe('commit', () => {
  const base = { meta: meta(), kind: 'transfer' as const };

  it('rejects postings that do not balance per currency', () => {
    expect(
      errorCode(() =>
        commit(chart, {
          ...base,
          postings: [
            { accountId: card, amount: money(-100, 'USD') },
            { accountId: wallet, amount: money(100, 'EUR') },
          ],
        }),
      ),
    ).toBe('ledger.unbalanced');
  });

  it('rejects fewer than two postings, zero amounts and unknown accounts', () => {
    expect(
      errorCode(() =>
        commit(chart, {
          ...base,
          postings: [{ accountId: card, amount: money(100, 'USD') }],
        }),
      ),
    ).toBe('ledger.posting_count');
    expect(
      errorCode(() =>
        commit(chart, {
          ...base,
          postings: [
            { accountId: card, amount: money(0, 'USD') },
            { accountId: cash, amount: money(0, 'USD') },
          ],
        }),
      ),
    ).toBe('ledger.zero_amount');
    expect(
      errorCode(() =>
        commit(chart, {
          ...base,
          postings: [
            { accountId: card, amount: money(-1, 'USD') },
            { accountId: accountId('nope'), amount: money(1, 'USD') },
          ],
        }),
      ),
    ).toBe('ledger.unknown_account');
  });

  it('needs a system account for every currency it balances through', () => {
    const bare = testChart().get(card);
    if (bare === undefined) throw new Error('missing test account');
    const small = new Map([[card, bare]]);
    expect(
      errorCode(() =>
        expense(small, meta(), {
          accountId: card,
          amount: money(100, 'USD'),
          categoryId: food,
        }),
      ),
    ).toBe('ledger.missing_system_account');
  });

  it('keeps the kind consistent with a reversal or budget switch', () => {
    expect(
      errorCode(() =>
        commit(chart, {
          ...base,
          kind: 'reversal',
          postings: [
            { accountId: card, amount: money(-1, 'USD') },
            { accountId: cash, amount: money(1, 'USD') },
          ],
        }),
      ),
    ).toBe('ledger.invalid_transaction');
    expect(
      errorCode(() =>
        commit(chart, {
          ...base,
          kind: 'budget_switch',
          postings: [],
        }),
      ),
    ).toBe('ledger.invalid_transaction');
  });

  it('returns a frozen transaction', () => {
    const t = transfer(chart, meta(), {
      fromId: card,
      toId: cash,
      sent: money(100, 'USD'),
    });
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.postings)).toBe(true);
    expect(t.postings.every((p) => Object.isFrozen(p))).toBe(true);
  });
});

describe('budgetSwitch', () => {
  it('moves an account to the other group from its date, without postings', () => {
    const t = budgetSwitch(chart, [], meta('2026-03-15'), {
      accountId: card,
      budgetGroup: 'off',
    });
    expect(t.postings).toEqual([]);
    expect(budgetGroupOn(chart, [t], card, localDate('2026-03-14'))).toBe('on');
    expect(budgetGroupOn(chart, [t], card, localDate('2026-03-15'))).toBe(
      'off',
    );
  });

  it('refuses a switch to the group the account is already in', () => {
    expect(
      errorCode(() =>
        budgetSwitch(chart, [], meta(), { accountId: card, budgetGroup: 'on' }),
      ),
    ).toBe('ledger.budget_group_unchanged');
  });

  it('refuses to switch a system account', () => {
    expect(
      errorCode(() =>
        budgetSwitch(chart, [], meta(), {
          accountId: accountId('expenses-USD'),
          budgetGroup: 'off',
        }),
      ),
    ).toBe('ledger.not_a_user_account');
  });
});

describe('restore', () => {
  const draft = {
    meta: meta(),
    kind: 'expense' as const,
    categoryId: food,
    postings: [
      { accountId: accountId('old-USD'), amount: money(-100, 'USD') },
      {
        accountId: accountId('expenses-USD'),
        amount: money(100, 'USD'),
        categoryId: food,
      },
    ],
  };

  it('rebuilds a stored entry on an account archived since', () => {
    expect(errorCode(() => commit(chart, draft))).toBe(
      'ledger.account_archived',
    );
    const restored = restore(chart, draft);
    expect(Object.isFrozen(restored)).toBe(true);
    expect(restored.postings).toHaveLength(2);
  });

  it('still checks that the postings balance', () => {
    const [first, second] = draft.postings;
    expect(
      errorCode(() =>
        restore(chart, {
          ...draft,
          postings: [
            first,
            second && { ...second, amount: money(99, 'USD') },
          ].filter((p) => p !== undefined),
        }),
      ),
    ).toBe('ledger.unbalanced');
  });
});
