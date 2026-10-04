import {
  impliedRate,
  money,
  type CurrencyCode,
  type Money,
} from '@allotr/shared';
import { accountIn, systemAccount, type Chart } from './chart.ts';
import { LedgerError } from './errors.ts';
import { budgetGroupOn } from './balances.ts';
import type {
  Account,
  AccountId,
  BudgetGroup,
  BudgetSwitch,
  CategoryId,
  EntryMeta,
  Posting,
  Transaction,
  TransactionId,
  TransactionKind,
} from './types.ts';

export type PostingDraft = Readonly<{
  accountId: AccountId;
  amount: Money;
  categoryId?: CategoryId | null;
}>;

export type TransactionDraft = Readonly<{
  meta: EntryMeta;
  kind: TransactionKind;
  postings: readonly PostingDraft[];
  categoryId?: CategoryId | null;
  reversesId?: TransactionId | null;
  impliedRate?: Transaction['impliedRate'];
  budgetSwitch?: BudgetSwitch | null;
}>;

/**
 * Checks invariants 1, 3 and 4 of docs/domain.md and returns the frozen
 * transaction. Every way of creating a transaction ends here.
 */
export function commit(chart: Chart, draft: TransactionDraft): Transaction {
  return checked(chart, draft, { allowArchived: false });
}

/**
 * Rebuilds a stored transaction with the same checks, except that its
 * accounts may have been archived since it was committed.
 */
export function restore(chart: Chart, draft: TransactionDraft): Transaction {
  return checked(chart, draft, { allowArchived: true });
}

function checked(
  chart: Chart,
  draft: TransactionDraft,
  options: { allowArchived: boolean },
): Transaction {
  if (
    (draft.kind === 'reversal') !== (draft.reversesId != null) ||
    (draft.kind === 'budget_switch') !== (draft.budgetSwitch != null)
  ) {
    throw new LedgerError(
      'ledger.invalid_transaction',
      'Only an undo references another entry, and only a budget switch changes a group.',
    );
  }

  // A budget switch only records a change of group, and so does its
  // reversal; everything else moves money between at least two accounts.
  const count = draft.postings.length;
  const countOk =
    draft.kind === 'budget_switch'
      ? count === 0
      : count >= 2 || (draft.kind === 'reversal' && count === 0);
  if (!countOk) {
    throw new LedgerError(
      'ledger.posting_count',
      draft.kind === 'budget_switch'
        ? 'A budget switch has no postings.'
        : 'A transaction needs at least two postings.',
    );
  }

  const sums = new Map<CurrencyCode, bigint>();
  const postings = draft.postings.map((draftPosting): Posting => {
    const { accountId, amount } = draftPosting;
    const account = accountIn(chart, accountId);
    if (account.archived && !options.allowArchived) {
      throw new LedgerError(
        'ledger.account_archived',
        `Account ${accountId} is archived.`,
      );
    }
    if (amount.amountMinor === 0) {
      throw new LedgerError('ledger.zero_amount', 'A posting cannot be zero.');
    }
    if (amount.currency !== account.currency) {
      throw new LedgerError(
        'ledger.currency_mismatch',
        `Account ${accountId} holds ${account.currency}, not ${amount.currency}.`,
      );
    }
    sums.set(
      amount.currency,
      (sums.get(amount.currency) ?? 0n) + BigInt(amount.amountMinor),
    );
    return Object.freeze({
      accountId,
      amount,
      categoryId: draftPosting.categoryId ?? null,
    });
  });

  for (const [currency, sum] of sums) {
    if (sum !== 0n) {
      throw new LedgerError(
        'ledger.unbalanced',
        `The postings in ${currency} do not add up to zero.`,
      );
    }
  }

  return Object.freeze({
    id: draft.meta.id,
    kind: draft.kind,
    occurredOn: draft.meta.occurredOn,
    occurredTime: draft.meta.occurredTime ?? null,
    createdAt: draft.meta.createdAt,
    sortRank: draft.meta.sortRank ?? null,
    categoryId: draft.categoryId ?? null,
    note: draft.meta.note ?? null,
    postings: Object.freeze(postings),
    reversesId: draft.reversesId ?? null,
    impliedRate: draft.impliedRate ?? null,
    budgetSwitch:
      draft.budgetSwitch == null
        ? null
        : Object.freeze({ ...draft.budgetSwitch }),
  });
}

function userAccount(chart: Chart, id: AccountId): Account {
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

export function negate(amount: Money): Money {
  return money(-amount.amountMinor, amount.currency);
}

// Equity:Conversion legs that turn `from` into `to` (ADR 0010).
function conversion(chart: Chart, from: Money, to: Money): PostingDraft[] {
  return [
    {
      accountId: systemAccount(chart, 'conversion', from.currency).id,
      amount: from,
    },
    {
      accountId: systemAccount(chart, 'conversion', to.currency).id,
      amount: negate(to),
    },
  ];
}

// The other-currency side of a purchase or income, or null when there is
// none. The same currency with another amount is a mistake, not a rate.
function foreignSide(own: Money, foreign: Money | undefined): Money | null {
  if (foreign === undefined) return null;
  if (foreign.currency !== own.currency) {
    return positive(foreign, 'foreign amount');
  }
  if (foreign.amountMinor !== own.amountMinor) {
    throw new LedgerError(
      'ledger.invalid_amount',
      `Both amounts are in ${own.currency} but differ.`,
    );
  }
  return null;
}

/** One category's share of a split expense or income (FR-L5). */
export type SplitLine = Readonly<{
  categoryId: CategoryId;
  /** In the currency of the category side: the foreign price if any. */
  amount: Money;
}>;

export type SpendInput = Readonly<
  {
    accountId: AccountId;
    /** In the account's currency. */
    amount: Money;
    /** The price in another currency when it differs from the account's. */
    foreignAmount?: Money;
  } & (
    | { categoryId: CategoryId; lines?: never }
    | { categoryId?: never; lines: readonly SplitLine[] }
  )
>;

// The category side of an expense or income: one line, or a split whose
// lines are in `total`'s currency, name distinct categories and add up to
// it exactly.
function categoryLines(input: SpendInput, total: Money): readonly SplitLine[] {
  if (input.lines === undefined) {
    return [{ categoryId: input.categoryId, amount: total }];
  }
  const { lines } = input;
  if (
    lines.length < 2 ||
    new Set(lines.map((line) => line.categoryId)).size !== lines.length
  ) {
    throw new LedgerError(
      'ledger.invalid_split',
      'A split needs at least two lines, each with its own category.',
    );
  }
  let sum = 0n;
  for (const line of lines) {
    positive(line.amount, 'split amount');
    if (line.amount.currency !== total.currency) {
      throw new LedgerError(
        'ledger.split_mismatch',
        `Split lines must be in ${total.currency}.`,
      );
    }
    sum += BigInt(line.amount.amountMinor);
  }
  if (sum !== BigInt(total.amountMinor)) {
    throw new LedgerError(
      'ledger.split_mismatch',
      'The split lines do not add up to the total.',
    );
  }
  return lines;
}

/** Money leaves a user account for one or more categories (FR-L1, FR-L5, FR-X3). */
export function expense(
  chart: Chart,
  meta: EntryMeta,
  input: SpendInput,
): Transaction {
  userAccount(chart, input.accountId);
  const amount = positive(input.amount, 'amount');
  const foreign = foreignSide(amount, input.foreignAmount);
  const spent = foreign ?? amount;
  const lines = categoryLines(input, spent);
  const expenses = systemAccount(chart, 'expenses', spent.currency).id;

  return commit(chart, {
    meta,
    kind: 'expense',
    categoryId: input.categoryId ?? null,
    impliedRate: foreign === null ? null : impliedRate(amount, spent),
    postings: [
      { accountId: input.accountId, amount: negate(amount) },
      ...(foreign === null ? [] : conversion(chart, amount, spent)),
      ...lines.map((line) => ({
        accountId: expenses,
        amount: line.amount,
        categoryId: line.categoryId,
      })),
    ],
  });
}

/** Money arrives in a user account from one or more categories. */
export function income(
  chart: Chart,
  meta: EntryMeta,
  input: SpendInput,
): Transaction {
  userAccount(chart, input.accountId);
  const amount = positive(input.amount, 'amount');
  const foreign = foreignSide(amount, input.foreignAmount);
  const earned = foreign ?? amount;
  const lines = categoryLines(input, earned);
  const incomeAccount = systemAccount(chart, 'income', earned.currency).id;

  return commit(chart, {
    meta,
    kind: 'income',
    categoryId: input.categoryId ?? null,
    impliedRate: foreign === null ? null : impliedRate(earned, amount),
    postings: [
      ...lines.map((line) => ({
        accountId: incomeAccount,
        amount: negate(line.amount),
        categoryId: line.categoryId,
      })),
      ...(foreign === null ? [] : conversion(chart, earned, amount)),
      { accountId: input.accountId, amount },
    ],
  });
}

export type TransferInput = Readonly<{
  fromId: AccountId;
  toId: AccountId;
  /** In the source account's currency. */
  sent: Money;
  /** In the target account's currency; required when it differs. */
  received?: Money;
  categoryId?: CategoryId | null;
}>;

/** Money moves between two user accounts, in one currency or across two. */
export function transfer(
  chart: Chart,
  meta: EntryMeta,
  input: TransferInput,
): Transaction {
  if (input.fromId === input.toId) {
    throw new LedgerError(
      'ledger.same_account',
      'A transfer needs two different accounts.',
    );
  }
  userAccount(chart, input.fromId);
  const target = userAccount(chart, input.toId);
  const sent = positive(input.sent, 'amount sent');
  const cross = target.currency !== sent.currency;
  if (cross && input.received === undefined) {
    throw new LedgerError(
      'ledger.invalid_amount',
      `Give the amount received in ${target.currency}.`,
    );
  }
  const received = positive(input.received ?? sent, 'amount received');

  return commit(chart, {
    meta,
    kind: 'transfer',
    categoryId: input.categoryId ?? null,
    impliedRate: cross ? impliedRate(sent, received) : null,
    postings: [
      { accountId: input.fromId, amount: negate(sent) },
      ...(cross ? conversion(chart, sent, received) : []),
      { accountId: input.toId, amount: received },
    ],
  });
}

/** A starting balance, balanced by Equity:Opening. Negative for debts. */
export function opening(
  chart: Chart,
  meta: EntryMeta,
  input: Readonly<{ accountId: AccountId; amount: Money }>,
): Transaction {
  userAccount(chart, input.accountId);
  return commit(chart, {
    meta,
    kind: 'opening',
    postings: [
      { accountId: input.accountId, amount: input.amount },
      {
        accountId: systemAccount(chart, 'opening', input.amount.currency).id,
        amount: negate(input.amount),
      },
    ],
  });
}

/** Writes a balance off to Expenses so the account can be archived. */
export function writeOff(
  chart: Chart,
  meta: EntryMeta,
  input: Readonly<{ accountId: AccountId; balance: Money }>,
): Transaction {
  userAccount(chart, input.accountId);
  return commit(chart, {
    meta,
    kind: 'write_off',
    postings: [
      { accountId: input.accountId, amount: negate(input.balance) },
      {
        accountId: systemAccount(chart, 'expenses', input.balance.currency).id,
        amount: input.balance,
      },
    ],
  });
}

/**
 * Moves an account on or off budget from `meta.occurredOn` (FR-L2). It has
 * no postings: balances stay, the group they count toward changes.
 */
export function budgetSwitch(
  chart: Chart,
  ledger: readonly Transaction[],
  meta: EntryMeta,
  input: Readonly<{ accountId: AccountId; budgetGroup: BudgetGroup }>,
  /**
   * The group the account counts toward on that date, when pools decide it
   * (docs/domain.md "Pools"); the switches in the ledger otherwise.
   */
  current: BudgetGroup | null = budgetGroupOn(
    chart,
    ledger,
    input.accountId,
    meta.occurredOn,
  ),
): Transaction {
  userAccount(chart, input.accountId);
  if (current === input.budgetGroup) {
    throw new LedgerError(
      'ledger.budget_group_unchanged',
      `The account is already ${input.budgetGroup} budget on that date.`,
    );
  }
  return commit(chart, {
    meta,
    kind: 'budget_switch',
    postings: [],
    budgetSwitch: input,
  });
}
