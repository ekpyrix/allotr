import type { Kysely } from 'kysely';
import { createAuth } from '../auth/auth.ts';
import { defaultAuthLimits } from '../auth/limits.ts';
import type { Config } from '../config.ts';
import type { DB } from '../db/schema.ts';
import { createApp } from '../http/app.ts';
import { createLogger } from '../logger.ts';

export const testConfig: Config = {
  databasePath: ':memory:',
  baseUrl: 'http://allotr.example.test',
  secretKey: 'fake-secret-key-for-tests-0123456789',
  host: '127.0.0.1',
  port: 0,
  logLevel: 'silent',
  trustedProxies: [],
};

// The app wired to a database, without a listening socket.
export function createTestApp(
  db: Kysely<DB>,
  options: { webDir?: string } = {},
) {
  const logger = createLogger('silent');
  const now = () => new Date();
  const limits = defaultAuthLimits;
  const auth = createAuth({ db, config: testConfig, limits, logger, now });
  return createApp({
    db,
    auth,
    config: testConfig,
    limits,
    logger,
    now,
    ...(options.webDir === undefined ? {} : { webDir: options.webDir }),
  });
}
