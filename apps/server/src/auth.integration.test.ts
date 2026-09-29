import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultAuthLimits, type AuthLimits } from './auth/limits.ts';
import { createLogger } from './logger.ts';
import { startServer, type RunningServer } from './server.ts';
import { createClient, type TestClient } from './testing/http-client.ts';
import { totpFromUri } from './testing/totp.ts';

const baseUrl = 'http://allotr.example.test';
const password = 'correct horse battery staple';

interface Harness {
  server: RunningServer;
  client: (headers?: Record<string, string>) => TestClient;
  close: () => Promise<void>;
}

async function boot(
  limits: Partial<AuthLimits> = {},
  trustedProxies: string[] = [],
): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), 'allotr-auth-'));
  const server = await startServer({
    config: {
      databasePath: join(dir, 'allotr.db'),
      baseUrl,
      secretKey: 'fake-secret-key-for-tests-0123456789',
      host: '127.0.0.1',
      port: 0,
      logLevel: 'silent',
      trustedProxies,
    },
    logger: createLogger('silent'),
    // Keep the per-IP limit out of the way except where it is tested.
    authLimits: {
      ...defaultAuthLimits,
      signInRequestsPerMinute: 1000,
      ...limits,
    },
  });
  return {
    server,
    client: (headers) => createClient(server.url, baseUrl, headers),
    close: async () => {
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function body(response: { body: unknown }): unknown {
  return response.body;
}

function signUpBody(name: string) {
  return { name, email: `${name}@example.test`, password };
}

async function onboardAdmin(h: Harness): Promise<TestClient> {
  const admin = h.client();
  const response = await admin.post('/v1/onboarding', signUpBody('admin'));
  expect(response.status).toBe(201);
  return admin;
}

async function inviteUser(admin: TestClient, h: Harness, name: string) {
  const invite = await admin.post('/v1/invites', {});
  expect(invite.status).toBe(201);
  const token =
    new URL((body(invite) as { url: string }).url).pathname.split('/').pop() ??
    '';
  const user = h.client();
  const accepted = await user.post(
    `/v1/invites/${token}/accept`,
    signUpBody(name),
  );
  return { user, accepted, token };
}

describe('onboarding', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await boot();
  });
  afterAll(() => h.close());

  it('makes the first user an admin and signs them in', async () => {
    const admin = h.client();
    expect(body(await admin.get('/v1/onboarding'))).toEqual({ required: true });

    const created = await admin.post('/v1/onboarding', signUpBody('admin'));
    expect(created.status).toBe(201);
    expect(body(created)).toMatchObject({
      user: {
        email: 'admin@example.test',
        role: 'admin',
        twoFactorEnabled: false,
      },
    });

    const session = await admin.get('/v1/session');
    expect(session.status).toBe(200);
    expect(body(session)).toMatchObject({
      user: { role: 'admin' },
      twoFactorRequired: false,
    });
  });

  it('is closed once an account exists', async () => {
    const other = h.client();
    expect(body(await other.get('/v1/onboarding'))).toEqual({
      required: false,
    });
    const again = await other.post('/v1/onboarding', signUpBody('intruder'));
    expect(again.status).toBe(409);
    expect(body(again)).toMatchObject({ code: 'onboarding_complete' });
  });

  it('rejects a weak password with field errors', async () => {
    const fresh = await boot();
    try {
      const response = await fresh
        .client()
        .post('/v1/onboarding', { ...signUpBody('admin'), password: 'short' });
      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toBe(
        'application/problem+json',
      );
      expect(body(response)).toMatchObject({
        errors: [expect.objectContaining({ path: 'password' })],
      });
    } finally {
      await fresh.close();
    }
  });
});

describe('registration', () => {
  let h: Harness;
  let admin: TestClient;
  beforeAll(async () => {
    h = await boot();
    admin = await onboardAdmin(h);
  });
  afterAll(() => h.close());

  it('blocks public sign-up while invite-only', async () => {
    const response = await h
      .client()
      .post('/v1/auth/sign-up/email', signUpBody('stranger'));
    expect(response.status).toBe(403);
    expect(body(response)).toMatchObject({ code: 'sign_up_disabled' });
  });

  it('signs up a user with a single-use invite', async () => {
    const { user, accepted, token } = await inviteUser(admin, h, 'invitee');
    expect(accepted.status).toBe(201);
    expect(body(accepted)).toMatchObject({ user: { role: 'user' } });
    expect((await user.get('/v1/session')).status).toBe(200);

    const reused = await h
      .client()
      .post(`/v1/invites/${token}/accept`, signUpBody('second'));
    expect(reused.status).toBe(404);
    expect(body(reused)).toMatchObject({ code: 'invite_invalid' });
  });

  it('shows whether an invite link is still valid', async () => {
    const invite = await admin.post('/v1/invites', { expiresInDays: 2 });
    const url = new URL((body(invite) as { url: string }).url);
    expect(url.origin).toBe(baseUrl);
    const token = url.pathname.split('/').pop() ?? '';
    expect((await h.client().get(`/v1/invites/${token}`)).status).toBe(200);
    expect((await h.client().get('/v1/invites/unknown')).status).toBe(404);
  });

  it('lets only admins create invites', async () => {
    const { user } = await inviteUser(admin, h, 'member');
    const response = await user.post('/v1/invites', {});
    expect(response.status).toBe(403);
  });

  it('rejects cookie-authenticated writes from another origin', async () => {
    const evil = 'http://evil.example.test';
    const ours = await admin.request('POST', '/v1/invites', {}, evil);
    expect(ours.status).toBe(403);
    expect(body(ours)).toMatchObject({ code: 'origin_mismatch' });

    const library = await admin.request(
      'POST',
      '/v1/auth/revoke-other-sessions',
      {},
      evil,
    );
    expect(library.status).toBe(403);
  });

  it('refuses invites while registration is closed', async () => {
    const invite = await admin.post('/v1/invites', {});
    const token =
      new URL((body(invite) as { url: string }).url).pathname
        .split('/')
        .pop() ?? '';
    expect(
      (await admin.patch('/v1/admin/settings', { registrationMode: 'closed' }))
        .status,
    ).toBe(200);

    const response = await h
      .client()
      .post(`/v1/invites/${token}/accept`, signUpBody('late'));
    expect(response.status).toBe(403);
    expect(body(response)).toMatchObject({ code: 'registration_closed' });
  });

  it('allows public sign-up in open mode', async () => {
    await admin.patch('/v1/admin/settings', { registrationMode: 'open' });
    const response = await h
      .client()
      .post('/v1/auth/sign-up/email', signUpBody('walkin'));
    expect(response.status).toBe(200);
  });

  it('never lets a client choose its role', async () => {
    const client = h.client();
    const response = await client.post('/v1/auth/sign-up/email', {
      ...signUpBody('climber'),
      role: 'admin',
    });
    if (response.status === 200) {
      expect(body(await client.get('/v1/session'))).toMatchObject({
        user: { role: 'user' },
      });
    } else {
      expect(response.status).toBe(400);
    }
  });
});

describe('two-factor sign-in', () => {
  let h: Harness;
  let admin: TestClient;
  beforeAll(async () => {
    h = await boot();
    admin = await onboardAdmin(h);
  });
  afterAll(() => h.close());

  it('requires a TOTP code after the password once enrolled', async () => {
    const enable = await admin.post('/v1/auth/two-factor/enable', { password });
    expect(enable.status).toBe(200);
    const { totpURI } = body(enable) as { totpURI: string };
    const verify = await admin.post('/v1/auth/two-factor/verify-totp', {
      code: totpFromUri(totpURI),
    });
    expect(verify.status).toBe(200);
    expect(body(await admin.get('/v1/session'))).toMatchObject({
      user: { twoFactorEnabled: true },
    });

    const browser = h.client();
    const signIn = await browser.post('/v1/auth/sign-in/email', {
      email: 'admin@example.test',
      password,
    });
    expect(signIn.status).toBe(200);
    expect(body(signIn)).toMatchObject({ twoFactorRedirect: true });
    expect((await browser.get('/v1/session')).status).toBe(401);

    const wrong = await browser.post('/v1/auth/two-factor/verify-totp', {
      code: '000000' === totpFromUri(totpURI) ? '111111' : '000000',
    });
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('content-type')).toBe('application/problem+json');

    const right = await browser.post('/v1/auth/two-factor/verify-totp', {
      code: totpFromUri(totpURI),
    });
    expect(right.status).toBe(200);
    expect((await browser.get('/v1/session')).status).toBe(200);
  });

  it('lists sessions and revokes one', async () => {
    const sessions = await admin.get('/v1/auth/list-sessions');
    expect(sessions.status).toBe(200);
    const list = body(sessions) as { token: string }[];
    expect(list.length).toBeGreaterThanOrEqual(2);

    const other = h.client();
    await other.post('/v1/auth/sign-in/email', {
      email: 'admin@example.test',
      password,
    });
    const revoke = await admin.post('/v1/auth/revoke-other-sessions', {});
    expect(revoke.status).toBe(200);
    expect((await other.get('/v1/session')).status).toBe(401);
    expect((await admin.get('/v1/session')).status).toBe(200);
  });

  it('holds users without 2FA to enrolment when an admin requires it', async () => {
    const { user } = await inviteUser(admin, h, 'noauth');
    expect(
      (await admin.patch('/v1/admin/settings', { requireTwoFactor: true }))
        .status,
    ).toBe(200);

    expect(body(await user.get('/v1/session'))).toMatchObject({
      twoFactorRequired: true,
      user: { twoFactorEnabled: false },
    });
    const blocked = await user.get('/v1/admin/settings');
    expect(blocked.status).toBe(403);
    expect(body(blocked)).toMatchObject({
      code: 'two_factor_enrollment_required',
    });
  });

  it('keeps 2FA on while the instance requires it', async () => {
    expect(body(await admin.get('/v1/session'))).toMatchObject({
      twoFactorRequired: false,
      twoFactorEnforced: true,
    });
    const refused = await admin.post('/v1/auth/two-factor/disable', {
      password,
    });
    expect(refused.status).toBe(403);
    expect(body(refused)).toMatchObject({ code: 'two_factor_required' });
    expect(body(await admin.get('/v1/session'))).toMatchObject({
      user: { twoFactorEnabled: true },
    });

    await admin.patch('/v1/admin/settings', { requireTwoFactor: false });
    const disabled = await admin.post('/v1/auth/two-factor/disable', {
      password,
    });
    expect(disabled.status).toBe(200);
    expect(body(await admin.get('/v1/session'))).toMatchObject({
      user: { twoFactorEnabled: false },
      twoFactorEnforced: false,
    });
  });
});

describe('sign-in lockout and rate limiting', () => {
  it('locks an account after repeated wrong passwords', async () => {
    const h = await boot();
    try {
      await onboardAdmin(h);
      const attacker = h.client();
      for (let i = 0; i < defaultAuthLimits.signInMaxFailures; i++) {
        const attempt = await attacker.post('/v1/auth/sign-in/email', {
          email: 'admin@example.test',
          password: 'wrong password guess',
        });
        expect(attempt.status).toBe(401);
      }

      const locked = await h.client().post('/v1/auth/sign-in/email', {
        email: 'admin@example.test',
        password,
      });
      expect(locked.status).toBe(429);
      expect(body(locked)).toMatchObject({
        code: 'account_temporarily_locked',
      });
    } finally {
      await h.close();
    }
  });

  it('limits sign-in attempts per client address behind a trusted proxy', async () => {
    // The limiter's memory store is shared by every server in this process,
    // so this test uses its own forwarded address.
    const h = await boot({ signInRequestsPerMinute: 3 }, ['127.0.0.1']);
    try {
      const client = h.client({ 'x-forwarded-for': '198.51.100.23' });
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        const attempt = await client.post('/v1/auth/sign-in/email', {
          email: `nobody${String(i)}@example.test`,
          password: 'wrong password guess',
        });
        statuses.push(attempt.status);
      }
      expect(statuses).toEqual([401, 401, 401, 429]);

      const otherClient = h.client({ 'x-forwarded-for': '198.51.100.24' });
      const other = await otherClient.post('/v1/auth/sign-in/email', {
        email: 'nobody@example.test',
        password: 'wrong password guess',
      });
      expect(other.status).toBe(401);
    } finally {
      await h.close();
    }
  });
});
