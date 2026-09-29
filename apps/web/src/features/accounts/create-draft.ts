import {
  currencies,
  isCurrencyCode,
  localDateSchema,
  MoneyError,
  parseMoney,
  type AccountView,
  type CreateAccountBody,
} from '@allotr/shared';
import type { MessageKey } from '@/messages/t';

// The create-account form's state and its translation into an API request
// (FR-L2). The currency is fixed once the account exists. The server still
// validates everything.

export interface AccountDraft {
  readonly name: string;
  readonly currency: string;
  readonly budgetGroup: AccountView['budgetGroup'];
  /** As typed, in `currency`; empty for none, negative for a debt. */
  readonly openingBalance: string;
  /** YYYY-MM-DD; the day the opening balance counts from. */
  readonly openedOn: string;
}

export type AccountDraftField = Exclude<keyof AccountDraft, 'budgetGroup'>;
export type AccountDraftErrorKey = Extract<
  MessageKey,
  `accounts.create.errors.${string}`
>;
export type AccountDraftErrors = Partial<
  Record<AccountDraftField, AccountDraftErrorKey>
>;

/** Fields in form order, for moving focus to the first invalid one. */
export const ACCOUNT_FIELD_ORDER: readonly AccountDraftField[] = [
  'name',
  'currency',
  'openingBalance',
  'openedOn',
];

export function newAccountDraft(
  defaultCurrency: string,
  today: string,
): AccountDraft {
  return {
    name: '',
    currency: defaultCurrency,
    budgetGroup: 'on',
    openingBalance: '',
    openedOn: today,
  };
}

/** Every currency code the server accepts, in code order. */
export const currencyCodes: readonly string[] = currencies
  .map((c) => c.code)
  .sort((a, b) => a.localeCompare(b));

export type AccountDraftResult =
  | { readonly ok: true; readonly body: CreateAccountBody }
  | { readonly ok: false; readonly errors: AccountDraftErrors };

export function toCreateBody(
  draft: AccountDraft,
  locale: string,
): AccountDraftResult {
  const errors: AccountDraftErrors = {};
  const name = draft.name.trim();
  if (name === '') errors.name = 'accounts.create.errors.nameRequired';
  else if (name.length > 100) errors.name = 'accounts.create.errors.nameLong';

  const currency = isCurrencyCode(draft.currency) ? draft.currency : undefined;
  if (currency === undefined)
    errors.currency = 'accounts.create.errors.currencyRequired';

  let openingBalance: CreateAccountBody['openingBalance'];
  if (currency !== undefined && draft.openingBalance.trim() !== '') {
    try {
      const amount = parseMoney(draft.openingBalance, currency, locale);
      if (amount.amountMinor !== 0) openingBalance = amount;
    } catch (error) {
      if (!(error instanceof MoneyError)) throw error;
      errors.openingBalance =
        error.code === 'money.too_many_decimals'
          ? 'accounts.create.errors.balanceDecimals'
          : 'accounts.create.errors.balanceInvalid';
    }
  }

  // The date only matters with a balance to date.
  const openedOn =
    openingBalance === undefined
      ? undefined
      : localDateSchema.safeParse(draft.openedOn);
  if (openedOn?.success === false)
    errors.openedOn = 'accounts.create.errors.dateInvalid';

  if (Object.keys(errors).length > 0 || currency === undefined)
    return { ok: false, errors };
  return {
    ok: true,
    body: {
      name,
      currency,
      budgetGroup: draft.budgetGroup,
      ...(openingBalance === undefined ? {} : { openingBalance }),
      ...(openedOn?.success === true ? { openedOn: openedOn.data } : {}),
    },
  };
}
