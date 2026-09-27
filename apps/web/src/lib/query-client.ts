import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, NetworkError } from './api.ts';

const MAX_RETRIES = 2;

/** Reads retry only when trying again can help; writes never retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (error instanceof NetworkError) return true;
  return (
    error instanceof ApiError && (error.status >= 500 || error.status === 429)
  );
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
