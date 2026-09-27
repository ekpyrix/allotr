import { OpenAPIHono } from '@hono/zod-openapi';
import { APIError } from 'better-auth/api';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import manifest from '../../package.json' with { type: 'json' };
import { AUTH_BASE_PATH } from '../auth/auth.ts';
import { authHandler } from './auth-handler.ts';
import { createClientIpResolver } from './client-ip.ts';
import type { AppDeps, AppEnv } from './env.ts';
import { requireSameOrigin, resolveClientIp } from './guards.ts';
import { problem, type ProblemStatus } from './problem.ts';
import { registerAccountRoutes } from './routes/accounts.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { registerSessionRoutes } from './routes/session.ts';

export type { AppDeps } from './env.ts';

const probePaths = new Set(['/healthz', '/readyz']);

export function createApp(deps: AppDeps): OpenAPIHono<AppEnv> {
  const { logger } = deps;
  const app = new OpenAPIHono<AppEnv>({
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

  app.use(
    '/v1/*',
    resolveClientIp(createClientIpResolver(deps.config.trustedProxies)),
  );
  app.use('/v1/*', requireSameOrigin(deps.config.baseUrl));

  registerHealthRoutes(app, deps);
  app.on(['GET', 'POST'], `${AUTH_BASE_PATH}/*`, authHandler(deps.auth));
  registerAccountRoutes(app, deps);
  registerSessionRoutes(app, deps);

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Allotr API',
      version: manifest.version,
      description: `Authentication (sign-in, two-factor, sessions) is served under ${AUTH_BASE_PATH}.`,
    },
  });

  app.notFound((c) => problem(c, 404));

  app.onError((error, c) => {
    if (error instanceof APIError) {
      const { message, code } = error.body ?? {};
      return problem(c, error.statusCode as ProblemStatus, {
        ...(message === undefined ? {} : { detail: message }),
        ...(code === undefined ? {} : { code: code.toLowerCase() }),
      });
    }
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
