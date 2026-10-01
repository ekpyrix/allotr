import {
  categoryId,
  cycleDays,
  cycleReports,
  cyclesOf,
  rankTotals,
  type CategoryId,
  type CycleReport,
  type LedgerView,
} from '@allotr/core';
import {
  localDateIn,
  type CycleDayListView,
  type CycleDetailView,
  type CycleListView,
  type CycleSummaryView,
  type LocalDate,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import type { Db } from './store.ts';
import { loadView } from './today.ts';

// The cycle and history views (FR-W2): every cycle's snapshot, computed
// from the ledger on each read like today's figures (FR-C1, FR-C6).

/** Spending categories a chart shows before folding the rest into one. */
const TOP_CATEGORIES = 6;

/** Each merged category and the live category it ended up in. */
export async function mergeTargets(
  db: Db,
  userId: string,
): Promise<Map<CategoryId, CategoryId>> {
  const rows = await db
    .selectFrom('categories')
    .select(['id', 'merged_into_id'])
    .where('user_id', '=', userId)
    .where('merged_into_id', 'is not', null)
    .execute();
  const next = new Map(rows.map((row) => [row.id, row.merged_into_id]));
  const targets = new Map<CategoryId, CategoryId>();
  for (const { id } of rows) {
    let target = id;
    // Follows a chain of merges; a merge never points back, but the bound
    // keeps a broken row from looping.
    for (let hops = 0; hops <= rows.length; hops += 1) {
      const into = next.get(target);
      if (into === undefined || into === null) break;
      target = into;
    }
    targets.set(categoryId(id), categoryId(target));
  }
  return targets;
}

async function reportsFor(
  db: Kysely<DB>,
  userId: string,
  now: Date,
  openedOn?: LocalDate,
): Promise<{ view: LedgerView; reports: CycleReport[] }> {
  const { view, timeZone, merged } = await db
    .transaction()
    .execute(async (trx) => ({
      ...(await loadView(trx, userId)),
      merged: await mergeTargets(trx, userId),
    }));
  const today = localDateIn(now, timeZone);
  return { view, reports: cycleReports(view, today, merged, openedOn) };
}

function summary(report: CycleReport): CycleSummaryView {
  const { cycle } = report;
  return {
    openedOn: cycle.openedOn,
    openedBy: cycle.openedBy,
    closedOn: cycle.closedOn,
    lastDay: report.lastDay,
    payday: cycle.payday,
    income: report.income,
    spending: report.spending,
    leftover: report.leftover,
    savingsNetChange: report.savingsNetChange,
    offBudgetClosing: report.closing.off,
    amended: report.amendments.length > 0,
    missingRates: [...report.missingRates],
  };
}

export async function listCycles(
  db: Kysely<DB>,
  userId: string,
  now: Date,
): Promise<CycleListView> {
  const { reports } = await reportsFor(db, userId, now);
  return { cycles: reports.map(summary).reverse() };
}

function cycleNotFound(openedOn: LocalDate): RequestProblem {
  return new RequestProblem(
    404,
    'cycle_not_found',
    `No cycle opened on ${openedOn}.`,
  );
}

/** Day-by-day figures for one cycle's charts (ADR 0020). */
export async function cycleDayList(
  db: Kysely<DB>,
  userId: string,
  openedOn: LocalDate,
  now: Date,
): Promise<CycleDayListView> {
  const { view, timeZone } = await db
    .transaction()
    .execute((trx) => loadView(trx, userId));
  const today = localDateIn(now, timeZone);
  const cycle = cyclesOf(view, today).find((c) => c.openedOn === openedOn);
  if (cycle === undefined) throw cycleNotFound(openedOn);
  const { days, budget, missingRates } = cycleDays(view, cycle, today);
  return { days: [...days], budget, missingRates: [...missingRates] };
}

export async function cycleDetail(
  db: Kysely<DB>,
  userId: string,
  openedOn: LocalDate,
  now: Date,
): Promise<CycleDetailView> {
  const { view, reports } = await reportsFor(db, userId, now, openedOn);
  const [report] = reports;
  if (report === undefined) throw cycleNotFound(openedOn);
  const entries = new Map(view.ledger.map((t) => [t.id, t]));
  const { top, other } = rankTotals(report.spendingByCategory, TOP_CATEGORIES);
  return {
    ...summary(report),
    opening: report.opening,
    closing: report.closing,
    incomeByCategory: [...report.incomeByCategory],
    spendingByCategory: [...report.spendingByCategory],
    spendingTop: { top: [...top], other },
    amendments: report.amendments.flatMap((amendment) => {
      const entry = entries.get(amendment.transactionId);
      return entry === undefined
        ? []
        : [
            {
              transactionId: amendment.transactionId,
              kind: entry.kind,
              occurredOn: amendment.occurredOn,
              recordedAt: amendment.recordedAt,
              note: entry.note,
            },
          ];
    }),
  };
}
