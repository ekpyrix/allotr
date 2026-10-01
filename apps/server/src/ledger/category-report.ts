import {
  categoryId,
  categoryTotalsBetween,
  cyclesOf,
  rollUpCategories,
  type CategoryId,
  type CategoryGroup,
} from '@allotr/core';
import {
  addDays,
  lastDayOfMonth,
  localDate,
  localDateIn,
  type CategorySummaryView,
  type LocalDate,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { mergeTargets } from './cycles.ts';
import { loadView } from './today.ts';

// Category summaries (FR-W2): spending and income per top-level category for
// a payday cycle or a calendar month, computed from the ledger on each read.

type Query = Readonly<{
  period: 'cycle' | 'month';
  cycle?: LocalDate | undefined;
  month?: string | undefined;
}>;

const view = (groups: CategoryGroup[]) =>
  groups.map((group) => ({
    categoryId: group.categoryId,
    amount: group.amount,
    children: group.children.map((child) => ({
      categoryId: child.categoryId,
      amount: child.amount,
    })),
  }));

export async function categorySummary(
  db: Kysely<DB>,
  userId: string,
  query: Query,
  now: Date,
): Promise<CategorySummaryView> {
  const { loaded, merged, parents } = await db
    .transaction()
    .execute(async (trx) => ({
      loaded: await loadView(trx, userId),
      merged: await mergeTargets(trx, userId),
      parents: await trx
        .selectFrom('categories')
        .select(['id', 'parent_id'])
        .where('user_id', '=', userId)
        .execute(),
    }));
  const today = localDateIn(now, loaded.timeZone);
  let from: LocalDate;
  let to: LocalDate;
  if (query.period === 'month') {
    const month = query.month ?? today.slice(0, 7);
    from = localDate(`${month}-01`);
    to = lastDayOfMonth(from);
  } else {
    const cycles = cyclesOf(loaded.view, today);
    const cycle =
      query.cycle === undefined
        ? cycles.at(-1)
        : cycles.find((c) => c.openedOn === query.cycle);
    if (cycle === undefined) {
      throw new RequestProblem(
        404,
        'cycle_not_found',
        `No cycle opened on ${query.cycle ?? 'that day'}.`,
      );
    }
    from = cycle.openedOn;
    to = cycle.closedOn === null ? today : addDays(cycle.closedOn, -1);
  }
  const parentOf = new Map<CategoryId, CategoryId | null>(
    parents.map((row) => [
      categoryId(row.id),
      row.parent_id === null ? null : categoryId(row.parent_id),
    ]),
  );
  const spending = categoryTotalsBetween(
    loaded.view,
    { from, to },
    'expenses',
    merged,
  );
  const income = categoryTotalsBetween(
    loaded.view,
    { from, to },
    'income',
    merged,
  );
  return {
    period: query.period,
    from,
    to,
    spending: view(rollUpCategories(spending.totals, parentOf)),
    income: view(rollUpCategories(income.totals, parentOf)),
    missingRates: [
      ...new Set([...spending.missingRates, ...income.missingRates]),
    ].sort(),
  };
}
