import {
  formatMoneyInput,
  isLocalDate,
  localDate,
  money,
  MoneyError,
  parseMoney,
  type CreateIouBody,
  type CreateTransactionBody,
  type IouDirectionView,
  type LocalDate,
  type Money,
} from '@allotr/shared';

// Turning the IOU forms' text into API bodies. The server still validates
// everything; this only places errors next to fields. Nothing is summed:
// the account pays the shares together, and the server adds them up.

export interface PersonDraft {
  readonly person: string;
  /** As typed, in the paying account's currency. */
  readonly amount: string;
  /** YYYY-MM-DD, or empty for no due date. */
  readonly dueOn: string;
  /**
   * True once the user typed this amount. Until then it holds an even
   * share of the bill, refilled as the bill or the people change.
   */
  readonly edited?: boolean;
}

export const emptyPerson: PersonDraft = { person: '', amount: '', dueOn: '' };

export type PersonError = 'person' | 'amount';

/** The split as a whole: people owe more than the bill. */
export type TotalError = 'exceeds';

/** A positive amount as typed, or null while it does not read as one. */
export function positive(
  text: string,
  currency: string,
  locale: string,
): Money | null {
  if (text.trim() === '') return null;
  try {
    const amount = parseMoney(text, currency, locale);
    return amount.amountMinor > 0 ? amount : null;
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }
}

export type IouResult =
  | { ok: true; body: CreateIouBody }
  | {
      ok: false;
      errors: Record<number, PersonError>;
      total?: TotalError;
    };

/**
 * Each person's even share of a bill split between them and the user, in
 * minor units. Rounding down leaves the odd minor units with the user.
 */
export function evenShare(totalMinor: number, people: number): number {
  if (people <= 0 || totalMinor <= 0) return 0;
  return Math.floor(totalMinor / (people + 1));
}

/** The amount as typed, in minor units; 0 when empty or not a number. */
function typedMinor(text: string, currency: string, locale: string): number {
  return positive(text, currency, locale)?.amountMinor ?? 0;
}

/**
 * Fills the amounts the user has not typed with an even share of what the
 * typed ones leave of the bill. Nothing changes without a bill.
 */
export function fillEven(
  people: readonly PersonDraft[],
  total: Money | null,
  locale: string,
): readonly PersonDraft[] {
  if (total === null) return people;
  const typed = people
    .filter((p) => p.edited === true)
    .reduce((sum, p) => sum + typedMinor(p.amount, total.currency, locale), 0);
  const open = people.filter((p) => p.edited !== true).length;
  const share = evenShare(total.amountMinor - typed, open);
  const amount =
    share > 0 ? formatMoneyInput(money(share, total.currency), locale) : '';
  return people.map((p) => (p.edited === true ? p : { ...p, amount }));
}

/**
 * The user's own share of a bill: what is left once everyone's amount is
 * taken off. Null while the bill or any amount does not read as money.
 */
export function ownShareOf(
  total: Money | null,
  people: readonly PersonDraft[],
  locale: string,
): Money | null {
  if (total === null) return null;
  let left = total.amountMinor;
  for (const p of people) {
    const amount = positive(p.amount, total.currency, locale);
    if (amount === null) return null;
    left -= amount.amountMinor;
  }
  return money(left, total.currency);
}

function lines(
  people: readonly PersonDraft[],
  currency: string,
  locale: string,
):
  | { ok: true; lines: CreateIouBody['people'] }
  | { ok: false; errors: Record<number, PersonError> } {
  const errors: Record<number, PersonError> = {};
  const out: CreateIouBody['people'] = [];
  people.forEach((p, index) => {
    const amount = positive(p.amount, currency, locale);
    if (p.person.trim() === '') errors[index] = 'person';
    else if (amount === null) errors[index] = 'amount';
    else
      out.push({
        person: p.person.trim(),
        amount,
        ...(isLocalDate(p.dueOn) ? { dueOn: localDate(p.dueOn) } : {}),
      });
  });
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, lines: out };
}

/**
 * A split bill from the entry sheet: the expense typed there is the whole
 * bill, each person owes their amount, and the rest is the user's own
 * share. When people owe all of it, it is a loan with no expense.
 */
export function toSplitBody(
  expense: CreateTransactionBody,
  people: readonly PersonDraft[],
  locale: string,
): IouResult {
  if (expense.kind !== 'expense' || expense.categoryId === undefined)
    return { ok: false, errors: {} };
  const built = lines(people, expense.amount.currency, locale);
  if (!built.ok) return built;
  const own =
    expense.amount.amountMinor -
    built.lines.reduce((sum, p) => sum + p.amount.amountMinor, 0);
  if (own < 0) return { ok: false, errors: {}, total: 'exceeds' };
  return {
    ok: true,
    body: {
      direction: 'owed-to-me',
      accountId: expense.accountId,
      people: built.lines,
      ...(own === 0
        ? {}
        : {
            ownShare: {
              amount: money(own, expense.amount.currency),
              categoryId: expense.categoryId,
            },
          }),
      ...(expense.occurredOn === undefined
        ? {}
        : { occurredOn: expense.occurredOn }),
      ...(expense.note === undefined ? {} : { note: expense.note }),
      ...(expense.tagIds === undefined ? {} : { tagIds: expense.tagIds }),
    },
  };
}

/** Lending to, or borrowing from, one person. */
export function toLoanBody(
  direction: IouDirectionView,
  accountId: string,
  person: PersonDraft,
  currency: string,
  locale: string,
  note: string,
): IouResult {
  const built = lines([person], currency, locale);
  if (!built.ok) return built;
  return {
    ok: true,
    body: {
      direction,
      accountId,
      people: built.lines,
      ...(note.trim() === '' ? {} : { note: note.trim() }),
    },
  };
}

export type DateError = 'invalid' | 'beforeIou';

/** The entry's date, or why it cannot be one. */
export function parseEntryDate(
  value: string,
  notBefore?: LocalDate,
): { ok: true; date: LocalDate } | { ok: false; error: DateError } {
  if (!isLocalDate(value)) return { ok: false, error: 'invalid' };
  const date = localDate(value);
  if (notBefore !== undefined && date < notBefore)
    return { ok: false, error: 'beforeIou' };
  return { ok: true, date };
}
