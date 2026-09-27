import {
  createRateBodySchema,
  exchangeRateListSchema,
  exchangeRateSchema,
  idParamSchema,
  listRatesQuerySchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { deleteRate, listRates, putRate } from '../../ledger/rates.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Manual exchange rates for reporting (ADR 0010, FR-X2).

const tags = ['Exchange rates'];
const signedIn = { 401: unauthenticated, 403: forbidden };

const listRoute = createRoute({
  method: 'get',
  path: '/v1/rates',
  tags,
  summary: 'List exchange rates, newest first',
  request: { query: listRatesQuerySchema },
  responses: {
    200: json(exchangeRateListSchema, 'The rates.'),
    400: problemResponse('The request is invalid.'),
    ...signedIn,
  },
});

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/rates',
  tags,
  summary: 'Enter an exchange rate',
  description:
    'A figure uses the latest rate dated on or before its day, quoted either way round. Entering a rate for a pair and day that already has one replaces it (200).',
  request: {
    body: {
      content: { 'application/json': { schema: createRateBodySchema } },
    },
  },
  responses: {
    200: json(exchangeRateSchema, 'The rate that replaced an earlier one.'),
    201: json(exchangeRateSchema, 'The new rate.'),
    400: problemResponse('The request is invalid.'),
    ...signedIn,
  },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/v1/rates/{id}',
  tags,
  summary: 'Delete an exchange rate',
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Deleted.' },
    ...signedIn,
    404: problemResponse('There is no such rate.'),
  },
});

export function registerRateRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/rates', requireUser(deps));
  app.use('/v1/rates/*', requireUser(deps));

  app.openapi(listRoute, async (c) => {
    const { currency } = c.req.valid('query');
    return c.json(
      { rates: await listRates(db, c.get('user').id, currency) },
      200,
    );
  });

  app.openapi(createRouteDef, async (c) => {
    const { rate, replaced } = await putRate(
      db,
      c.get('user').id,
      c.req.valid('json'),
      now(),
    );
    return replaced ? c.json(rate, 200) : c.json(rate, 201);
  });

  app.openapi(deleteRouteDef, async (c) => {
    await deleteRate(db, c.get('user').id, c.req.valid('param').id);
    return c.body(null, 204);
  });
}
