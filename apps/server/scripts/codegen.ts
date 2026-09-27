// Regenerates src/db/schema.ts from the migrations with kysely-codegen.
// `--verify` fails instead of writing when the committed file is stale.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../src/db/migrate.ts';
import { openSqlite } from '../src/db/sqlite.ts';

const root = join(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'allotr-codegen-'));
const databasePath = join(dir, 'schema.db');

try {
  const sqlite = openSqlite(databasePath);
  migrate({
    sqlite,
    databasePath,
    migrationsDir: join(root, '../../migrations'),
    backupDir: join(dir, 'backups'),
    now: () => new Date(0),
  });
  sqlite.close();

  execFileSync(
    'kysely-codegen',
    [
      '--dialect=sqlite',
      `--url=${databasePath}`,
      `--out-file=${join(root, 'src/db/schema.ts')}`,
      ...process.argv.slice(2).filter((arg) => arg === '--verify'),
    ],
    { cwd: root, stdio: 'inherit' },
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
