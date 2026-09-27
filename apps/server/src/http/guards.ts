import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { CLIENT_IP_HEADER } from '../auth/auth.ts';
import { currentUser } from '../auth/session-user.ts';
import { readSettings } from '../settings.ts';
import type { ClientIpResolver } from './client-ip.ts';
import type { AppDeps, AppEnv } from './env.ts';
import { problem } from './problem.ts';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // No socket when the app is called in-process (tests).
    return undefined;
  }
}

export function resolveClientIp(
  resolve: ClientIpResolver,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set(
      'clientIp',
      resolve(socketAddress(c), c.req.header('x-forwarded-for') ?? null),
    );
    await next();
  };
}

/** Request headers for Better Auth, carrying the resolved client address. */
export function authHeaders(c: Context<AppEnv>): Headers {
  const headers = new Headers(c.req.raw.headers);
  headers.delete(CLIENT_IP_HEADER);
  const ip = c.get('clientIp');
  if (ip !== undefined) headers.set(CLIENT_IP_HEADER, ip);
  return headers;
}

// Cookie-authenticated writes must come from our own origin (CSRF defence
// next to SameSite cookies).
export function requireSameOrigin(baseUrl: string): MiddlewareHandler<AppEnv> {
  const expected = new URL(baseUrl).origin;
  return async (c, next) => {
    if (
      !safeMethods.has(c.req.method) &&
      c.req.header('cookie') !== undefined &&
      c.req.header('origin') !== expected
    ) {
      return problem(c, 403, {
        detail: 'The request did not come from this site.',
        code: 'origin_mismatch',
      });
    }
    return next();
  };
}

export interface GuardOptions {
  readonly admin?: boolean;
  /** Let users through who still have to enrol in required 2FA. */
  readonly allowUnenrolled?: boolean;
}

export function requireUser(
  deps: Pick<AppDeps, 'auth' | 'db'>,
  options: GuardOptions = {},
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = await currentUser(deps.auth, c.req.raw.headers);
    if (user === null) {
      return problem(c, 401, {
        detail: 'Sign in to continue.',
        code: 'unauthenticated',
      });
    }
    if (options.allowUnenrolled !== true && !user.twoFactorEnabled) {
      const { requireTwoFactor } = await readSettings(deps.db);
      if (requireTwoFactor) {
        return problem(c, 403, {
          detail: 'Set up two-factor authentication to continue.',
          code: 'two_factor_enrollment_required',
        });
      }
    }
    if (options.admin === true && user.role !== 'admin') {
      return problem(c, 403, {
        detail: 'Only an administrator can do this.',
        code: 'admin_required',
      });
    }
    c.set('user', user);
    return next();
  };
}
