import { problemDetailsSchema } from '@allotr/shared';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { sql, type Kysely } from 'kysely';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import manifest from '../../package.json' with { type: 'json' };
import type { DB } from '../db/schema.ts';
import type { Logger } from '../logger.ts';
import { problem, problemBody, type ProblemStatus } from './problem.ts';

export interface AppDeps {
  readonly db: Kysely<DB>;
  readonly logger: Logger;
}

const probePaths = new Set(['/healthz', '/readyz']);

const problemContent = {
  'application/problem+json': { schema: problemDetailsSchema },
};

const healthRoute = createRoute({
  method: 'get',
  path: '/healthz',
  summary: 'Liveness probe',
  responses: {
    200: {
      description: 'The process is running.',
      content: {
        'application/json': { schema: z.object({ status: z.literal('ok') }) },
      },
    },
  },
});

const readyRoute = createRoute({
  method: 'get',
  path: '/readyz',
  summary: 'Readiness probe',
  responses: {
    200: {
      description: 'Migrations are applied and the database answers.',
      content: {
        'application/json': {
          schema: z.object({ status: z.literal('ready') }),
        },
      },
    },
    503: {
      description: 'The database is not reachable.',
      content: problemContent,
    },
  },
});

export function createApp({ db, logger }: AppDeps): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (result.success) return;
      return problem(c, 400, {
        detail: 'The request is invalid.',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    },
  });

  app.use(requestId());
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    const entry = {
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    };
    // Probes run every few seconds; keep them out of the default log level.
    if (probePaths.has(c.req.path)) logger.debug(entry, 'request');
    else logger.info(entry, 'request');
  });

  app.openapi(healthRoute, (c) => c.json({ status: 'ok' as const }, 200));

  app.openapi(readyRoute, async (c) => {
    try {
      await sql`SELECT 1`.execute(db);
    } catch (error) {
      logger.warn({ err: error }, 'readiness check failed');
      return c.json(
        problemBody(503, { detail: 'The database is not reachable.' }),
        503,
        { 'content-type': 'application/problem+json' },
      );
    }
    return c.json({ status: 'ready' as const }, 200);
  });

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Allotr API', version: manifest.version },
  });

  app.notFound((c) => problem(c, 404));

  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status < 500) {
      return problem(c, error.status as ProblemStatus);
    }
    logger.error(
      { err: error, requestId: c.get('requestId') },
      'unhandled error',
    );
    return problem(c, 500);
  });

  return app;
}
