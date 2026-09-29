import {
  currencyCode,
  formatMoney,
  localDateSchema,
  minorUnit,
  money,
  MoneyError,
  parseMoney,
  type AccountView,
  type CreateTransactionBody,
  type Money,
} from '@allotr/shared';
import { t, type MessageKey } from '@/messages/t';

// The quick entry form's state and its translation into an API request.
// The M3 grammar line fills the same draft, so nothing here knows about
// inputs or React. The server still validates everything.

export const ENTRY_KINDS = ['expense', 'income', 'transfer'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export interface QuickEntryDraft {
  readonly kind: EntryKind;
  /** As typed, in the (source) account's currency. */
  readonly amount: string;
  /** The spending or income account, or a transfer's source. */
  readonly accountId: string;
  readonly toAccountId: string;
  /** A transfer's arriving amount, needed when the currencies differ. */
  readonly received: string;
  /**
   * An expense's or income's price in another currency (FR-X3), in
   * `foreignCurrency`. Only an edit of an entry that has one sets it.
   */
  readonly foreign: string;
  /** Empty when the entry has no foreign price. */
  readonly foreignCurrency: string;
  /** Required for expenses and income, optional for transfers. */
  readonly categoryId: string;
  readonly tagIds: readonly string[];
  readonly note: string;
  /** YYYY-MM-DD; empty leaves the day to the server. */
  readonly occurredOn: string;
}

export type DraftField = keyof QuickEntryDraft;
export type DraftErrorKey = Extract<MessageKey, `quickEntry.errors.${string}`>;
export type DraftErrors = Partial<Record<DraftField, DraftErrorKey>>;

/**
 * 12.50 written in the currency's own digits and the locale's style, for
 * example "$12.50", "¥12" or "12,50 €". Built from minor units, no floats.
 */
export function amountExample(currency: string, locale: string): string {
  const digits = minorUnit(currencyCode(currency));
  const minor =
    digits === 0 ? 12 : 12 * 10 ** digits + 5 * 10 ** Math.max(digits - 1, 0);
  return formatMoney(money(minor, currency), locale);
}

/** The text for a draft error; `example` fills the invalid amount hint. */
export function draftErrorText(key: DraftErrorKey, example: string): string {
  return key === 'quickEntry.errors.amountInvalid'
    ? t(key, { example })
    : t(key);
}

/** Fields in form order, for moving focus to the first invalid one. */
export const FIELD_ORDER: readonly DraftField[] = [
  'amount',
  'accountId',
  'toAccountId',
  'received',
  'foreign',
  'categoryId',
  'occurredOn',
];

export interface DraftContext {
  readonly accounts: readonly AccountView[];
  readonly locale: string;
}

export type DraftResult =
  | { readonly ok: true; readonly body: CreateTransactionBody }
  | { readonly ok: false; readonly errors: DraftErrors };

// Positive only: core rejects zero and negative amounts because the kind
// carries the direction (docs/domain.md).
function parseAmount(
  text: string,
  currency: string,
  locale: string,
): Money | DraftErrorKey {
  if (text.trim() === '') return 'quickEntry.errors.amountRequired';
  let amount: Money;
  try {
    amount = parseMoney(text, currency, locale);
  } catch (error) {
    if (!(error instanceof MoneyError)) throw error;
    return error.code === 'money.too_many_decimals'
      ? 'quickEntry.errors.amountDecimals'
      : 'quickEntry.errors.amountInvalid';
  }
  return amount.amountMinor > 0 ? amount : 'quickEntry.errors.amountPositive';
}

export function toBody(
  draft: QuickEntryDraft,
  context: DraftContext,
): DraftResult {
  const errors: DraftErrors = {};
  const find = (id: string) => context.accounts.find((a) => a.id === id);

  const account = find(draft.accountId);
  if (account === undefined)
    errors.accountId = 'quickEntry.errors.accountRequired';
  const amount =
    account === undefined
      ? draft.amount.trim() === ''
        ? 'quickEntry.errors.amountRequired'
        : undefined
      : parseAmount(draft.amount, account.currency, context.locale);
  if (typeof amount === 'string') errors.amount = amount;

  const date = localDateSchema.safeParse(draft.occurredOn);
  if (draft.occurredOn !== '' && !date.success)
    errors.occurredOn = 'quickEntry.errors.dateInvalid';

  const note = draft.note.trim();
  const entry = {
    ...(date.success ? { occurredOn: date.data } : {}),
    ...(note === '' ? {} : { note }),
    ...(draft.tagIds.length === 0 ? {} : { tagIds: [...draft.tagIds] }),
  };

  if (draft.kind === 'transfer') {
    const target = find(draft.toAccountId);
    if (target === undefined)
      errors.toAccountId = 'quickEntry.errors.toAccountRequired';
    else if (target.id === draft.accountId)
      errors.toAccountId = 'quickEntry.errors.sameAccount';
    const received =
      account !== undefined &&
      target !== undefined &&
      target.currency !== account.currency
        ? parseAmount(draft.received, target.currency, context.locale)
        : undefined;
    if (typeof received === 'string') errors.received = received;

    if (
      Object.keys(errors).length > 0 ||
      account === undefined ||
      target === undefined ||
      typeof amount !== 'object'
    )
      return { ok: false, errors };
    return {
      ok: true,
      body: {
        kind: 'transfer',
        fromAccountId: account.id,
        toAccountId: target.id,
        sent: amount,
        ...(typeof received === 'object' ? { received } : {}),
        ...(draft.categoryId === '' ? {} : { categoryId: draft.categoryId }),
        ...entry,
      },
    };
  }

  if (draft.categoryId === '')
    errors.categoryId = 'quickEntry.errors.categoryRequired';
  // Cleared, it is left out: the entry then has no foreign price.
  const foreign =
    draft.foreignCurrency === '' || draft.foreign.trim() === ''
      ? undefined
      : parseAmount(draft.foreign, draft.foreignCurrency, context.locale);
  if (typeof foreign === 'string') errors.foreign = foreign;
  if (
    Object.keys(errors).length > 0 ||
    account === undefined ||
    typeof amount !== 'object'
  )
    return { ok: false, errors };
  return {
    ok: true,
    body: {
      kind: draft.kind,
      accountId: account.id,
      amount,
      categoryId: draft.categoryId,
      ...(typeof foreign === 'object' ? { foreignAmount: foreign } : {}),
      ...entry,
    },
  };
}

export interface DraftKey {
  readonly fingerprint: string;
  readonly key: string;
}

/**
 * The Idempotency-Key for a request body. The server answers a repeated key
 * with the entry it first created without comparing bodies, so a retry of
 * the same body keeps its key and any change gets a new one. Pass null after
 * a successful save.
 */
export function keyForBody(
  previous: DraftKey | null,
  body: CreateTransactionBody,
  makeKey: () => string,
): DraftKey {
  // Relies on toBody building bodies in a stable key order.
  const fingerprint = JSON.stringify(body);
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, key: makeKey() };
}
