import {
  cycleDetailSchema,
  cycleListSchema,
  cycleParamSchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { cycleDetail, listCycles } from '../../ledger/cycles.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Cycle snapshots for the cycle and history views (FR-C1, FR-C6, FR-W2).

const signedIn = { 401: unauthenticated, 403: forbidden };

const figures =
  "Computed from the ledger on each read, so a back-dated entry changes a past cycle at once. Amounts are in the default currency at the rate on the cycle's last day; currencies without a rate are left out and listed in `missingRates`.";

const listRoute = createRoute({
  method: 'get',
  path: '/v1/cycles',
  tags: ['Cycles'],
  summary: 'Every cycle, newest first',
  description: `${figures} A past cycle is \`amended\` when an entry dated in it was recorded after the paycheck that closed it.`,
  responses: {
    200: json(cycleListSchema, 'The current cycle, then the past ones.'),
    ...signedIn,
  },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/v1/cycles/{openedOn}',
  tags: ['Cycles'],
  summary: 'One cycle in detail',
  description: `${figures} \`amendments\` lists the entries that amended it.`,
  request: { params: cycleParamSchema },
  responses: {
    200: json(cycleDetailSchema, 'The cycle that opened on that day.'),
    404: problemResponse('No cycle opened on that day (`cycle_not_found`).'),
    ...signedIn,
  },
});

export function registerCycleRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;
  app.use('/v1/cycles', requireUser(deps));
  app.use('/v1/cycles/*', requireUser(deps));

  app.openapi(listRoute, async (c) =>
    c.json(await listCycles(db, c.get('user').id, now()), 200),
  );

  app.openapi(detailRoute, async (c) =>
    c.json(
      await cycleDetail(
        db,
        c.get('user').id,
        c.req.valid('param').openedOn,
        now(),
      ),
      200,
    ),
  );
}
