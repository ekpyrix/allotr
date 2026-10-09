import {
  categoryId,
  categorySeries,
  categoryTotalsBetween,
  cyclePeriods,
  cyclesOf,
  monthPeriods,
  rollUpCategories,
  type CategoryId,
  type CategoryGroup,
  type CategorySeries,
  type SeriesPeriod,
} from '@allotr/core';
import {
  addDays,
  lastDayOfMonth,
  localDate,
  localDateIn,
  type CategorySeriesView,
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
  series?: number | undefined;
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

// The core result is readonly; the API view is plain arrays.
const seriesView = (series: CategorySeries): CategorySeriesView => ({
  periods: series.periods.map(({ from, to }) => ({ from, to })),
  groups: series.groups.map((g) => ({
    categoryId: g.categoryId,
    points: [...g.points],
  })),
  totals: [...series.totals],
  missingRates: [...series.missingRates],
});

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
  let periods: SeriesPeriod[];
  if (query.period === 'month') {
    const month = query.month ?? today.slice(0, 7);
    from = localDate(`${month}-01`);
    to = lastDayOfMonth(from);
    periods = monthPeriods(month, query.series ?? 0);
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
    periods = cyclePeriods(cycles, cycle.openedOn, query.series ?? 0, today);
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
    ...(query.series === undefined
      ? {}
      : {
          series: seriesView(
            categorySeries(loaded.view, periods, parentOf, merged),
          ),
        }),
  };
}
