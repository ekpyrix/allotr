import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findViolations, type Workspace } from './workspace-deps.ts';

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const root = join(import.meta.dirname, '..');

function readWorkspaces(dir: string, kind: Workspace['kind']): Workspace[] {
  return readdirSync(join(root, dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = join(root, dir, entry.name, 'package.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
      return {
        name: manifest.name,
        kind,
        dependencies: Object.keys({
          ...manifest.dependencies,
          ...manifest.devDependencies,
        }),
      };
    });
}

const violations = findViolations([
  ...readWorkspaces('packages', 'package'),
  ...readWorkspaces('apps', 'app'),
]);

if (violations.length > 0) {
  console.error('Workspace dependency direction violated:');
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exitCode = 1;
}
