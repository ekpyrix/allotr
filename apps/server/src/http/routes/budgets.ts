import {
  budgetStatusSchema,
  createBudgetBodySchema,
  idParamSchema,
  updateBudgetBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  budgetStatusView,
  createBudget,
  endBudget,
  updateBudget,
} from '../../ledger/budgets.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Budgets: a planned amount per period on a category or tag (ADR 0021).

const tags = ['Budgets'];
const invalid = problemResponse('The request is invalid.');
const signedIn = { 401: unauthenticated, 403: forbidden };
const notFound = problemResponse('There is no such budget.');

const figures =
  'Computed from the ledger on each read, so a back-dated entry changes the figures at once. Amounts are in the default currency; currencies without a rate are left out and listed in `missingRates`. Budgets are virtual: they are tied to no account and nothing is moved.';

const statusRoute = createRoute({
  method: 'get',
  path: '/v1/budgets',
  tags,
  summary: 'Budgets for the current period, with free money',
  description: `${figures} An entry counts toward at most one budget: a tag budget wins over a category budget, and a child category over its parent. Daily budgets stay in the daily number; set-aside ones, the Buffer included, are held out of it.`,
  responses: {
    200: json(budgetStatusSchema, 'The budgets in use and what is free.'),
    ...signedIn,
  },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/budgets',
  tags,
  summary: 'Plan a budget',
  description:
    'On an expense category (a parent covers its children) or a tag, in the default currency. It counts from the current period. Leftover defaults to returning to free money for a daily budget and carrying over for a set-aside one.',
  request: {
    body: {
      content: { 'application/json': { schema: createBudgetBodySchema } },
    },
  },
  responses: {
    201: json(budgetStatusSchema, 'The budgets after adding it.'),
    400: invalid,
    ...signedIn,
    404: problemResponse('There is no such category or tag.'),
    409: problemResponse(
      'The name, category or tag already has a budget in use (`budget_taken`).',
    ),
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/budgets/{id}',
  tags,
  summary: 'Change a budget',
  description:
    'A new amount applies from the current period; earlier periods keep theirs. The Buffer can be renamed and given an amount, and is always set aside and carried over (`budget_fixed`).',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updateBudgetBodySchema } },
    },
  },
  responses: {
    200: json(budgetStatusSchema, 'The budgets after the change.'),
    400: invalid,
    ...signedIn,
    404: notFound,
    409: problemResponse('The name is taken, or the budget is fixed.'),
  },
});

const endRoute = createRoute({
  method: 'delete',
  path: '/v1/budgets/{id}',
  tags,
  summary: 'End a budget',
  description:
    'Ends it from the current period on. Earlier periods keep their figures, and spending in this period counts as unbudgeted. The Buffer cannot be ended (`budget_fixed`).',
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Ended.' },
    ...signedIn,
    404: notFound,
    409: problemResponse('The Buffer cannot be removed (`budget_fixed`).'),
  },
});

export function registerBudgetRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/budgets', requireUser(deps));
  app.use('/v1/budgets/*', requireUser(deps));

  app.openapi(statusRoute, async (c) =>
    c.json(await budgetStatusView(db, c.get('user').id, now()), 200),
  );

  app.openapi(createRouteDef, async (c) =>
    c.json(
      await createBudget(db, c.get('user').id, c.req.valid('json'), now()),
      201,
    ),
  );

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await updateBudget(db, c.get('user').id, id, c.req.valid('json'), now()),
      200,
    );
  });

  app.openapi(endRoute, async (c) => {
    const { id } = c.req.valid('param');
    await endBudget(db, c.get('user').id, id, now());
    return c.body(null, 204);
  });
}
