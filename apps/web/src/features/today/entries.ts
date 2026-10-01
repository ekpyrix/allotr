import {
  money,
  type AccountView,
  type CategoryView,
  type Money,
  type TransactionView,
} from '@allotr/shared';
import { singleStyle } from '@/features/ledger/rows';
import { categoryStyles, type CategoryStyle } from '@/lib/category-style';
import { categoryTitle } from '@/lib/entry-categories';

// Today's entries as rows: what was logged today, with delete. A deleted
// entry and its undo (which carries the original's date) are left out, as
// if the entry had never been logged.

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
  /** The category's colour and icon; null for a split or none. */
  style: CategoryStyle | null;
}

// Budget switches have no amount to show or delete from here.
function shown(
  entry: TransactionView,
): entry is TransactionView & { kind: EntryKind } {
  return (
    entry.kind !== 'reversal' &&
    entry.kind !== 'budget_switch' &&
    entry.reversedById === null
  );
}

export function entryRows(
  transactions: readonly TransactionView[],
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): EntryRow[] {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const styles = categoryStyles(categories);
  return transactions.filter(shown).map((entry) => {
    const own = entry.postings.filter((p) => p.systemRole === null);
    const out = own.find((p) => p.amount.amountMinor < 0);
    const into = own.find((p) => p.amount.amountMinor > 0);
    const ordered = [out, into].filter((p) => p !== undefined);
    const category = categoryTitle(entry, categoryName);
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
      style: singleStyle(entry, styles),
    };
  });
}
