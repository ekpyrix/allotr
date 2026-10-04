import {
  currencyCode,
  formatMoney,
  localDateSchema,
  localTimeSchema,
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
  /**
   * Required for expenses and income unless split, optional for
   * transfers. Empty while the entry is split.
   */
  readonly categoryId: string;
  /**
   * A split across categories (FR-L5): empty, or two or more lines in the
   * category side's currency, the foreign price's if there is one.
   */
  readonly lines: readonly SplitLineDraft[];
  readonly tagIds: readonly string[];
  readonly note: string;
  /** YYYY-MM-DD; empty leaves the day to the server. */
  readonly occurredOn: string;
  /** HH:MM, when entry times are on; empty for none. */
  readonly occurredTime: string;
}

export interface SplitLineDraft {
  readonly categoryId: string;
  /** As typed, in the category side's currency. */
  readonly amount: string;
}

/** The server takes up to 20 lines. */
export const MAX_SPLIT_LINES = 20;

/** A form control's name: a draft field, or one control of a split line. */
export type DraftField =
  | Exclude<keyof QuickEntryDraft, 'lines'>
  | 'lines'
  | `lines.${number}.${keyof SplitLineDraft}`;
/** The control name of one field of a split line. */
export function lineField(
  index: number,
  key: keyof SplitLineDraft,
): DraftField {
  return `lines.${String(index)}.${key}` as DraftField;
}
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
export function fieldOrder(draft: QuickEntryDraft): DraftField[] {
  return [
    'amount',
    'accountId',
    'toAccountId',
    'received',
    'foreign',
    'categoryId',
    ...draft.lines.flatMap((_, i) => [
      lineField(i, 'categoryId'),
      lineField(i, 'amount'),
    ]),
    'lines',
    'occurredOn',
    'occurredTime',
  ];
}

export function isSplit(draft: QuickEntryDraft): boolean {
  return draft.lines.length > 0;
}

/** Splits the entry: its category becomes the first of two lines. */
export function startSplit(draft: QuickEntryDraft): QuickEntryDraft {
  return {
    ...draft,
    categoryId: '',
    lines: [
      { categoryId: draft.categoryId, amount: '' },
      { categoryId: '', amount: '' },
    ],
  };
}

/** Back to one category, the first line's. */
export function endSplit(draft: QuickEntryDraft): QuickEntryDraft {
  return { ...draft, categoryId: draft.lines[0]?.categoryId ?? '', lines: [] };
}

export function addLine(draft: QuickEntryDraft): QuickEntryDraft {
  return draft.lines.length >= MAX_SPLIT_LINES
    ? draft
    : { ...draft, lines: [...draft.lines, { categoryId: '', amount: '' }] };
}

/** A split keeps at least two lines; ending it is `endSplit`. */
export function removeLine(
  draft: QuickEntryDraft,
  index: number,
): QuickEntryDraft {
  return draft.lines.length <= 2
    ? draft
    : { ...draft, lines: draft.lines.filter((_, i) => i !== index) };
}

export function updateLine(
  draft: QuickEntryDraft,
  index: number,
  patch: Partial<SplitLineDraft>,
): QuickEntryDraft {
  return {
    ...draft,
    lines: draft.lines.map((line, i) =>
      i === index ? { ...line, ...patch } : line,
    ),
  };
}

/** The currency split lines are in: the foreign price's, else the account's. */
export function splitCurrency(
  draft: QuickEntryDraft,
  accounts: readonly AccountView[],
): string | undefined {
  return priced(draft)
    ? draft.foreignCurrency
    : accounts.find((a) => a.id === draft.accountId)?.currency;
}

// A cleared foreign price is left out, so the account's amount is the total.
function priced(draft: QuickEntryDraft): boolean {
  return draft.foreignCurrency !== '' && draft.foreign.trim() !== '';
}

/**
 * What is left to assign to the lines, or null while the total cannot be
 * read. Lines that cannot be read yet count as nothing.
 */
export function splitRemainder(
  draft: QuickEntryDraft,
  context: DraftContext,
): Money | null {
  const currency = splitCurrency(draft, context.accounts);
  if (currency === undefined) return null;
  const total = parseAmount(
    priced(draft) ? draft.foreign : draft.amount,
    currency,
    context.locale,
  );
  if (typeof total === 'string') return null;
  const assigned = draft.lines.reduce((sum, line) => {
    const amount = parseAmount(line.amount, currency, context.locale);
    return typeof amount === 'string' ? sum : sum + amount.amountMinor;
  }, 0);
  return money(total.amountMinor - assigned, currency);
}

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

  const time = localTimeSchema.safeParse(draft.occurredTime);
  if (draft.occurredTime !== '' && !time.success)
    errors.occurredTime = 'quickEntry.errors.timeInvalid';

  const note = draft.note.trim();
  const entry = {
    ...(date.success ? { occurredOn: date.data } : {}),
    ...(time.success ? { occurredTime: time.data } : {}),
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

  if (!isSplit(draft) && draft.categoryId === '')
    errors.categoryId = 'quickEntry.errors.categoryRequired';
  // Cleared, it is left out: the entry then has no foreign price.
  const foreign =
    draft.foreignCurrency === '' || draft.foreign.trim() === ''
      ? undefined
      : parseAmount(draft.foreign, draft.foreignCurrency, context.locale);
  if (typeof foreign === 'string') errors.foreign = foreign;
  const lines = splitLines(draft, account, foreign, context, errors);
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
      ...(lines === undefined ? { categoryId: draft.categoryId } : { lines }),
      ...(typeof foreign === 'object' ? { foreignAmount: foreign } : {}),
      ...entry,
    },
  };
}

// A split's lines for the request, adding any errors to `errors`. The sum
// is only checked once the total and every line can be read.
function splitLines(
  draft: QuickEntryDraft,
  account: AccountView | undefined,
  foreign: Money | DraftErrorKey | undefined,
  context: DraftContext,
  errors: DraftErrors,
): { categoryId: string; amount: Money }[] | undefined {
  if (!isSplit(draft)) return undefined;
  const currency =
    foreign === undefined ? account?.currency : draft.foreignCurrency;
  const seen = new Set<string>();
  const lines = draft.lines.map((line, i) => {
    if (line.categoryId === '')
      errors[lineField(i, 'categoryId')] = 'quickEntry.errors.categoryRequired';
    else if (seen.has(line.categoryId))
      errors[lineField(i, 'categoryId')] = 'quickEntry.errors.categoryTwice';
    seen.add(line.categoryId);
    if (currency === undefined) return undefined;
    const amount = parseAmount(line.amount, currency, context.locale);
    if (typeof amount === 'string') {
      errors[lineField(i, 'amount')] = amount;
      return undefined;
    }
    return { categoryId: line.categoryId, amount };
  });
  const remainder = splitRemainder(draft, context);
  if (
    lines.every((line) => line !== undefined) &&
    remainder !== null &&
    remainder.amountMinor !== 0
  )
    errors.lines = 'quickEntry.errors.splitMismatch';
  return lines.filter((line) => line !== undefined);
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
