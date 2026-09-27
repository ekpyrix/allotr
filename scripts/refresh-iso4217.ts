// Refreshes the vendored ISO 4217 table. Run `pnpm iso4217:refresh`, review
// the diff and commit it. This is the only place that downloads the list.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ISO4217_URL, parseIso4217Xml } from './iso4217.ts';

const target = join(
  import.meta.dirname,
  '../packages/shared/src/money/iso4217.json',
);
const response = await fetch(ISO4217_URL);
if (!response.ok) {
  throw new Error(`Download failed with HTTP ${String(response.status)}`);
}
const table = parseIso4217Xml(await response.text());
writeFileSync(target, `${JSON.stringify(table, null, 2)}\n`);
console.log(
  `Wrote ${String(table.currencies.length)} currencies (list of ${table.published})`,
);
