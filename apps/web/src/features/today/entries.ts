import {
  money,
  type AccountView,
  type CategoryView,
  type Money,
  type TransactionView,
} from '@allotr/shared';

// Today's entries as rows: what was logged today, with undo. Undos carry
// the original's date, so they are in the same list; they show as the
// original marked undone instead of rows of their own.

type HiddenKind = 'reversal' | 'budget_switch';
export type EntryKind = Exclude<TransactionView['kind'], HiddenKind>;

export interface EntryRow {
  id: string;
  kind: EntryKind;
  /** Category name, else the note, else nothing (the kind names it). */
  title: string | null;
  note: string | null;
  /** Account names: one for a spend, from and to for a transfer. */
  accounts: string[];
  /** Signed from the user's side: money out is negative. */
  amount: Money | null;
  undone: boolean;
}

// Budget switches have no amount to show or undo from here.
function shown(
  entry: TransactionView,
): entry is TransactionView & { kind: EntryKind } {
  return entry.kind !== 'reversal' && entry.kind !== 'budget_switch';
}

export function entryRows(
  transactions: readonly TransactionView[],
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): EntryRow[] {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  return transactions.filter(shown).map((entry) => {
    const own = entry.postings.filter((p) => p.systemRole === null);
    const out = own.find((p) => p.amount.amountMinor < 0);
    const into = own.find((p) => p.amount.amountMinor > 0);
    const ordered = [out, into].filter((p) => p !== undefined);
    const category =
      entry.categoryId === null
        ? undefined
        : categoryName.get(entry.categoryId);
    return {
      id: entry.id,
      kind: entry.kind,
      title: category ?? null,
      note: entry.note,
      accounts: ordered.map((p) => accountName.get(p.accountId) ?? ''),
      // A transfer moves money between the user's own accounts: show
      // what was sent, unsigned.
      amount:
        entry.kind === 'transfer'
          ? out === undefined
            ? null
            : money(-out.amount.amountMinor, out.amount.currency)
          : (ordered[0]?.amount ?? null),
      undone: entry.reversedById !== null,
    };
  });
}
