import { OpenAPIHono } from '@hono/zod-openapi';
import { APIError } from 'better-auth/api';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import manifest from '../../package.json' with { type: 'json' };
import { AUTH_BASE_PATH } from '../auth/auth.ts';
import { authHandler } from './auth-handler.ts';
import { domainProblem, isDomainError } from './domain-errors.ts';
import { createClientIpResolver } from './client-ip.ts';
import type { AppDeps, AppEnv } from './env.ts';
import { requireSameOrigin, resolveClientIp } from './guards.ts';
import { problem, type ProblemStatus } from './problem.ts';
import { registerLedgerAccountRoutes } from './routes/accounts.ts';
import { registerAppearanceRoutes } from './routes/appearance.ts';
import { registerBillRoutes } from './routes/bills.ts';
import { registerCategoryRoutes } from './routes/categories.ts';
import { registerCycleRoutes } from './routes/cycles.ts';
import { registerOnboardingRoutes } from './routes/onboarding.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { registerImportRoutes } from './routes/import.ts';
import { registerRateRoutes } from './routes/rates.ts';
import { registerSessionRoutes } from './routes/session.ts';
import { registerTagRoutes } from './routes/tags.ts';
import { registerTodayRoutes } from './routes/today.ts';
import { registerTransactionRoutes } from './routes/transactions.ts';
import { registerWebApp } from './web.ts';

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
  // Strict CSP (SECURITY.md): the web build has no inline scripts or styles.
  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: 'no-referrer',
      xFrameOptions: 'DENY',
    }),
  );
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
  registerOnboardingRoutes(app, deps);
  registerSessionRoutes(app, deps);
  registerLedgerAccountRoutes(app, deps);
  registerCategoryRoutes(app, deps);
  registerTagRoutes(app, deps);
  registerTransactionRoutes(app, deps);
  registerTodayRoutes(app, deps);
  registerCycleRoutes(app, deps);
  registerAppearanceRoutes(app, deps);
  registerRateRoutes(app, deps);
  registerBillRoutes(app, deps);
  registerImportRoutes(app, deps);

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Allotr API',
      version: manifest.version,
      description: `Authentication (sign-in, two-factor, sessions) is served under ${AUTH_BASE_PATH}.`,
    },
  });

  if (deps.webDir !== undefined && !registerWebApp(app, deps.webDir)) {
    logger.warn(
      { webDir: deps.webDir },
      'web app not built; serving the API only',
    );
  }

  app.notFound((c) => problem(c, 404));

  app.onError((error, c) => {
    if (error instanceof APIError) {
      const { message, code } = error.body ?? {};
      return problem(c, error.statusCode as ProblemStatus, {
        ...(message === undefined ? {} : { detail: message }),
        ...(code === undefined ? {} : { code: code.toLowerCase() }),
      });
    }
    if (isDomainError(error)) {
      if (error.code === 'ledger.missing_system_account') {
        logger.error(
          { err: error, requestId: c.get('requestId') },
          'ledger error',
        );
      }
      return domainProblem(c, error);
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
