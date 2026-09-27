import { describe, expect, it } from 'vitest';
import { createSession, problemOf, UnreachableError } from './http.ts';
import { fakeFetch, json, problem } from './testing/fake-fetch.ts';

describe('createSession', () => {
  it('posts JSON with the server origin', async () => {
    const fake = fakeFetch({ 'POST /v1/import': () => json(201, { ok: 1 }) });
    const session = createSession('https://allotr.example.test', fake.fetch);
    const response = await session.post('/v1/import', { a: 1 });
    expect(response).toEqual({ status: 201, body: { ok: 1 } });
    const [request] = fake.requests;
    expect(request?.headers.get('origin')).toBe('https://allotr.example.test');
    expect(request?.headers.get('content-type')).toBe('application/json');
    expect(request?.body).toEqual({ a: 1 });
  });

  it('sends an empty object when no body is given', async () => {
    const fake = fakeFetch({ 'POST /v1/auth/sign-out': () => json(200, {}) });
    await createSession('https://allotr.example.test', fake.fetch).post(
      '/v1/auth/sign-out',
    );
    expect(fake.requests[0]?.body).toEqual({});
  });

  it('keeps a sub-path and drops a trailing slash', async () => {
    const fake = fakeFetch({
      'POST /allotr/v1/import': () => json(201, {}),
    });
    const session = createSession(
      'https://host.example.test/allotr/',
      fake.fetch,
    );
    expect((await session.post('/v1/import', {})).status).toBe(201);
    expect(fake.requests[0]?.url).toBe(
      'https://host.example.test/allotr/v1/import',
    );
    expect(fake.requests[0]?.headers.get('origin')).toBe(
      'https://host.example.test',
    );
  });

  it('keeps cookies between requests and drops expired ones', async () => {
    const fake = fakeFetch({
      'POST /a': () =>
        json(200, {}, ['sid=s1; Path=/; HttpOnly', 'tf=t1; Path=/']),
      'POST /b': () => json(200, {}, ['tf=; Max-Age=0; Path=/']),
      'POST /c': () => json(200, {}),
    });
    const session = createSession('https://allotr.example.test', fake.fetch);
    await session.post('/a');
    await session.post('/b');
    await session.post('/c');
    expect(fake.requests[1]?.headers.get('cookie')).toBe('sid=s1; tf=t1');
    expect(fake.requests[2]?.headers.get('cookie')).toBe('sid=s1');
  });

  it('gives an undefined body for a non-JSON answer', async () => {
    const fake = fakeFetch({
      'POST /v1/import': () =>
        new Response('<html>Bad Gateway</html>', { status: 502 }),
    });
    const response = await createSession(
      'https://allotr.example.test',
      fake.fetch,
    ).post('/v1/import', {});
    expect(response).toEqual({ status: 502, body: undefined });
    expect(problemOf(response)).toBeNull();
  });

  it('wraps a network failure', async () => {
    const failing = (() =>
      Promise.reject(new TypeError('fetch failed'))) as typeof fetch;
    const session = createSession('https://allotr.example.test', failing);
    await expect(session.post('/v1/import', {})).rejects.toBeInstanceOf(
      UnreachableError,
    );
  });
});

describe('problemOf', () => {
  it('reads problem details', async () => {
    const fake = fakeFetch({
      'POST /v1/import': () =>
        problem(409, 'Conflict', { code: 'ledger_not_empty', detail: 'Full.' }),
    });
    const response = await createSession(
      'https://allotr.example.test',
      fake.fetch,
    ).post('/v1/import', {});
    expect(problemOf(response)).toMatchObject({
      status: 409,
      code: 'ledger_not_empty',
      detail: 'Full.',
    });
  });
});
