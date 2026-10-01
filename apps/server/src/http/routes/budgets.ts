import {
  budgetStatusSchema,
  coverListSchema,
  coverOrderBodySchema,
  coverOverrideBodySchema,
  coverPreviewBodySchema,
  coverPreviewSchema,
  createBudgetBodySchema,
  idParamSchema,
  updateBudgetBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  budgetStatusView,
  clearCoverOverride,
  createBudget,
  endBudget,
  listCovers,
  previewCover,
  setCoverOrder,
  setCoverOverride,
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

const coverOrderRoute = createRoute({
  method: 'put',
  path: '/v1/budgets/cover-order',
  tags,
  summary: 'Set the cover order',
  description:
    'Who pays when spending passes what a budget has left, first to last: `free` for free money and budget IDs, the Buffer included. Bills are never used. What is left out is placed by default: free money first, the Buffer next, new budgets last.',
  request: {
    body: {
      content: { 'application/json': { schema: coverOrderBodySchema } },
    },
  },
  responses: {
    200: json(budgetStatusSchema, 'The budgets with the new order.'),
    400: invalid,
    ...signedIn,
  },
});

const coversRoute = createRoute({
  method: 'get',
  path: '/v1/budgets/covers',
  tags,
  summary: 'Entries covered this period',
  description: `Every entry in the current period that went past what its budget had left, newest first, with what its own budget paid and who covered the rest. ${figures} Cover is computed, never stored; no money moves.`,
  responses: {
    200: json(coverListSchema, 'The covered entries.'),
    ...signedIn,
  },
});

const previewRoute = createRoute({
  method: 'post',
  path: '/v1/budgets/cover-preview',
  tags,
  summary: 'Preview the cover for an expense',
  description:
    'Works out, without recording anything, what an expense would take from its budget and from each cover source. `needsConfirmation` is true when the cover reaches a set-aside budget or the Buffer, or part of it is uncovered: show it in a warning colour and ask for a second tap. The entry is saved with `POST /v1/transactions`; nothing about the cover is sent with it.',
  request: {
    body: {
      content: { 'application/json': { schema: coverPreviewBodySchema } },
    },
  },
  responses: {
    200: json(coverPreviewSchema, 'The cover the entry would get.'),
    400: invalid,
    ...signedIn,
    404: problemResponse('There is no such account.'),
    409: problemResponse('The account is archived.'),
  },
});

const overrideRoute = createRoute({
  method: 'put',
  path: '/v1/transactions/{id}/cover',
  tags,
  summary: 'Choose how an entry is covered',
  description:
    'A setting on the entry, not a ledger change: the entry and its postings stay as recorded. Each requested source covers at most what it had, and any shortfall left goes down the cover order, so an override cannot create money.',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: coverOverrideBodySchema } },
    },
  },
  responses: {
    204: { description: 'Saved.' },
    400: invalid,
    ...signedIn,
    404: problemResponse('There is no such entry.'),
  },
});

const clearOverrideRoute = createRoute({
  method: 'delete',
  path: '/v1/transactions/{id}/cover',
  tags,
  summary: 'Go back to the cover order for an entry',
  request: { params: idParamSchema },
  responses: { 204: { description: 'Cleared.' }, ...signedIn },
});

export function registerBudgetRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/budgets', requireUser(deps));
  app.use('/v1/budgets/*', requireUser(deps));
  app.use('/v1/transactions/*', requireUser(deps));

  app.openapi(coverOrderRoute, async (c) =>
    c.json(
      await setCoverOrder(
        db,
        c.get('user').id,
        c.req.valid('json').order,
        now(),
      ),
      200,
    ),
  );

  app.openapi(coversRoute, async (c) =>
    c.json(await listCovers(db, c.get('user').id, now()), 200),
  );

  app.openapi(previewRoute, async (c) =>
    c.json(
      await previewCover(db, c.get('user').id, c.req.valid('json'), now()),
      200,
    ),
  );

  app.openapi(overrideRoute, async (c) => {
    const { id } = c.req.valid('param');
    await setCoverOverride(
      db,
      c.get('user').id,
      id,
      c.req.valid('json'),
      now(),
    );
    return c.body(null, 204);
  });

  app.openapi(clearOverrideRoute, async (c) => {
    const { id } = c.req.valid('param');
    await clearCoverOverride(db, c.get('user').id, id);
    return c.body(null, 204);
  });

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
