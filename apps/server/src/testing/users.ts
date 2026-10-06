import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { Kysely } from 'kysely';
import { defaultAuthLimits } from '../auth/limits.ts';
import type { DB } from '../db/schema.ts';
import { createKysely, openSqlite } from '../db/sqlite.ts';
import { createLogger } from '../logger.ts';
import type { PushSender } from '../push/delivery.ts';
import { startServer, type RunningServer } from '../server.ts';
import { createClient, type TestClient } from './http-client.ts';

// A running server with two signed-in users, for API integration tests.

const baseUrl = 'http://allotr.example.test';
const password = 'correct horse battery staple';

export interface TwoUsers {
  readonly server: RunningServer;
  /** A second connection to the server's database, for setup and checks. */
  readonly db: Kysely<DB>;
  /** The administrator who onboarded the instance. */
  readonly alice: TestClient;
  /** A second user who joined by invite. */
  readonly bob: TestClient;
  close(): Promise<void>;
}

function signUp(name: string) {
  return { name, email: `${name}@example.test`, password };
}

/** `now` fixes the server's clock, for tests of the user's calendar day. */
export async function startWithTwoUsers(
  options: {
    now?: () => Date;
    fetchThemeUrl?: (url: string) => Promise<string>;
    /** Web Push never reaches the network in tests. */
    sendPush?: PushSender;
  } = {},
): Promise<TwoUsers> {
  const dir = mkdtempSync(join(tmpdir(), 'allotr-api-'));
  const server = await startServer({
    config: {
      databasePath: join(dir, 'allotr.db'),
      baseUrl,
      secretKey: 'fake-secret-key-for-tests-0123456789',
      host: '127.0.0.1',
      port: 0,
      reminderIntervalSeconds: 900,
      signInRequestsPerMinute: 10,
      logLevel: 'silent',
      trustedProxies: [],
    },
    logger: createLogger('silent'),
    authLimits: { ...defaultAuthLimits, signInRequestsPerMinute: 1000 },
    sendPush: options.sendPush ?? (() => Promise.resolve('failed')),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.fetchThemeUrl === undefined
      ? {}
      : { fetchThemeUrl: options.fetchThemeUrl }),
  });
  const alice = createClient(server.url, baseUrl);
  expect((await alice.post('/v1/onboarding', signUp('alice'))).status).toBe(
    201,
  );
  const invite = await alice.post('/v1/invites', {});
  const token = new URL((invite.body as { url: string }).url).pathname
    .split('/')
    .pop();
  const bob = createClient(server.url, baseUrl);
  expect(
    (await bob.post(`/v1/invites/${token ?? ''}/accept`, signUp('bob'))).status,
  ).toBe(201);
  const db = createKysely(openSqlite(join(dir, 'allotr.db')));
  return {
    server,
    db,
    alice,
    bob,
    close: async () => {
      await db.destroy();
      await server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function userIdOf(client: TestClient): Promise<string> {
  const session = await client.get('/v1/session');
  return (session.body as { user: { id: string } }).user.id;
}
