import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, MigrationError, type MigrateOptions } from './migrate.ts';
import { openSqlite } from './sqlite.ts';

const repoMigrations = join(import.meta.dirname, '../../../../migrations');

let dir: string;
let migrationsDir: string;
let backupDir: string;
let databasePath: string;
let open: Database.Database[];
let clock: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'allotr-migrate-'));
  migrationsDir = join(dir, 'migrations');
  backupDir = join(dir, 'backups');
  databasePath = join(dir, 'allotr.db');
  open = [];
  clock = Date.UTC(2026, 0, 1, 12, 0, 0);
  mkdirSync(migrationsDir);
});

afterEach(() => {
  for (const db of open) db.close();
  rmSync(dir, { recursive: true, force: true });
});

function connect(path = databasePath): Database.Database {
  const db = openSqlite(path);
  open.push(db);
  return db;
}

function addMigration(name: string, sql: string): void {
  writeFileSync(join(migrationsDir, name), sql);
}

function run(
  sqlite: Database.Database,
  overrides: Partial<MigrateOptions> = {},
) {
  return migrate({
    sqlite,
    databasePath,
    migrationsDir,
    backupDir,
    now: () => new Date((clock += 60_000)),
    ...overrides,
  });
}

function tables(sqlite: Database.Database): string[] {
  return sqlite
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .pluck()
    .all() as string[];
}

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof MigrationError) return error.code;
    throw error;
  }
  return undefined;
}

describe('migrate', () => {
  it('applies pending migrations in order on a fresh database without a backup', () => {
    addMigration(
      '0002_b.sql',
      'CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;',
    );
    addMigration(
      '0001_a.sql',
      'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
    );
    addMigration('README.md', 'not a migration');
    const sqlite = connect();

    const result = run(sqlite);

    expect(result).toEqual({ applied: ['0001_a', '0002_b'], backupPath: null });
    expect(tables(sqlite)).toEqual(['a', 'b', 'schema_migrations']);
  });

  it('does nothing when every migration is applied', () => {
    addMigration(
      '0001_a.sql',
      'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
    );
    const sqlite = connect();
    run(sqlite);

    expect(run(sqlite)).toEqual({ applied: [], backupPath: null });
    expect(readdirSync(dir)).not.toContain('backups');
  });

  it('backs up the previous schema before applying new migrations', () => {
    addMigration(
      '0001_a.sql',
      'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
    );
    const sqlite = connect();
    run(sqlite);
    sqlite.prepare('INSERT INTO a (id) VALUES (7)').run();
    addMigration(
      '0002_b.sql',
      'CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;',
    );

    const result = run(sqlite);

    expect(result.applied).toEqual(['0002_b']);
    expect(result.backupPath).toBe(
      join(backupDir, 'allotr-20260101T120200Z-pre-0002_b.sqlite'),
    );
    const backup = connect(result.backupPath ?? '');
    expect(tables(backup)).toEqual(['a', 'schema_migrations']);
    expect(backup.prepare('SELECT id FROM a').pluck().all()).toEqual([7]);
  });

  it('keeps only the newest five backups', () => {
    const sqlite = connect();
    const backups: string[] = [];
    for (let n = 1; n <= 8; n++) {
      addMigration(
        `000${String(n)}_t${String(n)}.sql`,
        `CREATE TABLE t${String(n)} (id INTEGER PRIMARY KEY) STRICT;`,
      );
      const { backupPath } = run(sqlite);
      if (backupPath !== null) backups.push(backupPath);
    }

    expect(backups).toHaveLength(7);
    expect(readdirSync(backupDir).map((name) => join(backupDir, name))).toEqual(
      backups.slice(-5),
    );
  });

  it('rolls back every pending migration when one fails', () => {
    addMigration(
      '0001_a.sql',
      'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
    );
    addMigration('0002_broken.sql', 'CREATE TABLE oops (;');
    const sqlite = connect();

    expect(codeOf(() => run(sqlite))).toBe('migration_failed');
    expect(tables(sqlite)).toEqual([]);
  });

  it('refuses to run when an applied migration was edited', () => {
    addMigration(
      '0001_a.sql',
      'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
    );
    const sqlite = connect();
    run(sqlite);
    addMigration('0001_a.sql', 'CREATE TABLE a (id TEXT PRIMARY KEY) STRICT;');

    expect(codeOf(() => run(sqlite))).toBe('checksum_mismatch');
  });

  it('refuses to run when the database has migrations this release lacks', () => {
    addMigration(
      '0001_a.sql',
      'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
    );
    addMigration(
      '0002_b.sql',
      'CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;',
    );
    const sqlite = connect();
    run(sqlite);
    rmSync(join(migrationsDir, '0002_b.sql'));

    expect(codeOf(() => run(sqlite))).toBe('unknown_applied_migration');
  });

  it.each([
    ['a name without a number', 'create_a.sql'],
    ['upper case letters', '0001_Create.sql'],
  ])('rejects a file with %s', (_, name) => {
    addMigration(name, 'SELECT 1;');
    expect(codeOf(() => run(connect()))).toBe('invalid_migration_name');
  });

  it('rejects two migrations with the same number', () => {
    addMigration('0001_a.sql', 'SELECT 1;');
    addMigration('0001_b.sql', 'SELECT 1;');
    expect(codeOf(() => run(connect()))).toBe('invalid_migration_name');
  });

  it('waits for the write lock held by another connection', () => {
    addMigration(
      '0001_a.sql',
      'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
    );
    const holder = connect();
    holder.exec('BEGIN IMMEDIATE');
    const sqlite = connect();
    sqlite.pragma('busy_timeout = 50');

    expect(() => run(sqlite)).toThrow(/locked|busy/i);

    holder.exec('ROLLBACK');
    expect(run(sqlite).applied).toEqual(['0001_a']);
  });

  it('applies the repository migrations as STRICT tables', () => {
    const sqlite = connect();
    run(sqlite, { migrationsDir: repoMigrations });

    const nonStrict = sqlite
      .prepare(
        "SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%' AND strict = 0",
      )
      .pluck()
      .all();
    expect(nonStrict).toEqual([]);
    expect(tables(sqlite)).toContain('instance_settings');
  });
});
