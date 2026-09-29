import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// Builds src/sw/worker.ts to /sw.js and writes the list of files it
// precaches: everything in the build output except the worker itself and
// source maps. The version is a hash of those files, so any change to the
// build is a new worker and the update prompt appears.

const WORKER = 'sw.js';
const PLACEHOLDER = /(["'`])__ALLOTR_PRECACHE__\1/;

export interface BuiltFile {
  /** URL path, starting with '/'. */
  path: string;
  content: Uint8Array;
}

export function precacheManifest(built: BuiltFile[]) {
  const files = built
    .filter(({ path }) => path !== `/${WORKER}` && !path.endsWith('.map'))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const { path, content } of files) {
    hash.update(path).update('\0').update(content).update('\0');
  }
  return {
    version: hash.digest('hex').slice(0, 16),
    files: files.map(({ path }) => path),
  };
}

export function injectPrecache(
  code: string,
  manifest: ReturnType<typeof precacheManifest>,
): string {
  if (!PLACEHOLDER.test(code))
    throw new Error(`${WORKER}: precache placeholder not found`);
  return code.replace(PLACEHOLDER, () =>
    JSON.stringify(JSON.stringify(manifest)),
  );
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

export function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'allotr:service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    buildStart() {
      this.emitFile({
        type: 'chunk',
        id: fileURLToPath(new URL('../src/sw/worker.ts', import.meta.url)),
        fileName: WORKER,
      });
    },
    // After every file, public ones included, is on disk.
    async closeBundle() {
      const paths = await listFiles(outDir);
      const built = await Promise.all(
        paths.map(async (file) => ({
          path: `/${relative(outDir, file).split(sep).join('/')}`,
          content: await readFile(file),
        })),
      );
      const worker = join(outDir, WORKER);
      const code = await readFile(worker, 'utf8');
      await writeFile(worker, injectPrecache(code, precacheManifest(built)));
    },
  };
}
