import { formatMoneyInput, type TransactionView } from '@allotr/shared';
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
    categoryId: entry.categoryId ?? '',
    foreign: '',
    foreignCurrency: '',
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
  const priced = entry.postings.find(
    (p) => p.systemRole === (entry.kind === 'expense' ? 'expenses' : 'income'),
  );
  const foreign =
    account !== undefined &&
    priced !== undefined &&
    priced.amount.currency !== account.amount.currency
      ? priced.amount
      : undefined;
  return {
    ...base,
    amount:
      account === undefined ? '' : formatMoneyInput(account.amount, locale),
    accountId: account?.accountId ?? '',
    toAccountId: '',
    received: '',
    ...(foreign === undefined
      ? {}
      : {
          foreign: formatMoneyInput(foreign, locale),
          foreignCurrency: foreign.currency,
        }),
  };
}
