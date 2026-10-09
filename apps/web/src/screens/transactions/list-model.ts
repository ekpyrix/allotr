import type {
  AccountView,
  CategoryView,
  Money,
  TransactionListView,
  TransactionView,
} from '@allotr/shared';
import { formatLongDay, rowTitle } from '@/features/ledger/format';
import { ledgerRows, type LedgerKind } from '@/features/ledger/rows';
import { entryCategoryIds } from '@/lib/entry-categories';
import { type CategoryStyle } from '@/lib/category-style';
import { formatMoney, formatSigned } from '@/lib/format-money';
import { t } from '@/messages/t';
import type { Group } from './search-params.ts';

type EntryTotals = TransactionListView['totals'];

// The Transactions list as sections of rows. Every figure comes from the
// server (`totals`, `groups`, `dayTotals`); this file only orders, labels
// and formats them.

export interface TxRow {
  id: string;
  kind: LedgerKind;
  /** `HH:MM`, or null when the entry has no time of day. */
  time: string | null;
  payee: string;
  /** `Parent › Category`, "Split: …", or null. */
  category: string | null;
  /** One account, or `from → to` for a transfer. */
  account: string;
  /** Signed from the user's side; unsigned for a transfer. */
  amount: Money | null;
  moves: boolean;
  /** Deleted and shown anyway, or an undo. */
  undo: boolean;
  style: CategoryStyle | null;
}

export interface TxSection {
  key: string;
  /** Null for an ungrouped list: no header row. */
  title: string | null;
  /** The group's figure, formatted by the server's own numbers. */
  total: string | null;
  rows: TxRow[];
}

/** `Parent › Category` for one category; a split lists its names. */
export function entryCategoryLabel(
  entry: TransactionView,
  categories: readonly CategoryView[],
): string | null {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const labels = entryCategoryIds(entry).flatMap((id) => {
    const category = byId.get(id);
    if (category === undefined) return [];
    const parent =
      category.parentId === null ? undefined : byId.get(category.parentId);
    return [
      parent === undefined
        ? category.name
        : `${parent.name} › ${category.name}`,
    ];
  });
  if (labels.length <= 1) return labels[0] ?? null;
  return t('entries.split', { names: labels.join(', ') });
}

export function txRows(
  transactions: readonly TransactionView[],
  accounts: readonly AccountView[],
  categories: readonly CategoryView[],
): TxRow[] {
  const byId = new Map(transactions.map((e) => [e.id, e]));
  return ledgerRows(transactions, accounts, categories).map((row, index) => {
    const entry = transactions[index];
    const source =
      entry === undefined
        ? undefined
        : entry.reversesId === null
          ? entry
          : (byId.get(entry.reversesId) ?? entry);
    return {
      id: row.id,
      kind: row.kind,
      time: entry?.occurredTime?.slice(0, 5) ?? null,
      payee:
        row.kind === 'reversal' ? rowTitle(row) : (row.note ?? rowTitle(row)),
      category:
        source === undefined ? null : entryCategoryLabel(source, categories),
      account: row.accounts.join(' → '),
      amount: row.amount,
      moves: row.moves,
      undo: row.kind === 'reversal',
      style: row.style,
    };
  });
}

/** `spent $12.00 · income $3.00`, one block per currency, from the server. */
export function totalsParts(totals: EntryTotals): string[] {
  const blocks = totals.byCurrency;
  return blocks.flatMap((block) => {
    const parts: string[] = [];
    if (block.spent.amountMinor !== 0) {
      parts.push(
        t('transactions.list.spent', { amount: formatMoney(block.spent) }),
      );
    }
    if (block.income.amountMinor !== 0) {
      parts.push(
        t('transactions.list.income', { amount: formatMoney(block.income) }),
      );
    }
    if (blocks.length > 0 && parts.length === 2) {
      parts.push(
        t('transactions.list.net', { amount: formatSigned(block.net) }),
      );
    }
    return parts;
  });
}

export function summaryParts(totals: EntryTotals): string[] {
  return [
    t('transactions.list.count', { count: totals.count }),
    ...totalsParts(totals),
  ];
}

const UNCATEGORISED = '__none__';

function categoryKey(entry: TransactionView | undefined): string {
  return entry === undefined
    ? UNCATEGORISED
    : (entryCategoryIds(entry)[0] ?? UNCATEGORISED);
}

/** A category group's own figure: what was spent, else what came in. */
export function groupTotal(totals: EntryTotals): string | null {
  const spent = totals.byCurrency
    .filter((b) => b.spent.amountMinor !== 0)
    .map((b) => formatMoney(b.spent));
  if (spent.length > 0) return spent.join(' · ');
  const income = totals.byCurrency
    .filter((b) => b.income.amountMinor !== 0)
    .map((b) => formatMoney(b.income));
  return income.length > 0 ? income.join(' · ') : null;
}

export function sections(input: {
  transactions: readonly TransactionView[];
  accounts: readonly AccountView[];
  categories: readonly CategoryView[];
  group: Group;
  /** The first page's figures; they cover every matching entry. */
  groups: TransactionListView['groups'];
  /** Every loaded page's day nets. */
  dayTotals: TransactionListView['dayTotals'];
  locale: string;
}): TxSection[] {
  const { transactions, accounts, categories, group, locale } = input;
  const rows = txRows(transactions, accounts, categories);
  if (group === 'none') {
    return [{ key: 'all', title: null, total: null, rows }];
  }
  if (group === 'day') {
    const net = new Map(input.dayTotals.map((d) => [d.date as string, d.net]));
    const days: TxSection[] = [];
    rows.forEach((row, index) => {
      const day = transactions[index]?.occurredOn ?? '';
      const last = days.at(-1);
      if (last?.key === day) {
        last.rows.push(row);
        return;
      }
      const dayNet = net.get(day);
      days.push({
        key: day,
        title: formatLongDay(day as never, locale),
        total: dayNet === undefined ? null : formatSigned(dayNet),
        rows: [row],
      });
    });
    return days;
  }
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map(input.groups.map((g) => [g.key ?? UNCATEGORISED, g]));
  const found = new Map<string, TxSection>();
  rows.forEach((row, index) => {
    const key = categoryKey(transactions[index]);
    let section = found.get(key);
    if (section === undefined) {
      const category = byId.get(key);
      const parent =
        category?.parentId == null ? undefined : byId.get(category.parentId);
      const server = totals.get(key);
      section = {
        key,
        title:
          category === undefined
            ? t('transactions.list.uncategorised')
            : parent === undefined
              ? category.name
              : `${parent.name} › ${category.name}`,
        total: server === undefined ? null : groupTotal(server),
        rows: [],
      };
      found.set(key, section);
    }
    section.rows.push(row);
  });
  return [...found.values()].sort((a, b) => {
    if (a.key === UNCATEGORISED) return 1;
    if (b.key === UNCATEGORISED) return -1;
    return (a.title ?? '').localeCompare(b.title ?? '');
  });
}
