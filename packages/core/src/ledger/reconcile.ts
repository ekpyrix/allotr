import { money, type LocalDate, type Money } from '@allotr/shared';
import { balanceOf } from './balances.ts';
import { expense, income } from './build.ts';
import { accountIn, type Chart } from './chart.ts';
import { LedgerError } from './errors.ts';
import type { AccountId, CategoryId, EntryMeta, Transaction } from './types.ts';

// Reconciling an account against the bank (FR-L9, docs/domain.md
// "Policies"). The default policy offers one adjustment for the whole
// difference; M4 adds auto-adjust and flag-only.

export type Reconciliation = Readonly<{
  /** The ledger's balance at the end of the day. */
  ledger: Money;
  /** The bank's balance, in the account's sign: negative for money owed. */
  stated: Money;
  /** stated − ledger; zero when they match. */
  difference: Money;
}>;

/**
 * The balance a debt's statement stands for. Statements show what is owed
 * as a positive amount; the ledger holds it as a negative balance, so a
 * credit (overpayment) is a negative amount owed.
 */
export function balanceFromOwed(amountOwed: Money): Money {
  return money(-amountOwed.amountMinor, amountOwed.currency);
}

/** Compares the bank's balance with the ledger's at the end of `on`. */
export function reconciliation(
  chart: Chart,
  ledger: readonly Transaction[],
  input: Readonly<{ accountId: AccountId; stated: Money; on: LocalDate }>,
): Reconciliation {
  const account = accountIn(chart, input.accountId);
  if (input.stated.currency !== account.currency) {
    throw new LedgerError(
      'ledger.currency_mismatch',
      `Account ${input.accountId} holds ${account.currency}, not ${input.stated.currency}.`,
    );
  }
  const balance = balanceOf(chart, ledger, input.accountId, input.on);
  return {
    ledger: balance,
    stated: input.stated,
    difference: money(
      input.stated.amountMinor - balance.amountMinor,
      account.currency,
    ),
  };
}

/** Which kind of entry makes up a difference: the bank holds less or more. */
export function adjustmentKind(difference: Money): 'expense' | 'income' {
  if (difference.amountMinor === 0) {
    throw new LedgerError(
      'ledger.invalid_amount',
      'The balances match; there is nothing to adjust.',
    );
  }
  return difference.amountMinor < 0 ? 'expense' : 'income';
}

/**
 * The entry that brings the ledger to the bank's balance: an expense when
 * the bank holds less, an income when it holds more, filed under a
 * category of that kind. `meta.occurredOn` is the reconcile date.
 */
export function unrecordedAdjustment(
  chart: Chart,
  meta: EntryMeta,
  input: Readonly<{
    accountId: AccountId;
    difference: Money;
    categoryId: CategoryId;
  }>,
): Transaction {
  const { accountId, difference, categoryId } = input;
  const make = adjustmentKind(difference) === 'expense' ? expense : income;
  return make(chart, meta, {
    accountId,
    amount: money(Math.abs(difference.amountMinor), difference.currency),
    categoryId,
  });
}
