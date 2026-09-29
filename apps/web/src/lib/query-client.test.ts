import { onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from './api.ts';
import {
  createQueryClient,
  queryOrCached,
  shouldRetry,
} from './query-client.ts';

const problem = (status: number) =>
  new ApiError({ type: 'about:blank', title: 'T', status });

describe('shouldRetry', () => {
  it('retries network failures, 5xx and 429 at most twice', () => {
    for (const error of [new NetworkError(null), problem(503), problem(429)]) {
      expect(shouldRetry(0, error)).toBe(true);
      expect(shouldRetry(1, error)).toBe(true);
      expect(shouldRetry(2, error)).toBe(false);
    }
  });

  it('never retries other client errors or invalid responses', () => {
    for (const error of [400, 401, 403, 404, 409].map(problem))
      expect(shouldRetry(0, error)).toBe(false);
    expect(shouldRetry(0, new Error('schema mismatch'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('reports a 401 from a query or a mutation', async () => {
    const onUnauthorized = vi.fn();
    const client = createQueryClient({ onUnauthorized });
    await client
      .query({
        queryKey: ['x'],
        queryFn: () => Promise.reject(problem(401)),
      })
      .catch(() => undefined);
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(problem(401)) })
      .execute(undefined)
      .catch(() => undefined);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });

  it('ignores other errors and does not retry mutations', async () => {
    const onUnauthorized = vi.fn();
    const client = createQueryClient({ onUnauthorized });
    const mutationFn = vi.fn(() => Promise.reject(problem(503)));
    await client
      .getMutationCache()
      .build(client, { mutationFn })
      .execute(undefined)
      .catch(() => undefined);
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('fails a write made offline instead of holding it for later', async () => {
    const client = createQueryClient({ onUnauthorized: vi.fn() });
    onlineManager.setOnline(false);
    try {
      const mutationFn = vi.fn(() => Promise.reject(new NetworkError(null)));
      await expect(
        client
          .getMutationCache()
          .build(client, { mutationFn })
          .execute(undefined),
      ).rejects.toBeInstanceOf(NetworkError);
      expect(mutationFn).toHaveBeenCalledTimes(1);
    } finally {
      onlineManager.setOnline(true);
    }
  });
});

describe('queryOrCached', () => {
  const options = {
    queryKey: ['thing'],
    queryFn: () => Promise.reject(new NetworkError(null)),
    staleTime: 0,
    retry: false,
  } as const;

  it('keeps the cached value when a refetch cannot reach the server', async () => {
    const client = new QueryClient();
    client.setQueryData(['thing'], 'cached', { updatedAt: 0 });
    await expect(queryOrCached(client, options)).resolves.toBe('cached');
  });

  it('keeps the cached value when the server fails', async () => {
    const client = new QueryClient();
    client.setQueryData(['thing'], 'cached', { updatedAt: 0 });
    await expect(
      queryOrCached(client, {
        ...options,
        queryFn: () => Promise.reject(problem(503)),
      }),
    ).resolves.toBe('cached');
  });

  it('rethrows a 401 even with a cached value', async () => {
    const client = new QueryClient();
    client.setQueryData(['thing'], 'cached', { updatedAt: 0 });
    await expect(
      queryOrCached(client, {
        ...options,
        queryFn: () => Promise.reject(problem(401)),
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rethrows when nothing is cached', async () => {
    await expect(
      queryOrCached(new QueryClient(), options),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  describe('offline', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('fails at once without asking the server', async () => {
      vi.stubGlobal('navigator', { onLine: false });
      const queryFn = vi.fn(() => Promise.resolve('fresh'));
      await expect(
        queryOrCached(new QueryClient(), { ...options, queryFn }),
      ).rejects.toBeInstanceOf(NetworkError);
      expect(queryFn).not.toHaveBeenCalled();
    });

    it('still answers from the cache', async () => {
      vi.stubGlobal('navigator', { onLine: false });
      const client = new QueryClient();
      client.setQueryData(['thing'], 'cached', { updatedAt: 0 });
      await expect(queryOrCached(client, options)).resolves.toBe('cached');
    });
  });
});
