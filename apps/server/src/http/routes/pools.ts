import {
  accountSchema,
  createPoolBodySchema,
  idParamSchema,
  listPoolsQuerySchema,
  moveAccountBodySchema,
  poolListSchema,
  poolSchema,
  updatePoolBodySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  createPool,
  listPools,
  moveAccount,
  updatePool,
} from '../../ledger/pools.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Pools: groups of accounts that do or do not count toward the daily number
// (ADR 0021).

const tags = ['Pools'];
const invalid = problemResponse('The request is invalid.');
const signedIn = { 401: unauthenticated, 403: forbidden };
const notFound = problemResponse('There is no such pool.');

const listRoute = createRoute({
  method: 'get',
  path: '/v1/pools',
  tags,
  summary: 'List pools with their accounts and balances',
  description:
    'Every user has the default pools Budget (counts toward the daily number) and Savings (does not). A savings pool counts only when its own switch and the `countSavingsInDaily` setting are both on.',
  request: { query: listPoolsQuerySchema },
  responses: {
    200: json(poolListSchema, 'Pools, and archived ones on request.'),
    400: invalid,
    ...signedIn,
  },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/pools',
  tags,
  summary: 'Add a pool',
  request: {
    body: {
      content: { 'application/json': { schema: createPoolBodySchema } },
    },
  },
  responses: {
    201: json(poolSchema, 'The new pool.'),
    400: invalid,
    ...signedIn,
    409: problemResponse('Another pool has this name (`pool_name_taken`).'),
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/pools/{id}',
  tags,
  summary: 'Rename, switch or archive a pool',
  description:
    'The Budget pool always counts and neither default pool can be archived (`pool_fixed`). Only an empty pool is archived (`pool_not_empty`).',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updatePoolBodySchema } },
    },
  },
  responses: {
    200: json(poolSchema, 'The pool after the change.'),
    400: invalid,
    ...signedIn,
    404: notFound,
    409: problemResponse('The name is taken, the pool is fixed or not empty.'),
  },
});

const moveRoute = createRoute({
  method: 'put',
  path: '/v1/accounts/{id}/pool',
  tags,
  summary: 'Move an account into a pool',
  description:
    'Effective from `effectiveOn` (today by default) and recorded as a dated move; no entry changes. Figures for earlier days stay as they were, and a back-dated move corrects the days it covers.',
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: moveAccountBodySchema } },
    },
  },
  responses: {
    200: json(accountSchema, 'The account in its pool.'),
    400: invalid,
    ...signedIn,
    404: problemResponse('There is no such account or pool.'),
    409: problemResponse('The account or the pool is archived.'),
  },
});

export function registerPoolRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/pools', requireUser(deps));
  app.use('/v1/pools/*', requireUser(deps));
  // `/v1/accounts/*` is guarded where the accounts routes are registered.

  app.openapi(listRoute, async (c) => {
    const { includeArchived } = c.req.valid('query');
    return c.json(
      await listPools(db, c.get('user').id, now(), includeArchived === true),
      200,
    );
  });

  app.openapi(createRouteDef, async (c) =>
    c.json(
      await createPool(db, c.get('user').id, c.req.valid('json'), now()),
      201,
    ),
  );

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await updatePool(db, c.get('user').id, id, c.req.valid('json'), now()),
      200,
    );
  });

  app.openapi(moveRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(
      await moveAccount(db, c.get('user').id, id, c.req.valid('json'), now()),
      200,
    );
  });
}
