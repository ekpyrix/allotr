import { appearanceSchema } from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { readAppearance, saveAppearance } from '../../appearance.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

// Theme mode per user (FR-W5). The `/v1/settings/*` user guard is installed
// by registerTodayRoutes, which is registered first.

const signedIn = { 401: unauthenticated, 403: forbidden };

const getAppearanceRoute = createRoute({
  method: 'get',
  path: '/v1/settings/appearance',
  tags: ['Settings'],
  summary: 'Appearance settings',
  description: '`system` follows the device light or dark preference.',
  responses: {
    200: json(appearanceSchema, 'Current appearance settings.'),
    ...signedIn,
  },
});

const putAppearanceRoute = createRoute({
  method: 'put',
  path: '/v1/settings/appearance',
  tags: ['Settings'],
  summary: 'Change appearance settings',
  request: {
    body: { content: { 'application/json': { schema: appearanceSchema } } },
  },
  responses: {
    200: json(appearanceSchema, 'Appearance settings after the change.'),
    400: problemResponse('The request is invalid.'),
    ...signedIn,
  },
});

export function registerAppearanceRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, now } = deps;

  app.openapi(getAppearanceRoute, async (c) =>
    c.json(await readAppearance(db, c.get('user').id), 200),
  );

  app.openapi(putAppearanceRoute, async (c) =>
    c.json(
      await saveAppearance(db, c.get('user').id, c.req.valid('json'), now()),
      200,
    ),
  );
}
