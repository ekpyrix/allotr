import type { ExchangeRate, Transaction } from '@allotr/core';
import {
  localDateIn,
  money,
  type LedgerSettingsView,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { sql } from 'kysely';
import type { Db } from './store.ts';
import { readLedgerSettings } from './ledger-settings.ts';
import { loadChart, loadLedger } from './store.ts';
import { loadRates } from './rates.ts';

// Everything an export writes, read once in one database transaction so
// the three formats see the same ledger. The formatters are pure functions
// of this snapshot (export-bundle.ts, export-csv.ts, export-beancount.ts).

export type SnapshotAccount = Readonly<{
  id: string;
  name: string;
  kind: 'asset' | 'liability' | 'receivable' | 'payable';
  /** The group at creation; later moves are budget-switch entries. */
  budgetGroup: 'on' | 'off';
  currency: string;
  archived: boolean;
  /** The creation day in the user's time zone. */
  createdOn: LocalDate;
}>;

export type SystemRole = 'expenses' | 'income' | 'opening' | 'conversion';

export type SnapshotCategory = Readonly<{
  id: string;
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  parentId: string | null;
  isPaycheck: boolean;
  mergedIntoId: string | null;
}>;

export type SnapshotBill = Readonly<{
  name: string;
  accountId: string;
  amount: Money;
  dueDay: number;
  active: boolean;
  payments: readonly Readonly<{
    dueOn: LocalDate;
    paidOn: LocalDate;
    transactionId: string | null;
  }>[];
}>;

export type SnapshotReconciliation = Readonly<{
  accountId: string;
  on: LocalDate;
  stated: Money;
  computed: Money;
  adjustmentId: string | null;
}>;

export type Snapshot = Readonly<{
  settings: LedgerSettingsView;
  /** User accounts, oldest first. */
  accounts: readonly SnapshotAccount[];
  /** System accounts by id. */
  systemRoles: ReadonlyMap<string, SystemRole>;
  /** Every category, merged ones too, parents before children. */
  categories: readonly SnapshotCategory[];
  /** Every entry, undos too, by date, then time of entry, then id. */
  entries: readonly Transaction[];
  /** Tag names by entry id. */
  tags: ReadonlyMap<string, readonly string[]>;
  rates: readonly ExchangeRate[];
  bills: readonly SnapshotBill[];
  reconciliations: readonly SnapshotReconciliation[];
}>;

export async function loadSnapshot(db: Db, userId: string): Promise<Snapshot> {
  const settings = await readLedgerSettings(db, userId);
  const chart = await loadChart(db, userId);
  const [
    accountRows,
    categoryRows,
    ledger,
    tagRows,
    rates,
    billRows,
    paymentRows,
    reconciliationRows,
  ] = await Promise.all([
    db
      .selectFrom('accounts')
      .select([
        'id',
        'name',
        'kind',
        'system_role',
        'budget_group',
        'currency',
        'archived',
        'created_at',
      ])
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .orderBy(sql`lower(name)`)
      .orderBy('id')
      .execute(),
    db
      .selectFrom('categories')
      .select([
        'id',
        'name',
        'kind',
        'parent_id',
        'is_paycheck',
        'merged_into_id',
        'position',
      ])
      .where('user_id', '=', userId)
      .orderBy('kind')
      .orderBy('position')
      .orderBy(sql`lower(name)`)
      .orderBy('id')
      .execute(),
    loadLedger(db, userId, chart),
    db
      .selectFrom('transaction_tags')
      .innerJoin('tags', 'tags.id', 'transaction_tags.tag_id')
      .select(['transaction_tags.transaction_id', 'tags.name'])
      .where('transaction_tags.user_id', '=', userId)
      .orderBy('tags.name')
      .execute(),
    loadRates(db, userId),
    db
      .selectFrom('bills')
      .select([
        'id',
        'name',
        'account_id',
        'amount_minor',
        'currency',
        'due_day',
        'active',
      ])
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .orderBy(sql`lower(name)`)
      .orderBy('id')
      .execute(),
    db
      .selectFrom('bill_payments')
      .select(['bill_id', 'due_on', 'paid_on', 'transaction_id'])
      .where('user_id', '=', userId)
      .orderBy('due_on')
      .execute(),
    db
      .selectFrom('reconciliations')
      .select([
        'account_id',
        'currency',
        'on_date',
        'stated_minor',
        'computed_minor',
        'adjustment_transaction_id',
      ])
      .where('user_id', '=', userId)
      .orderBy('on_date')
      .orderBy('created_at')
      .execute(),
  ]);

  const accounts: SnapshotAccount[] = [];
  const systemRoles = new Map<string, SystemRole>();
  for (const row of accountRows) {
    if (row.system_role !== null) {
      systemRoles.set(row.id, row.system_role as SystemRole);
      continue;
    }
    accounts.push({
      id: row.id,
      name: row.name,
      kind: row.kind as SnapshotAccount['kind'],
      budgetGroup: row.budget_group as 'on' | 'off',
      currency: row.currency,
      archived: row.archived === 1,
      createdOn: localDateIn(new Date(row.created_at), settings.timeZone),
    });
  }

  const categories = categoryRows.map((row): SnapshotCategory => ({
    id: row.id,
    name: row.name,
    kind: row.kind as SnapshotCategory['kind'],
    parentId: row.parent_id,
    isPaycheck: row.is_paycheck === 1,
    mergedIntoId: row.merged_into_id,
  }));
  // Parents in their order, then children in their parents' order; a
  // position counts within one parent.
  const rank = new Map(
    categoryRows
      .filter((row) => row.parent_id === null)
      .map((row, index) => [row.id, index]),
  );
  const order = (c: SnapshotCategory) =>
    c.parentId === null ? -1 : (rank.get(c.parentId) ?? rank.size);
  categories.sort((a, b) => order(a) - order(b));

  const entries = [...ledger].sort(
    (a, b) =>
      compare(a.occurredOn, b.occurredOn) ||
      compare(a.createdAt, b.createdAt) ||
      compare(a.id, b.id),
  );

  const tags = new Map<string, string[]>();
  for (const row of tagRows) {
    tags.set(row.transaction_id, [
      ...(tags.get(row.transaction_id) ?? []),
      row.name,
    ]);
  }

  const bills = billRows.map((row): SnapshotBill => ({
    name: row.name,
    accountId: row.account_id,
    amount: money(row.amount_minor, row.currency),
    dueDay: row.due_day,
    active: row.active === 1,
    payments: paymentRows
      .filter((p) => p.bill_id === row.id)
      .map((p) => ({
        dueOn: p.due_on as LocalDate,
        paidOn: p.paid_on as LocalDate,
        transactionId: p.transaction_id,
      })),
  }));

  const reconciliations = reconciliationRows.map(
    (row): SnapshotReconciliation => ({
      accountId: row.account_id,
      on: row.on_date as LocalDate,
      stated: money(row.stated_minor, row.currency),
      computed: money(row.computed_minor, row.currency),
      adjustmentId: row.adjustment_transaction_id,
    }),
  );

  return {
    settings,
    accounts,
    systemRoles,
    categories,
    entries,
    tags,
    rates,
    bills,
    reconciliations,
  };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
