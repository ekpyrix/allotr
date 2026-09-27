import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onboardingQuery } from './session.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('onboardingQuery', () => {
  it('never refetches once onboarding is done', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();
    client.setQueryData(
      onboardingQuery.queryKey,
      { required: false },
      { updatedAt: 0 },
    );
    await expect(client.query(onboardingQuery)).resolves.toEqual({
      required: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
