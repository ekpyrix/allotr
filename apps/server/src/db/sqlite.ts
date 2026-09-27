import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { DB } from './schema.ts';

// ADR 0004: WAL, foreign keys on, STRICT tables (declared in migrations).
export function openSqlite(path: string): Database.Database {
  if (path !== ':memory:')
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  return sqlite;
}

export function createKysely(sqlite: Database.Database): Kysely<DB> {
  return new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) });
}
