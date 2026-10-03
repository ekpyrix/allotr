import {
  confirmPlanBodySchema,
  confirmPlanResultSchema,
  emergencyFundSchema,
  netWorthQuerySchema,
  netWorthSchema,
  paydayPlanSchema,
  weeklyReviewSchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  confirmPaydayPlan,
  getEmergencyFund,
  getNetWorth,
  getPaydayPlan,
  getWeeklyReview,
} from '../../ledger/plan.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// The payday plan and insights (ADR 0021).

const signedIn = { 401: unauthenticated, 403: forbidden };
const figures =
  'Computed from the ledger on each read. Amounts are in the default currency; currencies without a rate are left out and listed in `missingRates`.';

const planRoute = createRoute({
  method: 'get',
  path: '/v1/payday-plan',
  tags: ['Payday plan'],
  summary: 'The payday sheet',
  description: `The savings line first (the \`payYourselfFirst\` setting: a fixed amount or a share of the paycheck), then this period's budgets prefilled with their plan, and a suggestion for every category without a budget that has been spending, averaged over up to three past cycles. ${figures}`,
  responses: { 200: json(paydayPlanSchema, 'The sheet.'), ...signedIn },
});

const confirmRoute = createRoute({
  method: 'post',
  path: '/v1/payday-plan/confirm',
  tags: ['Payday plan'],
  summary: 'Confirm the payday sheet in one step',
  description:
    'Sets the amount of each listed budget from this period on, plans a budget for each listed category, and, when `savings` is given, records the savings line as one transfer from the first account to the second. Everything is checked before anything is written. The transfer has an idempotency key for the cycle, so repeating the call records no second transfer.',
  request: {
    body: {
      content: { 'application/json': { schema: confirmPlanBodySchema } },
    },
  },
  responses: {
    200: json(confirmPlanResultSchema, 'The savings entry and the budgets.'),
    400: problemResponse('The request is invalid.'),
    ...signedIn,
    404: problemResponse('A budget, category or account does not exist.'),
    409: problemResponse('A category already has a budget in use.'),
  },
});

const fundRoute = createRoute({
  method: 'get',
  path: '/v1/insights/emergency-fund',
  tags: ['Insights'],
  summary: 'Emergency fund progress',
  description: `Savings (accounts that do not count toward the daily number) against a target of \`emergencyMonths\` months of average expenses, with the usual three and six months. The average is per cycle over up to three past cycles. ${figures}`,
  responses: { 200: json(emergencyFundSchema, 'The figures.'), ...signedIn },
});

const worthRoute = createRoute({
  method: 'get',
  path: '/v1/insights/net-worth',
  tags: ['Insights'],
  summary: 'Net worth and its daily series',
  description: `Every account, savings included, with debts counted by their sign. \`days\` (default 30) sets the length of the series, which ends today. ${figures}`,
  request: { query: netWorthQuerySchema },
  responses: { 200: json(netWorthSchema, 'The figures.'), ...signedIn },
});

const reviewRoute = createRoute({
  method: 'get',
  path: '/v1/insights/weekly-review',
  tags: ['Insights'],
  summary: 'Figures for the weekly review',
  description: `The seven days ending today against the seven before, the biggest categories, and where the budgets stand. Payments linked to a reserved bill and reconcile adjustments are not counted as spending. ${figures}`,
  responses: { 200: json(weeklyReviewSchema, 'The figures.'), ...signedIn },
});

export function registerPlanRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/payday-plan', requireUser(deps));
  app.use('/v1/payday-plan/*', requireUser(deps));
  app.use('/v1/insights/*', requireUser(deps));

  app.openapi(planRoute, async (c) =>
    c.json(await getPaydayPlan(db, c.get('user').id, now()), 200),
  );
  app.openapi(confirmRoute, async (c) =>
    c.json(
      await confirmPaydayPlan(db, c.get('user').id, c.req.valid('json'), now()),
      200,
    ),
  );
  app.openapi(fundRoute, async (c) =>
    c.json(await getEmergencyFund(db, c.get('user').id, now()), 200),
  );
  app.openapi(worthRoute, async (c) =>
    c.json(
      await getNetWorth(
        db,
        c.get('user').id,
        c.req.valid('query').days ?? 30,
        now(),
      ),
      200,
    ),
  );
  app.openapi(reviewRoute, async (c) =>
    c.json(await getWeeklyReview(db, c.get('user').id, now()), 200),
  );
}
