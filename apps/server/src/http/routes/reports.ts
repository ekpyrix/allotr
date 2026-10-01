import {
  categorySummaryQuerySchema,
  categorySummarySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
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

export function registerReportRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/reports/*', requireUser(deps));

  app.openapi(categoriesRoute, async (c) =>
    c.json(
      await categorySummary(db, c.get('user').id, c.req.valid('query'), now()),
      200,
    ),
  );
}
