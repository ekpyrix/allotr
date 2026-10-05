import {
  compareEntries,
  type ExchangeRate,
  type Transaction,
} from '@allotr/core';
import {
  localDateIn,
  money,
  type CategoryView,
  type LedgerSettingsView,
  type LocalDate,
  type Money,
} from '@allotr/shared';
import { sql } from 'kysely';
import type { BudgetSetup } from '@allotr/core';
import type { Db } from './store.ts';
import { loadBudgetSetup } from './budgets.ts';
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

export type SystemRole =
  'expenses' | 'income' | 'opening' | 'conversion' | 'receivables' | 'payables';

export type SnapshotIou = Readonly<{
  id: string;
  direction: 'owed-to-me' | 'owed-by-me';
  person: string;
  amount: Money;
  originId: string;
  dueOn: LocalDate | null;
  settlements: readonly Readonly<{
    transactionId: string;
    kind: 'repayment' | 'write-off';
    amount: Money;
  }>[];
}>;

export type SnapshotCategory = Readonly<{
  id: string;
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  parentId: string | null;
  isPaycheck: boolean;
  colour: CategoryView['colour'];
  icon: CategoryView['icon'];
  mergedIntoId: string | null;
}>;

export type SnapshotBill = Readonly<{
  name: string;
  accountId: string;
  amount: Money;
  price: Money | null;
  categoryId: string | null;
  dueDay: number;
  active: boolean;
  payments: readonly Readonly<{
    dueOn: LocalDate;
    paidOn: LocalDate;
    transactionId: string | null;
    recorded: boolean;
  }>[];
}>;

export type SnapshotReconciliation = Readonly<{
  accountId: string;
  on: LocalDate;
  stated: Money;
  computed: Money;
  adjustmentId: string | null;
}>;

export type SnapshotPool = Readonly<{
  id: string;
  name: string;
  kind: 'spending' | 'savings';
  countsTowardDaily: boolean;
  defaultFor: 'on' | 'off' | null;
  archived: boolean;
}>;

export type SnapshotPoolMove = Readonly<{
  accountId: string;
  poolId: string;
  on: LocalDate;
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
  ious: readonly SnapshotIou[];
  /** In their order, archived ones too. */
  pools: readonly SnapshotPool[];
  /** Moves between pools, in the order they took effect. */
  poolMoves: readonly SnapshotPoolMove[];
  /** Budgets, cover order and per-entry cover as core reads them. */
  budgetSetup: BudgetSetup;
  /** Tag names by tag id, used or not. */
  tagNames: ReadonlyMap<string, string>;
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
    iouRows,
    settlementRows,
    poolRows,
    moveRows,
    budgetSetup,
    tagNameRows,
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
        'colour',
        'icon',
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
        'price_minor',
        'price_currency',
        'category_id',
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
      .select(['bill_id', 'due_on', 'paid_on', 'transaction_id', 'recorded'])
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
    db
      .selectFrom('ious')
      .select([
        'id',
        'direction',
        'person',
        'amount_minor',
        'currency',
        'origin_transaction_id',
        'due_on',
      ])
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('iou_settlements')
      .select(['iou_id', 'transaction_id', 'kind', 'amount_minor', 'currency'])
      .where('user_id', '=', userId)
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('pools')
      .select([
        'id',
        'name',
        'kind',
        'counts_toward_daily',
        'default_for',
        'archived',
      ])
      .where('user_id', '=', userId)
      .orderBy('position')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('pool_moves')
      .select(['account_id', 'pool_id', 'effective_on'])
      .where('user_id', '=', userId)
      .orderBy('effective_on')
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    loadBudgetSetup(db, userId),
    db
      .selectFrom('tags')
      .select(['id', 'name'])
      .where('user_id', '=', userId)
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
    colour: row.colour as SnapshotCategory['colour'],
    icon: row.icon as SnapshotCategory['icon'],
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

  // In the user's order within each day, so an import puts them back so.
  const entries = [...ledger].sort(compareEntries);

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
    price:
      row.price_minor === null || row.price_currency === null
        ? null
        : money(row.price_minor, row.price_currency),
    categoryId: row.category_id,
    dueDay: row.due_day,
    active: row.active === 1,
    payments: paymentRows
      .filter((p) => p.bill_id === row.id)
      .map((p) => ({
        dueOn: p.due_on as LocalDate,
        paidOn: p.paid_on as LocalDate,
        transactionId: p.transaction_id,
        recorded: p.recorded === 1,
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

  const ious = iouRows.map((row): SnapshotIou => ({
    id: row.id,
    direction: row.direction === 'owed-by-me' ? 'owed-by-me' : 'owed-to-me',
    person: row.person,
    amount: money(row.amount_minor, row.currency),
    originId: row.origin_transaction_id,
    dueOn: row.due_on === null ? null : (row.due_on as LocalDate),
    settlements: settlementRows
      .filter((s) => s.iou_id === row.id)
      .map((s) => ({
        transactionId: s.transaction_id,
        kind:
          s.kind === 'write-off'
            ? ('write-off' as const)
            : ('repayment' as const),
        amount: money(s.amount_minor, s.currency),
      })),
  }));

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
    ious,
    pools: poolRows.map((row): SnapshotPool => ({
      id: row.id,
      name: row.name,
      kind: row.kind === 'savings' ? 'savings' : 'spending',
      countsTowardDaily: row.counts_toward_daily === 1,
      defaultFor:
        row.default_for === 'on' || row.default_for === 'off'
          ? row.default_for
          : null,
      archived: row.archived === 1,
    })),
    poolMoves: moveRows.map((row) => ({
      accountId: row.account_id,
      poolId: row.pool_id,
      on: row.effective_on as LocalDate,
    })),
    budgetSetup,
    tagNames: new Map(tagNameRows.map((row) => [row.id, row.name])),
  };
}
