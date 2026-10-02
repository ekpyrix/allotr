import { money, type Money } from '@allotr/shared';
import { commit, negate } from './build.ts';
import { accountIn, systemAccount, type Chart } from './chart.ts';
import { LedgerError } from './errors.ts';
import type { AccountId, CategoryId, EntryMeta, Transaction } from './types.ts';

// Entries that move money to or from a person (ADR 0024, docs/domain.md
// "IOUs"). The ledger only knows amounts: lending posts to the Receivables
// system account, borrowing to Payables, one posting per person. Who owes
// what, and the due dates, live in the `ious` rows the server keeps; the
// pure functions in projections/ious.ts read both.

export type IouDirection = 'owed-to-me' | 'owed-by-me';

function userAccountIn(chart: Chart, id: AccountId) {
  const account = accountIn(chart, id);
  if (account.systemRole !== null) {
    throw new LedgerError(
      'ledger.not_a_user_account',
      `Account ${id} is a system account.`,
    );
  }
  return account;
}

function positive(amount: Money, what: string): Money {
  if (amount.amountMinor <= 0) {
    throw new LedgerError(
      'ledger.invalid_amount',
      `The ${what} must be greater than zero.`,
    );
  }
  return amount;
}

function total(amounts: readonly Money[], what: string): Money {
  const [first] = amounts;
  if (first === undefined) {
    throw new LedgerError(
      'ledger.invalid_amount',
      `Give at least one ${what}.`,
    );
  }
  let sum = 0;
  for (const amount of amounts) {
    positive(amount, what);
    if (amount.currency !== first.currency) {
      throw new LedgerError(
        'ledger.currency_mismatch',
        `Every ${what} must be in ${first.currency}.`,
      );
    }
    sum += amount.amountMinor;
  }
  return money(sum, first.currency);
}

export type LendInput = Readonly<{
  /** The account that paid, in the currency of every amount. */
  accountId: AccountId;
  /** What each person owes: one receivable posting per person. */
  owed: readonly Money[];
  /**
   * The user's own share of a split bill: an expense in its category, so the
   * entry is one payment with the rest receivable. None for a plain loan.
   */
  own?: Readonly<{ amount: Money; categoryId: CategoryId }>;
}>;

/**
 * Money leaves a user account and people owe it back: a loan, or a bill
 * paid in full and split. The cash that is owed is neither spent nor
 * budgeted; only `own` is an expense.
 */
export function lend(
  chart: Chart,
  meta: EntryMeta,
  input: LendInput,
): Transaction {
  userAccountIn(chart, input.accountId);
  const lent = total(input.owed, 'amount owed');
  const own = input.own;
  if (own !== undefined) {
    positive(own.amount, 'share');
    if (own.amount.currency !== lent.currency) {
      throw new LedgerError(
        'ledger.currency_mismatch',
        `The share must be in ${lent.currency}.`,
      );
    }
  }
  const paid = money(
    lent.amountMinor + (own?.amount.amountMinor ?? 0),
    lent.currency,
  );
  const receivables = systemAccount(chart, 'receivables', lent.currency).id;
  return commit(chart, {
    meta,
    kind: own === undefined ? 'transfer' : 'expense',
    categoryId: own?.categoryId ?? null,
    postings: [
      { accountId: input.accountId, amount: negate(paid) },
      ...(own === undefined
        ? []
        : [
            {
              accountId: systemAccount(chart, 'expenses', lent.currency).id,
              amount: own.amount,
              categoryId: own.categoryId,
            },
          ]),
      ...input.owed.map((amount) => ({ accountId: receivables, amount })),
    ],
  });
}

export type BorrowInput = Readonly<{
  accountId: AccountId;
  /** What is owed to each person: one payable posting per person. */
  owed: readonly Money[];
}>;

/** Money arrives in a user account and is owed back. */
export function borrow(
  chart: Chart,
  meta: EntryMeta,
  input: BorrowInput,
): Transaction {
  userAccountIn(chart, input.accountId);
  const borrowed = total(input.owed, 'amount owed');
  const payables = systemAccount(chart, 'payables', borrowed.currency).id;
  return commit(chart, {
    meta,
    kind: 'transfer',
    postings: [
      { accountId: input.accountId, amount: borrowed },
      ...input.owed.map((amount) => ({
        accountId: payables,
        amount: negate(amount),
      })),
    ],
  });
}

export type RepaymentInput = Readonly<{
  accountId: AccountId;
  direction: IouDirection;
  amount: Money;
}>;

/**
 * Money changes hands to settle IOUs. Paid back to the user, it refills what
 * the loan's cover took; paid by the user, it releases the reserve.
 */
export function repayment(
  chart: Chart,
  meta: EntryMeta,
  input: RepaymentInput,
): Transaction {
  userAccountIn(chart, input.accountId);
  const amount = positive(input.amount, 'amount');
  const toMe = input.direction === 'owed-to-me';
  const system = systemAccount(
    chart,
    toMe ? 'receivables' : 'payables',
    amount.currency,
  ).id;
  return commit(chart, {
    meta,
    kind: 'transfer',
    postings: [
      { accountId: input.accountId, amount: toMe ? amount : negate(amount) },
      { accountId: system, amount: toMe ? negate(amount) : amount },
    ],
  });
}

export type IouWriteOffInput = Readonly<{
  amount: Money;
  categoryId: CategoryId;
}>;

/**
 * Gives up what a person still owes: the remainder becomes an expense in
 * `categoryId`. No cash moves, so it is not new spending against today.
 */
export function writeOffReceivable(
  chart: Chart,
  meta: EntryMeta,
  input: IouWriteOffInput,
): Transaction {
  const amount = positive(input.amount, 'amount');
  return commit(chart, {
    meta,
    kind: 'write_off',
    categoryId: input.categoryId,
    postings: [
      {
        accountId: systemAccount(chart, 'receivables', amount.currency).id,
        amount: negate(amount),
      },
      {
        accountId: systemAccount(chart, 'expenses', amount.currency).id,
        amount,
        categoryId: input.categoryId,
      },
    ],
  });
}
