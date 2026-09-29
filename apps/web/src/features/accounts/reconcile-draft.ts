import {
  localDateSchema,
  MoneyError,
  parseMoney,
  type AccountView,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import type { MessageKey } from '@/messages/t';

// The reconcile form's state and its translation into a request (FR-L9).
// The server compares and posts; nothing here adds money up.

export interface ReconcileDraft {
  /**
   * As typed, in the account's currency: the balance, or for a debt the
   * amount owed as the statement shows it (see `reconcileMode`).
   */
  readonly balance: string;
  /** YYYY-MM-DD, today or earlier. */
  readonly on: string;
}

export type ReconcileDraftField = keyof ReconcileDraft;
export type ReconcileDraftErrors = Partial<
  Record<
    ReconcileDraftField,
    Extract<MessageKey, `accounts.reconcileFlow.errors.${string}`>
  >
>;

/** What the form asks for: the balance, or for a debt the amount owed. */
export type ReconcileMode = 'balance' | 'owed';

export type ReconcileCheck = Readonly<
  ({ balance: Money } | { amountOwed: Money }) & { on: LocalDate }
>;

/**
 * Statements show a debt as a positive amount owed, so the form asks for
 * that when the account holds a debt: a liability or payable, or any
 * account whose balance is below zero. The server stores its negative.
 */
export function reconcileMode(
  account: Pick<AccountView, 'kind' | 'balance'>,
): ReconcileMode {
  return account.kind === 'liability' ||
    account.kind === 'payable' ||
    account.balance.amountMinor < 0
    ? 'owed'
    : 'balance';
}

export function newReconcileDraft(today: string): ReconcileDraft {
  return { balance: '', on: today };
}

export function toReconcileCheck(
  draft: ReconcileDraft,
  account: Pick<AccountView, 'currency'>,
  today: string,
  locale: string,
  mode: ReconcileMode = 'balance',
):
  | { ok: true; check: ReconcileCheck }
  | { ok: false; errors: ReconcileDraftErrors } {
  const errors: ReconcileDraftErrors = {};
  let balance: Money | undefined;
  if (draft.balance.trim() === '') {
    errors.balance =
      mode === 'owed'
        ? 'accounts.reconcileFlow.errors.owedRequired'
        : 'accounts.reconcileFlow.errors.balanceRequired';
  } else {
    try {
      balance = parseMoney(draft.balance, account.currency, locale);
    } catch (error) {
      if (!(error instanceof MoneyError)) throw error;
      errors.balance =
        error.code === 'money.too_many_decimals'
          ? 'accounts.reconcileFlow.errors.balanceDecimals'
          : 'accounts.reconcileFlow.errors.balanceInvalid';
    }
  }
  const on = localDateSchema.safeParse(draft.on);
  if (!on.success) errors.on = 'accounts.reconcileFlow.errors.dateInvalid';
  else if (on.data > today)
    errors.on = 'accounts.reconcileFlow.errors.dateFuture';

  if (balance === undefined || !on.success || errors.on !== undefined)
    return { ok: false, errors };
  return {
    ok: true,
    check:
      mode === 'owed'
        ? { amountOwed: balance, on: on.data }
        : { balance, on: on.data },
  };
}
