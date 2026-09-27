import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createKysely } from '../db/sqlite.ts';
import { createTestApp } from '../testing/app.ts';

function appWith(sqlite: Database.Database) {
  return createTestApp(createKysely(sqlite));
}

describe('createApp', () => {
  it('hides internal errors behind a generic problem', async () => {
    const app = appWith(new Database(':memory:'));
    app.get('/boom', () => {
      throw new Error('secret internal detail');
    });

    const response = await app.request('/boom');

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
    });
    expect(body).not.toContain('secret internal detail');
  });

  it('reports not ready when the database is unavailable', async () => {
    const sqlite = new Database(':memory:');
    const app = appWith(sqlite);
    sqlite.close();

    const response = await app.request('/readyz');

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      type: 'about:blank',
      title: 'Service Unavailable',
      status: 503,
      detail: 'The database is not reachable.',
    });
  });
});
