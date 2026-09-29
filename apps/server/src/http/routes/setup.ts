import { setupSchema } from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { readSetup, saveSetup } from '../../setup.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Setup progress per user (FR-W7). The `/v1/settings/*` user guard is
// installed by registerTodayRoutes, which is registered first.

const signedIn = { 401: unauthenticated, 403: forbidden };

const getSetupRoute = createRoute({
  method: 'get',
  path: '/v1/settings/setup',
  tags: ['Settings'],
  summary: 'Setup progress',
  description:
    'Steps run in the order `region`, `payday`, `spending`, `savings`, `bills`; the next one is the first not in `handled`. With nothing saved, a user who has any account reads as finished.',
  responses: {
    200: json(setupSchema, 'Current setup progress.'),
    ...signedIn,
  },
});

const putSetupRoute = createRoute({
  method: 'put',
  path: '/v1/settings/setup',
  tags: ['Settings'],
  summary: 'Save setup progress',
  request: {
    body: { content: { 'application/json': { schema: setupSchema } } },
  },
  responses: {
    200: json(setupSchema, 'Setup progress after the change.'),
    400: problemResponse('The request is invalid.'),
    ...signedIn,
  },
});

export function registerSetupRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;

  app.openapi(getSetupRoute, async (c) =>
    c.json(await readSetup(db, c.get('user').id), 200),
  );

  app.openapi(putSetupRoute, async (c) =>
    c.json(
      await saveSetup(db, c.get('user').id, c.req.valid('json'), now()),
      200,
    ),
  );
}
