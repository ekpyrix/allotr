import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import { MAX_PASSWORD_LENGTH } from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { Config } from '../config.ts';
import type { DB } from '../db/schema.ts';
import type { Logger } from '../logger.ts';
import { readSettings } from '../settings.ts';
import type { AuthLimits } from './limits.ts';
import {
  clearSignInFailures,
  lockedUntil,
  recordSignInFailure,
} from './lockout.ts';
import {
  accountNames,
  sessionNames,
  twoFactorNames,
  userNames,
  verificationNames,
} from './schema-names.ts';

// Better Auth on the shared Kysely database (ADR 0006), mounted at /v1/auth.

export const AUTH_BASE_PATH = '/v1/auth';
/** Set by the server from the resolved client address; see http/client-ip.ts. */
export const CLIENT_IP_HEADER = 'x-allotr-client-ip';

export interface AuthDeps {
  readonly db: Kysely<DB>;
  readonly config: Config;
  readonly limits: AuthLimits;
  readonly logger: Logger;
  readonly now: () => Date;
}

function emailFrom(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('email' in body))
    return undefined;
  return typeof body.email === 'string' ? body.email : undefined;
}

export async function countUsers(db: Kysely<DB>): Promise<number> {
  const row = await db
    .selectFrom('users')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return row.count;
}

export function createAuth({ db, config, limits, logger, now }: AuthDeps) {
  const perMinute = { window: 60, max: limits.signInRequestsPerMinute };

  return betterAuth({
    appName: 'Allotr',
    baseURL: config.baseUrl,
    basePath: AUTH_BASE_PATH,
    secret: config.secretKey,
    database: { db, type: 'sqlite' },
    trustedOrigins: [new URL(config.baseUrl).origin],
    // ADR 0011: no telemetry.
    telemetry: { enabled: false },
    logger: {
      level: 'warn',
      log: (level, message, ...args) => {
        logger[level]({ args }, `auth: ${message}`);
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: limits.minPasswordLength,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      autoSignIn: true,
    },
    user: {
      ...userNames,
      additionalFields: {
        role: {
          type: 'string',
          input: false,
          defaultValue: 'user',
          required: false,
        },
      },
    },
    session: sessionNames,
    account: accountNames,
    verification: verificationNames,
    plugins: [twoFactor({ issuer: 'Allotr', schema: twoFactorNames })],
    rateLimit: {
      enabled: true,
      storage: 'memory',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': perMinute,
        '/two-factor/verify-totp': perMinute,
        '/two-factor/verify-backup-code': perMinute,
      },
    },
    advanced: {
      cookiePrefix: 'allotr',
      useSecureCookies: config.baseUrl.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Public sign-up only in open mode and never for the first account;
        // onboarding and invites call the API from the server instead.
        if (ctx.path === '/sign-up/email' && ctx.request !== undefined) {
          const { registrationMode } = await readSettings(db);
          if (registrationMode !== 'open') {
            throw new APIError('FORBIDDEN', {
              message: 'Sign-up is by invitation only.',
              code: 'SIGN_UP_DISABLED',
            });
          }
          if ((await countUsers(db)) === 0) {
            throw new APIError('FORBIDDEN', {
              message: 'Create the first account through onboarding.',
              code: 'ONBOARDING_REQUIRED',
            });
          }
        }
        if (ctx.path === '/sign-in/email') {
          const email = emailFrom(ctx.body);
          if (
            email !== undefined &&
            (await lockedUntil(db, email, now())) !== null
          ) {
            throw new APIError('TOO_MANY_REQUESTS', {
              message: 'Too many failed sign-ins. Try again later.',
              code: 'ACCOUNT_TEMPORARILY_LOCKED',
            });
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email') return;
        const email = emailFrom(ctx.body);
        if (email === undefined) return;
        const returned = ctx.context.returned;
        if (returned instanceof APIError) {
          if (returned.statusCode === 401) {
            await recordSignInFailure(db, email, now(), limits);
          }
        } else {
          await clearSignInFailures(db, email);
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
