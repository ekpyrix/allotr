import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';
import type Database from 'better-sqlite3';

// Forward-only plain SQL migrations (ADR 0004, docs/architecture.md §6).
// All pending files run in one IMMEDIATE transaction: it is the lock that
// stops two processes migrating at once, and a failure leaves the schema
// untouched.

const FILE_NAME = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const DEFAULT_KEEP_BACKUPS = 5;

export type MigrationErrorCode =
  | 'invalid_migration_name'
  | 'checksum_mismatch'
  | 'unknown_applied_migration'
  | 'migration_failed';

export class MigrationError extends Error {
  override readonly name = 'MigrationError';
  readonly code: MigrationErrorCode;

  constructor(
    code: MigrationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
  }
}

export interface MigrateOptions {
  readonly sqlite: Database.Database;
  /** Names the backup files. */
  readonly databasePath: string;
  readonly migrationsDir: string;
  readonly backupDir: string;
  readonly now: () => Date;
  readonly keepBackups?: number;
}

export interface MigrateResult {
  readonly applied: readonly string[];
  readonly backupPath: string | null;
}

interface MigrationFile {
  readonly version: string;
  readonly sql: string;
  readonly checksum: string;
}

export function migrate(options: MigrateOptions): MigrateResult {
  const { sqlite } = options;
  const files = readMigrationFiles(options.migrationsDir);
  const now = options.now();

  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT`);

    const pending = findPending(sqlite, files);
    if (pending.length === 0) {
      sqlite.exec('COMMIT');
      return { applied: [], backupPath: null };
    }

    const hasHistory = files.length > pending.length;
    const backupPath = hasHistory
      ? backUp(options, pending[0]?.version ?? '', now)
      : null;

    const record = sqlite.prepare(
      'INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)',
    );
    for (const migration of pending) {
      try {
        sqlite.exec(migration.sql);
      } catch (error) {
        throw new MigrationError(
          'migration_failed',
          `Migration ${migration.version} failed; no pending migration was applied.`,
          { cause: error },
        );
      }
      record.run(migration.version, migration.checksum, now.toISOString());
    }

    sqlite.exec('COMMIT');
    return { applied: pending.map((m) => m.version), backupPath };
  } catch (error) {
    if (sqlite.inTransaction) sqlite.exec('ROLLBACK');
    throw error;
  }
}

function readMigrationFiles(dir: string): MigrationFile[] {
  const names = readdirSync(dir)
    .filter((name) => extname(name) === '.sql')
    .sort();
  const numbers = new Set<string>();

  return names.map((name) => {
    const number = FILE_NAME.exec(name)?.[1];
    if (number === undefined) {
      throw new MigrationError(
        'invalid_migration_name',
        `Migration file ${name} must be named NNNN_lower_snake_case.sql.`,
      );
    }
    if (numbers.has(number)) {
      throw new MigrationError(
        'invalid_migration_name',
        `More than one migration uses number ${number}.`,
      );
    }
    numbers.add(number);

    const sql = readFileSync(join(dir, name), 'utf8');
    return {
      version: basename(name, '.sql'),
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    };
  });
}

function findPending(
  sqlite: Database.Database,
  files: readonly MigrationFile[],
): MigrationFile[] {
  const applied = new Map(
    (
      sqlite
        .prepare('SELECT version, checksum FROM schema_migrations')
        .all() as { version: string; checksum: string }[]
    ).map((row) => [row.version, row.checksum]),
  );
  const known = new Set(files.map((file) => file.version));

  for (const version of applied.keys()) {
    if (!known.has(version)) {
      throw new MigrationError(
        'unknown_applied_migration',
        `The database has migration ${version}, which this release does not know. It was written by a newer release; restore a backup or upgrade.`,
      );
    }
  }

  return files.filter((file) => {
    const checksum = applied.get(file.version);
    if (checksum === undefined) return true;
    if (checksum !== file.checksum) {
      throw new MigrationError(
        'checksum_mismatch',
        `Migration ${file.version} changed after it was applied. Migrations are forward-only; add a new file instead.`,
      );
    }
    return false;
  });
}

// Copies the database as the current connection sees it, inside the lock.
function backUp(
  options: MigrateOptions,
  nextVersion: string,
  now: Date,
): string {
  const base = basename(options.databasePath, extname(options.databasePath));
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const path = join(
    options.backupDir,
    `${base}-${stamp}-pre-${nextVersion}.sqlite`,
  );

  mkdirSync(options.backupDir, { recursive: true, mode: 0o700 });
  writeFileSync(path, options.sqlite.serialize(), { flag: 'wx', mode: 0o600 });

  // Names start with a UTC timestamp, so name order is age order.
  const backups = readdirSync(options.backupDir)
    .filter((name) => name.startsWith(`${base}-`) && name.includes('-pre-'))
    .sort();
  const keep = options.keepBackups ?? DEFAULT_KEEP_BACKUPS;
  for (const name of backups.slice(0, Math.max(0, backups.length - keep))) {
    rmSync(join(options.backupDir, name));
  }

  return path;
}
