import {
  createInviteBodySchema,
  inviteSchema,
  inviteStatusSchema,
  onboardingStatusSchema,
  sessionUserSchema,
  signUpBodySchema,
} from '@allotr/shared';
import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { countUsers } from '../../auth/auth.ts';
import {
  claimInvite,
  completeInvite,
  createInvite,
  findInvite,
  releaseInvite,
} from '../../auth/invites.ts';
import { signUpWithEmail } from '../../auth/session-user.ts';
import { createMutex } from '../../mutex.ts';
import { readSettings } from '../../settings.ts';
import type { AppDeps, AppEnv } from '../env.ts';
import { authHeaders, requireUser } from '../guards.ts';
import {
  forbidden,
  json,
  problemResponse,
  unauthenticated,
} from '../openapi.ts';
import { problem } from '../problem.ts';

const day = 86_400_000;

const createdUser = json(
  z.object({ user: sessionUserSchema }),
  'Account created and signed in; the session cookie is set.',
);
const invalidRequest = problemResponse('The request body is invalid.');
const inviteInvalid = problemResponse(
  'The invite does not exist, was used or has expired.',
);
const tokenParam = z.object({ token: z.string().min(1).max(200) });

const onboardingStatusRoute = createRoute({
  method: 'get',
  path: '/v1/onboarding',
  tags: ['Users'],
  summary: 'Whether the first account still has to be created',
  responses: { 200: json(onboardingStatusSchema, 'Onboarding status.') },
});

const onboardingRoute = createRoute({
  method: 'post',
  path: '/v1/onboarding',
  tags: ['Users'],
  summary: 'Create the first account, which becomes the administrator',
  request: {
    body: { content: { 'application/json': { schema: signUpBodySchema } } },
  },
  responses: {
    201: createdUser,
    400: invalidRequest,
    409: problemResponse('An account already exists.'),
  },
});

const createInviteRoute = createRoute({
  method: 'post',
  path: '/v1/invites',
  tags: ['Users'],
  summary: 'Create a single-use invite link (administrators)',
  request: {
    body: {
      content: { 'application/json': { schema: createInviteBodySchema } },
    },
  },
  responses: {
    201: json(inviteSchema, 'The invite link. It is shown only once.'),
    400: invalidRequest,
    401: unauthenticated,
    403: forbidden,
  },
});

const inviteStatusRoute = createRoute({
  method: 'get',
  path: '/v1/invites/{token}',
  tags: ['Users'],
  summary: 'Check an invite link before signing up',
  request: { params: tokenParam },
  responses: {
    200: json(inviteStatusSchema, 'The invite is valid.'),
    404: inviteInvalid,
  },
});

const acceptInviteRoute = createRoute({
  method: 'post',
  path: '/v1/invites/{token}/accept',
  tags: ['Users'],
  summary: 'Create an account with an invite link',
  request: {
    params: tokenParam,
    body: { content: { 'application/json': { schema: signUpBodySchema } } },
  },
  responses: {
    201: createdUser,
    400: invalidRequest,
    403: problemResponse('Registration is closed.'),
    404: inviteInvalid,
  },
});

function setCookies(c: Context, cookies: readonly string[]): void {
  for (const cookie of cookies)
    c.header('set-cookie', cookie, { append: true });
}

export function registerOnboardingRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: AppDeps,
): void {
  const { db, auth, config, limits, now } = deps;
  // Account creation checks and writes must not interleave (first-admin
  // race, single-use invites).
  const serialise = createMutex();

  app.openapi(onboardingStatusRoute, async (c) =>
    c.json({ required: (await countUsers(db)) === 0 }, 200),
  );

  app.openapi(onboardingRoute, async (c) => {
    const body = c.req.valid('json');
    return serialise(async () => {
      if ((await countUsers(db)) > 0) {
        return problem(c, 409, {
          detail: 'Onboarding is complete. Sign in instead.',
          code: 'onboarding_complete',
        });
      }
      const { user, cookies } = await signUpWithEmail(
        auth,
        body,
        authHeaders(c),
      );
      await db
        .updateTable('users')
        .set({ role: 'admin' })
        .where('id', '=', user.id)
        .execute();
      setCookies(c, cookies);
      return c.json({ user: { ...user, role: 'admin' as const } }, 201);
    });
  });

  app.on('POST', '/v1/invites', requireUser(deps, { admin: true }));
  app.openapi(createInviteRoute, async (c) => {
    const { expiresInDays } = c.req.valid('json');
    const invite = await createInvite(db, {
      createdBy: c.get('user').id,
      now: now(),
      ttlMs:
        expiresInDays === undefined ? limits.inviteTtlMs : expiresInDays * day,
    });
    const url = `${config.baseUrl.replace(/\/+$/, '')}/invite/${invite.token}`;
    return c.json({ url, expiresAt: invite.expiresAt.toISOString() }, 201);
  });

  app.openapi(inviteStatusRoute, async (c) => {
    const invite = await findInvite(db, c.req.valid('param').token, now());
    if (invite === null) {
      return problem(c, 404, {
        detail: 'This invite link is not valid. Ask for a new one.',
        code: 'invite_invalid',
      });
    }
    return c.json({ expiresAt: invite.expiresAt.toISOString() }, 200);
  });

  app.openapi(acceptInviteRoute, async (c) => {
    const { token } = c.req.valid('param');
    const body = c.req.valid('json');
    const { registrationMode } = await readSettings(db);
    if (registrationMode === 'closed') {
      return problem(c, 403, {
        detail: 'Registration is closed on this instance.',
        code: 'registration_closed',
      });
    }
    return serialise(async () => {
      const invite = await findInvite(db, token, now());
      if (invite === null || !(await claimInvite(db, invite.id, now()))) {
        return problem(c, 404, {
          detail: 'This invite link is not valid. Ask for a new one.',
          code: 'invite_invalid',
        });
      }
      let created;
      try {
        created = await signUpWithEmail(auth, body, authHeaders(c));
      } catch (error) {
        await releaseInvite(db, invite.id);
        throw error;
      }
      await completeInvite(db, invite.id, created.user.id);
      setCookies(c, created.cookies);
      return c.json({ user: created.user }, 201);
    });
  });
}
