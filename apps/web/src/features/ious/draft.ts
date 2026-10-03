import {
  isLocalDate,
  localDate,
  MoneyError,
  parseMoney,
  type CreateIouBody,
  type CreateTransactionBody,
  type IouDirectionView,
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
}

export const emptyPerson: PersonDraft = { person: '', amount: '', dueOn: '' };

export type PersonError = 'person' | 'amount';

function positive(
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
  | { ok: false; errors: Record<number, PersonError> };

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
 * A split bill from the entry sheet: the expense typed there is the user's
 * own share, and each person adds what they owe on top.
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
  return {
    ok: true,
    body: {
      direction: 'owed-to-me',
      accountId: expense.accountId,
      people: built.lines,
      ownShare: { amount: expense.amount, categoryId: expense.categoryId },
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
