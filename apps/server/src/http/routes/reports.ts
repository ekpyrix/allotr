import {
  calendarQuerySchema,
  calendarSchema,
  categorySummaryQuerySchema,
  categorySummarySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { calendarView } from '../../ledger/calendar.ts';
import { categorySummary } from '../../ledger/category-report.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Reports (FR-W2): category summaries with subcategories rolled up.

const signedIn = { 401: unauthenticated, 403: forbidden };

const categoriesRoute = createRoute({
  method: 'get',
  path: '/v1/reports/categories',
  tags: ['Reports'],
  summary: 'Spending and income per category for a period',
  description:
    'Top-level categories with their subcategories rolled up, largest first, for a payday cycle (`period=cycle`, the open one unless `cycle` names the day another opened) or a calendar month (`period=month`, the current one unless `month` is given). Computed from the ledger on each read, in the default currency at the rate on the last day of the period; currencies without a rate are left out and listed in `missingRates`. A merged category counts as the one it was merged into.',
  request: { query: categorySummaryQuerySchema },
  responses: {
    200: json(categorySummarySchema, 'The summary.'),
    404: problemResponse('No cycle opened on that day (`cycle_not_found`).'),
    ...signedIn,
  },
});

const calendarRoute = createRoute({
  method: 'get',
  path: '/v1/reports/calendar',
  tags: ['Reports'],
  summary: 'Spending per day and what falls due',
  description:
    'One row per day from `from` through `to` (at most 62 days; the current calendar month when both are left out). `spent` is the pace spending of the day, in the default currency at the rate of that day, with payments linked to a bill and reconcile adjustments left out; it is null after today. `heat` scales it from 0 to 4 against the busiest day of the range. `bills` lists bills due that day, `payday` marks a paycheck that arrived or is expected, and `ious` lists unsettled IOUs due. Computed from the ledger on each read.',
  request: { query: calendarQuerySchema },
  responses: {
    200: json(calendarSchema, 'The days.'),
    400: problemResponse(
      'The range is empty or longer than 62 days (`invalid_range`).',
    ),
    ...signedIn,
  },
});

export function registerReportRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/reports/*', requireUser(deps));

  app.openapi(calendarRoute, async (c) => {
    const { from, to } = c.req.valid('query');
    return c.json(
      await calendarView(db, c.get('user').id, { from, to }, now()),
      200,
    );
  });

  app.openapi(categoriesRoute, async (c) =>
    c.json(
      await categorySummary(db, c.get('user').id, c.req.valid('query'), now()),
      200,
    ),
  );
}
