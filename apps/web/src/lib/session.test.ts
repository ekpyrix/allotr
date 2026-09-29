import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onboardingQuery, verifySignInCode } from './session.ts';

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

describe('verifySignInCode', () => {
  function stubFetch() {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function sent(fetchMock: ReturnType<typeof stubFetch>) {
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    return { url: typeof input === 'string' ? input : '', body: init?.body };
  }

  it('sends six digits as a TOTP code, ignoring spaces', async () => {
    const fetchMock = stubFetch();
    await verifySignInCode(' 123 456 ');
    const { url, body } = sent(fetchMock);
    expect(url).toMatch(/\/v1\/auth\/two-factor\/verify-totp$/);
    expect(body).toBe(JSON.stringify({ code: '123456' }));
  });

  it('sends anything else as a backup code', async () => {
    const fetchMock = stubFetch();
    await verifySignInCode('Ab3dE-9fGh2 ');
    const { url, body } = sent(fetchMock);
    expect(url).toMatch(/\/v1\/auth\/two-factor\/verify-backup-code$/);
    expect(body).toBe(JSON.stringify({ code: 'Ab3dE-9fGh2' }));
  });
});
