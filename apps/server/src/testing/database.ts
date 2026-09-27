import { join } from 'node:path';
import type { Kysely } from 'kysely';
import { migrate } from '../db/migrate.ts';
import type { DB } from '../db/schema.ts';
import { createKysely, openSqlite } from '../db/sqlite.ts';

export const repoMigrations = join(
  import.meta.dirname,
  '../../../../migrations',
);

// A migrated in-memory database for tests.
export function createTestDatabase(): Kysely<DB> {
  const sqlite = openSqlite(':memory:');
  migrate({
    sqlite,
    databasePath: ':memory:',
    migrationsDir: repoMigrations,
    backupDir: '/nonexistent',
    now: () => new Date(0),
  });
  return createKysely(sqlite);
}

export async function insertUser(
  db: Kysely<DB>,
  id: string,
  role: 'admin' | 'user' = 'user',
): Promise<void> {
  await db
    .insertInto('users')
    .values({
      id,
      name: `Test ${id}`,
      email: `${id}@example.test`,
      role,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    .execute();
}
