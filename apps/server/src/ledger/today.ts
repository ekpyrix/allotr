import {
  categoryId,
  dailyFigures,
  transactionId,
  type CategoryId,
  type LedgerView,
  type TransactionId,
} from '@allotr/core';
import { localDateIn, money, type Money, type TodayView } from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { loadBills } from './bills.ts';
import { readLedgerSettings, readLedgerStart } from './ledger-settings.ts';
import { loadRates } from './rates.ts';
import { loadChart, loadLedger, type Db } from './store.ts';

// Today's figures (FR-C4, FR-C5): everything core's projections read,
// loaded in one read transaction and computed fresh on every request, so a
// back-dated entry, a new rate or a settings change shows at once.

// A category merged into a paycheck category still marks paychecks, so
// merging never reshapes past cycles.
async function paycheckCategories(
  db: Db,
  userId: string,
): Promise<Set<CategoryId>> {
  const rows = await db
    .selectFrom('categories as c')
    .leftJoin('categories as m', (join) =>
      join
        .onRef('m.id', '=', 'c.merged_into_id')
        .onRef('m.user_id', '=', 'c.user_id'),
    )
    .select('c.id')
    .where('c.user_id', '=', userId)
    .where((eb) =>
      eb.or([eb('c.is_paycheck', '=', 1), eb('m.is_paycheck', '=', 1)]),
    )
    .execute();
  return new Set(rows.map((row) => categoryId(row.id)));
}

// The entries reconciling posted to make up a difference, which pace
// leaves out (docs/domain.md "Daily usable"). Found by the reconciliation
// that recorded them, not by category, so renaming or merging the
// Unrecorded categories changes nothing.
async function reconcileAdjustments(
  db: Db,
  userId: string,
): Promise<Set<TransactionId>> {
  const rows = await db
    .selectFrom('reconciliations')
    .select('adjustment_transaction_id as id')
    .where('user_id', '=', userId)
    .where('adjustment_transaction_id', 'is not', null)
    .execute();
  return new Set(
    rows.flatMap((row) => (row.id === null ? [] : [transactionId(row.id)])),
  );
}

/** Everything core's projections read, and the user's time zone. */
export async function loadView(
  db: Db,
  userId: string,
): Promise<{ view: LedgerView; timeZone: string }> {
  const [
    chart,
    settings,
    user,
    paychecks,
    bills,
    rates,
    importedFrom,
    adjustments,
  ] = await Promise.all([
    loadChart(db, userId),
    readLedgerSettings(db, userId),
    db
      .selectFrom('users')
      .select('created_at')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow(),
    paycheckCategories(db, userId),
    loadBills(db, userId),
    loadRates(db, userId),
    readLedgerStart(db, userId),
    reconcileAdjustments(db, userId),
  ]);
  const joinedOn = localDateIn(new Date(user.created_at), settings.timeZone);
  const view: LedgerView = {
    chart,
    ledger: await loadLedger(db, userId, chart),
    paycheckCategories: paychecks,
    settings: {
      defaultCurrency: settings.defaultCurrency,
      // The first cycle opens on the day the user joined, or with the
      // imported history (docs/domain.md "Cycles"); imported paychecks
      // before it move the start earlier still.
      startedOn:
        importedFrom !== null && importedFrom < joinedOn
          ? importedFrom
          : joinedOn,
      paydayRule: settings.paydayRule,
      paydayDay: settings.paydayDay,
      paydayOverride: settings.paydayOverride,
    },
    bills,
    rates,
    reconcileAdjustments: adjustments,
  };
  return { view, timeZone: settings.timeZone };
}

// Names and prices of the bills the figures list.
async function loadBillNames(
  db: Db,
  userId: string,
): Promise<Map<string, { name: string; price: Money | null }>> {
  const rows = await db
    .selectFrom('bills')
    .select(['id', 'name', 'price_minor', 'price_currency'])
    .where('user_id', '=', userId)
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      {
        name: row.name,
        price:
          row.price_minor === null || row.price_currency === null
            ? null
            : money(row.price_minor, row.price_currency),
      },
    ]),
  );
}

export async function todayFigures(
  db: Kysely<DB>,
  userId: string,
  now: Date,
): Promise<TodayView> {
  const { view, timeZone, billNames } = await db
    .transaction()
    .execute(async (trx) => ({
      ...(await loadView(trx, userId)),
      billNames: await loadBillNames(trx, userId),
    }));
  const figures = dailyFigures(view, now, timeZone);
  return {
    today: figures.today,
    cycle: {
      openedOn: figures.cycle.openedOn,
      openedBy: figures.cycle.openedBy,
      payday: figures.cycle.payday,
    },
    cycleEnd: figures.cycleEnd,
    overdue: figures.overdue,
    daysLeft: figures.daysLeft,
    available: figures.available,
    onBudget: figures.onBudget,
    reserved: figures.reserved,
    startOfDay: figures.startOfDay,
    spentToday: figures.spentToday,
    todayAllowance: figures.todayAllowance,
    leftToday: figures.leftToday,
    liveDaily: figures.liveDaily,
    cycleSpent: figures.cycleSpent,
    paceSpent: figures.paceSpent,
    billsDue: figures.billsDue.map((due) => ({
      billId: due.billId,
      name: billNames.get(due.billId)?.name ?? '',
      price: billNames.get(due.billId)?.price ?? null,
      dueOn: due.dueOn,
      amount: due.amount,
    })),
    cycleBills: figures.cycleBills.map((bill) => ({
      billId: bill.billId,
      dueOn: bill.dueOn,
      amount: bill.amount,
      paidOn: bill.paidOn,
    })),
    missingRates: [...figures.missingRates],
  };
}
