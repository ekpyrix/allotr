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

/**
 * The entry that brings the ledger to the bank's balance: an expense when
 * the bank holds less, an income when it holds more. `difference` is not
 * zero; `meta.occurredOn` is the reconcile date.
 */
export function unrecordedAdjustment(
  chart: Chart,
  meta: EntryMeta,
  input: Readonly<{
    accountId: AccountId;
    difference: Money;
    expenseCategoryId: CategoryId;
    incomeCategoryId: CategoryId;
  }>,
): Transaction {
  const { accountId, difference } = input;
  const amount = money(Math.abs(difference.amountMinor), difference.currency);
  return difference.amountMinor < 0
    ? expense(chart, meta, {
        accountId,
        amount,
        categoryId: input.expenseCategoryId,
      })
    : income(chart, meta, {
        accountId,
        amount,
        categoryId: input.incomeCategoryId,
      });
}
