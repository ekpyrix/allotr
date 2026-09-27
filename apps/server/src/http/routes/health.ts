import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { sql } from 'kysely';
import type { AppDeps, AppEnv } from '../env.ts';
import { json, problemResponse } from '../openapi.ts';
import { problemBody } from '../problem.ts';

const healthRoute = createRoute({
  method: 'get',
  path: '/healthz',
  tags: ['Operations'],
  summary: 'Liveness probe',
  responses: {
    200: json(z.object({ status: z.literal('ok') }), 'The process is running.'),
  },
});

const readyRoute = createRoute({
  method: 'get',
  path: '/readyz',
  tags: ['Operations'],
  summary: 'Readiness probe',
  responses: {
    200: json(
      z.object({ status: z.literal('ready') }),
      'Migrations are applied and the database answers.',
    ),
    503: problemResponse('The database is not reachable.'),
  },
});

export function registerHealthRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  app.openapi(healthRoute, (c) => c.json({ status: 'ok' as const }, 200));

  app.openapi(readyRoute, async (c) => {
    try {
      await sql`SELECT 1`.execute(deps.db);
    } catch (error) {
      deps.logger.warn({ err: error }, 'readiness check failed');
      return c.json(
        problemBody(503, { detail: 'The database is not reachable.' }),
        503,
        {
          'content-type': 'application/problem+json',
        },
      );
    }
    return c.json({ status: 'ready' as const }, 200);
  });
}
