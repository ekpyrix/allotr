import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import type { Config } from './config.ts';
import { migrate } from './db/migrate.ts';
import { createKysely, openSqlite } from './db/sqlite.ts';
import { createApp } from './http/app.ts';
import type { Logger } from './logger.ts';

const repoMigrations = join(import.meta.dirname, '../../../migrations');

export interface StartOptions {
  readonly config: Config;
  readonly logger: Logger;
  readonly migrationsDir?: string;
  readonly now?: () => Date;
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

  const sqlite = openSqlite(config.databasePath);
  try {
    const result = migrate({
      sqlite,
      databasePath: config.databasePath,
      migrationsDir: options.migrationsDir ?? repoMigrations,
      backupDir: join(dirname(config.databasePath), 'backups'),
      now: options.now ?? (() => new Date()),
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
  const app = createApp({ db, logger });
  const { server, address } = await listen(app.fetch, config.host, config.port);

  const host =
    address.family === 'IPv6' ? `[${address.address}]` : address.address;
  const url = `http://${host}:${String(address.port)}`;
  logger.info({ url }, 'server listening');

  return {
    url,
    close: async () => {
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
