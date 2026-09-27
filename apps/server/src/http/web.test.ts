import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/app.ts';
import { createTestDatabase } from '../testing/database.ts';

let dir: string;
let app: ReturnType<typeof createTestApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'allotr-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><title>Allotr</title>',
  );
  writeFileSync(join(dir, 'assets', 'app-1234.js'), 'console.log(1)');
  app = createTestApp(createTestDatabase(), { webDir: dir });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const page = { headers: { accept: 'text/html' } };

describe('web app serving', () => {
  it('serves index.html for app routes with a strict CSP', async () => {
    const response = await app.request('/today', page);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>Allotr</title>');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('caches hashed assets for a year', async () => {
    const response = await app.request('/assets/app-1234.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('immutable');
  });

  it('keeps API misses as problem details', async () => {
    const response = await app.request('/v1/nothing-here', page);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
  });

  it('does not answer missing assets with the app page', async () => {
    const response = await app.request('/assets/missing.js', page);
    expect(response.status).toBe(404);
  });
});
