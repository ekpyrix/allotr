import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import type { Config } from './config.ts';
import { migrate } from './db/migrate.ts';
import { createAuth } from './auth/auth.ts';
import { defaultAuthLimits, type AuthLimits } from './auth/limits.ts';
import { createKysely, openSqlite } from './db/sqlite.ts';
import { createApp } from './http/app.ts';
import { createPushService } from './push/service.ts';
import { startScheduler } from './scheduler.ts';
import type { PushSender } from './push/delivery.ts';
import type { Logger } from './logger.ts';

const repoMigrations = join(import.meta.dirname, '../../../migrations');
const repoWebDir = join(import.meta.dirname, '../../web/dist');

export interface StartOptions {
  readonly config: Config;
  readonly logger: Logger;
  readonly migrationsDir?: string;
  readonly now?: () => Date;
  readonly authLimits?: AuthLimits;
  readonly webDir?: string;
  /** Replaces the network for theme URL imports in tests. */
  readonly fetchThemeUrl?: (url: string) => Promise<string>;
  /** Replaces the network for Web Push in tests. */
  readonly sendPush?: PushSender;
  /** Milliseconds between reminder runs; the default is 15 minutes. */
  readonly reminderIntervalMs?: number;
}

export interface RunningServer {
  readonly url: string;
  close(): Promise<void>;
}

// Opens the database, migrates it behind the write lock, then listens.
export async function startServer(
  options: StartOptions,
): Promise<RunningServer> {
  const { config, logger } = options;
  const now = options.now ?? (() => new Date());
  const limits = options.authLimits ?? {
    ...defaultAuthLimits,
    signInRequestsPerMinute: config.signInRequestsPerMinute,
  };

  const sqlite = openSqlite(config.databasePath);
  try {
    const result = migrate({
      sqlite,
      databasePath: config.databasePath,
      migrationsDir: options.migrationsDir ?? repoMigrations,
      backupDir: join(dirname(config.databasePath), 'backups'),
      now,
    });
    if (result.backupPath !== null) {
      logger.info(
        { backupPath: result.backupPath },
        'database backed up before migrating',
      );
    }
    if (result.applied.length > 0) {
      logger.info({ applied: result.applied }, 'migrations applied');
    }
  } catch (error) {
    sqlite.close();
    throw error;
  }

  const db = createKysely(sqlite);
  const auth = createAuth({ db, config, limits, logger, now });
  const push = createPushService(db, config.baseUrl, now, options.sendPush);
  // The VAPID keys are made at first start and kept with the instance secrets.
  await push.publicKey();
  const app = createApp({
    db,
    auth,
    config,
    limits,
    logger,
    now,
    push,
    webDir: options.webDir ?? repoWebDir,
    ...(options.fetchThemeUrl === undefined
      ? {}
      : { fetchThemeUrl: options.fetchThemeUrl }),
  });
  const { server, address } = await listen(app.fetch, config.host, config.port);

  const host =
    address.family === 'IPv6' ? `[${address.address}]` : address.address;
  const url = `http://${host}:${String(address.port)}`;
  logger.info({ url }, 'server listening');

  const stopScheduler = startScheduler({
    db,
    send: push.send,
    now,
    logger,
    intervalMs:
      options.reminderIntervalMs ?? config.reminderIntervalSeconds * 1000,
  });

  return {
    url,
    close: async () => {
      stopScheduler();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await db.destroy();
    },
  };
}

function listen(
  fetch: (request: Request) => Response | Promise<Response>,
  hostname: string,
  port: number,
): Promise<{ server: ServerType; address: AddressInfo }> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch, hostname, port }, (address) => {
      resolve({ server, address });
    });
    server.once('error', reject);
  });
}
