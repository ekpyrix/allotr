import {
  formatMoneyInput,
  money,
  type Money,
  type TransactionView,
} from '@allotr/shared';
import type { EntryKind, QuickEntryDraft } from '@/features/quick-entry/draft';

// An existing entry as a quick entry draft, so edit uses the same form and
// the same request builder as a new entry. Only what the form can express
// is editable: expenses, income and transfers.

const editableKinds: readonly string[] = ['expense', 'income', 'transfer'];

export function isEditable(
  entry: TransactionView,
): entry is TransactionView & { kind: EntryKind } {
  return editableKinds.includes(entry.kind);
}

export function draftFromEntry(
  entry: TransactionView & { kind: EntryKind },
  locale: string,
): QuickEntryDraft {
  const own = entry.postings.filter((p) => p.systemRole === null);
  const out = own.find((p) => p.amount.amountMinor < 0);
  const into = own.find((p) => p.amount.amountMinor > 0);
  const base = {
    kind: entry.kind,
    tagIds: entry.tagIds,
    note: entry.note ?? '',
    occurredOn: entry.occurredOn,
    occurredTime: entry.occurredTime ?? '',
    categoryId: entry.categoryId ?? '',
    foreign: '',
    foreignCurrency: '',
    lines: [],
  };

  if (entry.kind === 'transfer') {
    const cross =
      out !== undefined &&
      into !== undefined &&
      out.amount.currency !== into.amount.currency;
    return {
      ...base,
      amount: out === undefined ? '' : formatMoneyInput(out.amount, locale),
      accountId: out?.accountId ?? '',
      toAccountId: into?.accountId ?? '',
      received: cross ? formatMoneyInput(into.amount, locale) : '',
    };
  }

  // The account side, and the category side on the expenses or income
  // account: in another currency when the entry recorded a foreign price.
  const account = entry.kind === 'expense' ? out : into;
  // One posting per category; more than one is a split.
  const categorySide = entry.postings.filter(
    (p) => p.systemRole === (entry.kind === 'expense' ? 'expenses' : 'income'),
  );
  // Unsigned: an income's category side is negative.
  const unsigned = (m: Money) => money(Math.abs(m.amountMinor), m.currency);
  const sideCurrency = categorySide[0]?.amount.currency;
  const foreign =
    account !== undefined &&
    sideCurrency !== undefined &&
    sideCurrency !== account.amount.currency
      ? money(
          categorySide.reduce(
            (sum, p) => sum + Math.abs(p.amount.amountMinor),
            0,
          ),
          sideCurrency,
        )
      : undefined;
  return {
    ...base,
    amount:
      account === undefined ? '' : formatMoneyInput(account.amount, locale),
    accountId: account?.accountId ?? '',
    toAccountId: '',
    received: '',
    ...(categorySide.length > 1
      ? {
          categoryId: '',
          lines: categorySide.map((p) => ({
            categoryId: p.categoryId ?? '',
            amount: formatMoneyInput(unsigned(p.amount), locale),
          })),
        }
      : {}),
    ...(foreign === undefined
      ? {}
      : {
          foreign: formatMoneyInput(foreign, locale),
          foreignCurrency: foreign.currency,
        }),
  };
}
