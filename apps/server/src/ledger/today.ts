import {
  categoryId,
  dailyFigures,
  type CategoryId,
  type LedgerView,
} from '@allotr/core';
import { localDateIn, type TodayView } from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { loadBills } from './bills.ts';
import { readLedgerSettings } from './ledger-settings.ts';
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

async function loadView(
  db: Db,
  userId: string,
): Promise<{ view: LedgerView; timeZone: string }> {
  const [chart, settings, user, paychecks, bills, rates] = await Promise.all([
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
  ]);
  const view: LedgerView = {
    chart,
    ledger: await loadLedger(db, userId, chart),
    paycheckCategories: paychecks,
    settings: {
      defaultCurrency: settings.defaultCurrency,
      // The first cycle opens on the day the user joined (docs/domain.md
      // "Cycles"); imported paychecks before it move the start earlier.
      startedOn: localDateIn(new Date(user.created_at), settings.timeZone),
      paydayDay: settings.paydayDay,
      paydayOverride: settings.paydayOverride,
    },
    bills,
    rates,
  };
  return { view, timeZone: settings.timeZone };
}

async function loadBillNames(
  db: Db,
  userId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .selectFrom('bills')
    .select(['id', 'name'])
    .where('user_id', '=', userId)
    .execute();
  return new Map(rows.map((row) => [row.id, row.name]));
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
    startOfDay: figures.startOfDay,
    spentToday: figures.spentToday,
    todayAllowance: figures.todayAllowance,
    leftToday: figures.leftToday,
    liveDaily: figures.liveDaily,
    cycleSpent: figures.cycleSpent,
    billsDue: figures.billsDue.map((due) => ({
      billId: due.billId,
      name: billNames.get(due.billId) ?? '',
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
