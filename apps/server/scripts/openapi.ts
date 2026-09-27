// Writes the generated OpenAPI document to docs/openapi.json, so API changes
// show up in review and clients can check their calls against it.
// `--verify` fails instead of writing when the committed file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp } from '../src/testing/app.ts';
import { createTestDatabase } from '../src/testing/database.ts';

const target = join(import.meta.dirname, '../../../docs/openapi.json');
const db = createTestDatabase();
const response = await createTestApp(db).request('/openapi.json');
const text = `${JSON.stringify(await response.json(), null, 2)}\n`;
await db.destroy();

if (process.argv.includes('--verify')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // Missing counts as stale.
  }
  if (current !== text) {
    console.error(
      'docs/openapi.json is stale; run `pnpm --filter @allotr/server openapi:write`.',
    );
    process.exit(1);
  }
} else {
  writeFileSync(target, text);
}
