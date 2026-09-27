import {
  MutationCache,
  QueryCache,
  QueryClient,
  type QueryKey,
  type QueryExecuteOptions,
} from '@tanstack/react-query';
import { ApiError, NetworkError } from './api.ts';

const MAX_RETRIES = 2;

/** Failures where asking again later can help. */
function isTransient(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  return (
    error instanceof ApiError && (error.status >= 500 || error.status === 429)
  );
}

/** Reads retry only when trying again can help; writes never retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isTransient(error);
}

/**
 * Fresh data when the server answers, otherwise what is cached, so a flaky
 * connection does not turn a navigation into an error page. A 401 always
 * propagates: the session really ended.
 */
export async function queryOrCached<T, K extends QueryKey>(
  client: QueryClient,
  options: QueryExecuteOptions<T, Error, T, T, K>,
): Promise<T> {
  try {
    return await client.query(options);
  } catch (error) {
    const cached = client.getQueryData<T>(options.queryKey);
    if (cached === undefined || !isTransient(error)) throw error;
    return cached;
  }
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

export function createQueryClient({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const onError = (error: unknown) => {
    if (isUnauthorized(error)) onUnauthorized();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry },
      mutations: { retry: false },
    },
  });
}
