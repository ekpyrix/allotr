import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from './logger.ts';
import { startServer, type RunningServer } from './server.ts';

let dir: string;
let databasePath: string;
let server: RunningServer;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'allotr-server-'));
  databasePath = join(dir, 'data', 'allotr.db');
  server = await startServer({
    config: {
      databasePath,
      baseUrl: 'http://allotr.example.test',
      secretKey: 'fake-secret-key-for-tests-0123456789',
      host: '127.0.0.1',
      port: 0,
      reminderIntervalSeconds: 900,
      logLevel: 'silent',
      trustedProxies: [],
    },
    logger: createLogger('silent'),
  });
});

afterAll(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

function get(path: string): Promise<Response> {
  return fetch(new URL(path, server.url));
}

describe('server on a temporary database', () => {
  it('reports liveness', async () => {
    const response = await get('/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('reports readiness once migrations are applied', async () => {
    const response = await get('/readyz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
  });

  it('serves an OpenAPI 3.1 document listing the routes', async () => {
    const response = await get('/openapi.json');
    expect(response.status).toBe(200);
    const document = (await response.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/healthz',
        '/readyz',
        '/v1/accounts',
        '/v1/accounts/{id}',
        '/v1/accounts/{id}/archive',
        '/v1/categories',
        '/v1/categories/{id}',
        '/v1/tags',
        '/v1/tags/{id}',
        '/v1/transactions',
        '/v1/transactions/{id}',
        '/v1/transactions/{id}/reverse',
        '/v1/transactions/{id}/edit',
        '/v1/today',
        '/v1/settings/ledger',
        '/v1/rates',
        '/v1/rates/{id}',
        '/v1/bills',
        '/v1/bills/{id}',
        '/v1/bills/{id}/payments',
        '/v1/bills/{id}/payments/{dueOn}',
      ]),
    );
  });

  it('answers unknown routes with an RFC 9457 problem', async () => {
    const response = await get('/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    expect(await response.json()).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
    });
  });

  it('creates the database in WAL mode with the migrations applied', () => {
    const sqlite = new Database(databasePath, { readonly: true });
    try {
      expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
      const versions = sqlite
        .prepare('SELECT version FROM schema_migrations')
        .pluck()
        .all();
      expect(versions).toContain('0001_instance_settings');
    } finally {
      sqlite.close();
    }
  });
});
