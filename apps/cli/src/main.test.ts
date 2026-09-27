import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';

// Runs the real entry point in a child process. Nothing reaches a server:
// help needs none, and without a terminal the CLI stops before sign-in.

const main = join(import.meta.dirname, 'main.ts');
const dir = mkdtempSync(join(tmpdir(), 'allotr-cli-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

it('prints help', () => {
  const result = spawnSync(process.execPath, [main, '--help'], {
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('allotr import <file.json>');
});

it('refuses to ask for a password without a terminal', () => {
  const file = join(dir, 'month.json');
  writeFileSync(file, JSON.stringify({ format: 'allotr.bundle', version: 1 }));
  const result = spawnSync(
    process.execPath,
    [
      main,
      'import',
      file,
      '--server',
      'http://127.0.0.1:9',
      '--email',
      'a@example.test',
    ],
    { encoding: 'utf8', input: '' },
  );
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('interactive terminal');
});
