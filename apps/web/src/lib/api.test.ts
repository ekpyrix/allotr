import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, call, endpoint, NetworkError } from './api.ts';

const tag = endpoint({
  method: 'GET',
  path: '/v1/tags/{id}',
  response: z.object({ id: z.string() }),
});
const list = endpoint({
  method: 'GET',
  path: '/v1/transactions',
  response: z.object({ items: z.array(z.unknown()) }),
});
const create = endpoint({
  method: 'POST',
  path: '/v1/tags',
  body: z.object({ name: z.string() }),
  response: z.object({ id: z.string() }),
});

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('call', () => {
  it('fills and encodes path parameters', async () => {
    const fetchMock = respond(200, { id: 'a b' });
    await call(tag, { params: { id: 'a b' } });
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/tags/a%20b',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
  });

  it('adds defined query values only', async () => {
    const fetchMock = respond(200, { items: [] });
    await call(list, { query: { limit: 20, category: undefined, q: 'a&b' } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/v1/transactions?limit=20&q=a%26b',
    );
  });

  it('sends a JSON body', async () => {
    const fetchMock = respond(201, { id: 't1' });
    await call(create, { body: { name: 'Food' } });
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/tags',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"Food"}',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('validates the response', async () => {
    respond(200, { id: 42 });
    await expect(call(tag, { params: { id: 'x' } })).rejects.toThrow();
  });

  it('turns problem responses into ApiError', async () => {
    respond(409, {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      code: 'already_reversed',
    });
    const error: unknown = await call(tag, { params: { id: 'x' } }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.code).toBe('already_reversed');
  });

  it('keeps a status for problems without a body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('oops', { status: 502 }))),
    );
    await expect(call(tag, { params: { id: 'x' } })).rejects.toMatchObject({
      status: 502,
    });
  });

  it('turns fetch failures into NetworkError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    );
    await expect(call(tag, { params: { id: 'x' } })).rejects.toBeInstanceOf(
      NetworkError,
    );
  });
});
