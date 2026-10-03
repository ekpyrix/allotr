import {
  money,
  type AccountView,
  type CategoryView,
  type LocalDate,
  type Money,
  type TransactionView,
} from '@allotr/shared';
import { categoryStyles, type CategoryStyle } from '@/lib/category-style';
import { categoryTitle, entryCategoryIds } from '@/lib/entry-categories';

// The ledger as rows. Unlike Today, undos are rows of their own: the
// ledger shows what was recorded, and an edit is an undo plus a new entry.

export type LedgerKind = TransactionView['kind'];

export interface LedgerRow {
  id: string;
  kind: LedgerKind;
  occurredOn: LocalDate;
  /** Category name; for an undo, what the undone entry is called. */
  title: string | null;
  note: string | null;
  /** Account names, from and to for a transfer. */
  accounts: string[];
  /** Signed from the user's side; unsigned for a transfer and its undo. */
  amount: Money | null;
  /** A transfer, or the undo of one: the amount has no sign. */
  moves: boolean;
  undone: boolean;
  /** For an undo, the entry it undoes, and its kind when it is loaded. */
  reversesId: string | null;
  originalKind: LedgerKind | null;
  /** For a budget switch, where the account moved. */
  budgetGroup: 'on' | 'off' | null;
  /** The category's colour and icon; null for a split or none. */
  style: CategoryStyle | null;
}

const negate = (m: Money) => money(-m.amountMinor, m.currency);

/** Out and in on the user's own accounts, as the original entry had them. */
function sides(entry: TransactionView) {
  const flip = entry.kind === 'reversal';
  const own = entry.postings
    .filter((p) => p.systemRole === null)
    .map((p) => ({
      accountId: p.accountId,
      amount: flip ? negate(p.amount) : p.amount,
    }));
  return {
    out: own.find((p) => p.amount.amountMinor < 0),
    into: own.find((p) => p.amount.amountMinor > 0),
    count: own.length,
  };
}

/** The one category's style; a split or an entry without one has none. */
export function singleStyle(
  entry: TransactionView,
  styles: ReadonlyMap<string, CategoryStyle>,
): CategoryStyle | null {
  const [only, ...rest] = entryCategoryIds(entry);
  return only === undefined || rest.length > 0
    ? null
    : (styles.get(only) ?? null);
}

export function ledgerRows(
  transactions: readonly TransactionView[],
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): LedgerRow[] {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const styles = categoryStyles(categories);
  const name = (id: string) => accountName.get(id) ?? '';

  return transactions.map((entry) => {
    const { out, into, count } = sides(entry);
    const moves = count > 1;
    const ordered = [out, into].filter((p) => p !== undefined);
    const original =
      entry.reversesId === null ? undefined : byId.get(entry.reversesId);
    const category = categoryTitle(entry, categoryName);
    const single = ordered[0]?.amount;
    return {
      id: entry.id,
      kind: entry.kind,
      occurredOn: entry.occurredOn,
      title: category ?? original?.note ?? null,
      note: entry.note,
      accounts:
        entry.budgetSwitch === null
          ? ordered.map((p) => name(p.accountId))
          : [name(entry.budgetSwitch.accountId)],
      amount: moves
        ? out === undefined
          ? null
          : negate(out.amount)
        : single === undefined
          ? null
          : entry.kind === 'reversal'
            ? negate(single)
            : single,
      moves,
      undone: entry.reversedById !== null,
      reversesId: entry.reversesId,
      originalKind: original?.kind ?? null,
      budgetGroup: entry.budgetSwitch?.budgetGroup ?? null,
      style: singleStyle(original ?? entry, styles),
    };
  });
}

export interface LedgerDay {
  day: LocalDate;
  rows: LedgerRow[];
}

/** Rows arrive newest first; each day becomes one group. */
export function byDay(rows: readonly LedgerRow[]): LedgerDay[] {
  const days: LedgerDay[] = [];
  for (const row of rows) {
    const last = days.at(-1);
    if (last?.day === row.occurredOn) last.rows.push(row);
    else days.push({ day: row.occurredOn, rows: [row] });
  }
  return days;
}
