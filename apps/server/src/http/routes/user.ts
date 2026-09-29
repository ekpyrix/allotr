import { deleteUserBodySchema } from '@allotr/shared';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  codeMatches,
  deleteUser,
  isLastAdmin,
  passwordMatches,
} from '../../auth/delete-user.ts';
import { lockedUntil, recordSignInFailure } from '../../auth/lockout.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { authHeaders, requireUser } from '../guards.ts';
import { problemResponse, unauthenticated } from '../openapi.ts';
import { problem } from '../problem.ts';

const deleteUserRoute = createRoute({
  method: 'post',
  path: '/v1/user/delete',
  tags: ['Users'],
  summary: 'Delete the signed-in user and all their data',
  description:
    'A hard delete: the user, their sessions, 2FA and every ledger row are removed, and the session cookie is cleared. `code` (a TOTP or backup code) is needed when the user has 2FA on. Wrong passwords and codes count toward the sign-in lockout.',
  request: {
    body: {
      content: { 'application/json': { schema: deleteUserBodySchema } },
    },
  },
  responses: {
    204: { description: 'Deleted and signed out.' },
    400: problemResponse(
      'The request body is invalid, or a 2FA code is needed (`code_required`).',
    ),
    401: unauthenticated,
    403: problemResponse(
      'The password (`wrong_password`) or code (`wrong_code`) does not match.',
    ),
    409: problemResponse(
      'The only administrator cannot leave while other users exist (`last_admin`).',
    ),
    429: problemResponse('Too many failed attempts. Try again later.'),
  },
});

export function registerUserRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
  /** Shared with account creation, so a join cannot race the last leave. */
  serialise: <T>(task: () => Promise<T>) => Promise<T>,
): void {
  const { db, auth, limits, now } = deps;
  // A user held to 2FA enrolment may still leave.
  app.use('/v1/user/*', requireUser(deps, { allowUnenrolled: true }));

  app.openapi(deleteUserRoute, async (c) => {
    const user = c.get('user');
    const { password, code } = c.req.valid('json');
    return serialise(async () => {
      if (await isLastAdmin(db, user)) {
        return problem(c, 409, {
          detail:
            'You are the only administrator and other people use this instance, so the account cannot be deleted.',
          code: 'last_admin',
        });
      }
      if ((await lockedUntil(db, user.email, now())) !== null) {
        return problem(c, 429, {
          detail: 'Too many failed attempts. Try again later.',
          code: 'account_temporarily_locked',
        });
      }
      if (user.twoFactorEnabled && code === undefined) {
        return problem(c, 400, {
          detail: 'Enter a code from your authenticator app or a backup code.',
          code: 'code_required',
        });
      }
      const headers = authHeaders(c);
      if (!(await passwordMatches(auth, db, user.id, password))) {
        await recordSignInFailure(db, user.email, now(), limits);
        return problem(c, 403, {
          detail: 'The password is wrong.',
          code: 'wrong_password',
        });
      }
      if (
        user.twoFactorEnabled &&
        code !== undefined &&
        !(await codeMatches(auth, headers, code))
      ) {
        await recordSignInFailure(db, user.email, now(), limits);
        return problem(c, 403, {
          detail: 'The code is wrong or has been used.',
          code: 'wrong_code',
        });
      }

      await deleteUser(db, user);
      // The session row is gone; this only expires the cookies.
      const signedOut = await auth.api.signOut({
        headers,
        returnHeaders: true,
      });
      for (const cookie of signedOut.headers.getSetCookie())
        c.header('set-cookie', cookie, { append: true });
      return c.body(null, 204);
    });
  });
}
