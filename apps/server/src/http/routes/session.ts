import {
  instanceSettingsPatchSchema,
  instanceSettingsSchema,
  sessionSchema,
} from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { readSettings, updateSettings } from '../../settings.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';

const sessionRoute = createRoute({
  method: 'get',
  path: '/v1/session',
  tags: ['Accounts'],
  summary: 'The signed-in user',
  description:
    'Also answers for users who still have to enrol in required two-factor authentication, so the client can send them to enrolment.',
  responses: {
    200: json(sessionSchema, 'The current session.'),
    401: unauthenticated,
  },
});

const getSettingsRoute = createRoute({
  method: 'get',
  path: '/v1/admin/settings',
  tags: ['Administration'],
  summary: 'Instance settings',
  responses: {
    200: json(instanceSettingsSchema, 'Current settings.'),
    401: unauthenticated,
    403: forbidden,
  },
});

const patchSettingsRoute = createRoute({
  method: 'patch',
  path: '/v1/admin/settings',
  tags: ['Administration'],
  summary: 'Change instance settings',
  request: {
    body: {
      content: { 'application/json': { schema: instanceSettingsPatchSchema } },
    },
  },
  responses: {
    200: json(instanceSettingsSchema, 'Settings after the change.'),
    400: problemResponse('The request body is invalid.'),
    401: unauthenticated,
    403: forbidden,
  },
});

export function registerSessionRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  app.use('/v1/session', requireUser(deps, { allowUnenrolled: true }));
  app.openapi(sessionRoute, async (c) => {
    const user = c.get('user');
    const { requireTwoFactor } = await readSettings(deps.db);
    return c.json(
      { user, twoFactorRequired: requireTwoFactor && !user.twoFactorEnabled },
      200,
    );
  });

  app.use('/v1/admin/*', requireUser(deps, { admin: true }));
  app.openapi(getSettingsRoute, async (c) =>
    c.json(await readSettings(deps.db), 200),
  );
  app.openapi(patchSettingsRoute, async (c) => {
    const patch = c.req.valid('json');
    return c.json(await updateSettings(deps.db, patch, deps.now()), 200);
  });
}
