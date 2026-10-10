import type { SessionView } from '@allotr/shared';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { onboardingQuery, sessionQuery } from './lib/session.ts';
import { setupQuery } from './lib/setup.ts';
import { createAppRouter, RENAMED } from './router.tsx';

describe('route tree', () => {
  it('has every screen and its sub-tab routes', () => {
    const router = createAppRouter(new QueryClient());
    const paths = Object.keys(router.routesByPath)
      .filter((path) => !path.startsWith('/dev/'))
      .sort();
    expect(paths).toEqual(
      [
        '/',
        '/accounts',
        '/accounts/$sub',
        '/budget',
        '/budget/$sub',
        '/invite/$token',
        '/onboarding',
        '/reports',
        '/reports/$sub',
        '/settings',
        '/settings/$sub',
        '/settings/themes/$id',
        '/settings/themes/new',
        '/setup',
        '/sign-in',
        '/transactions',
        ...Object.keys(RENAMED),
      ].sort(),
    );
  });
});

const session: SessionView = {
  user: {
    id: 'u1',
    name: 'Sam Example',
    email: 'sam@example.test',
    role: 'admin',
    twoFactorEnabled: false,
  },
  twoFactorRequired: false,
  twoFactorEnforced: false,
  themeUrlImport: false,
};

/** A signed-in instance with setup finished, so guards let routes through. */
function instance(state: 'signed-in' | 'signed-out' | 'fresh') {
  const queryClient = new QueryClient();
  queryClient.setQueryData(onboardingQuery.queryKey, {
    required: state === 'fresh',
  });
  queryClient.setQueryData(
    sessionQuery.queryKey,
    state === 'signed-in' ? session : null,
  );
  queryClient.setQueryData(setupQuery.queryKey, {
    finished: true,
    handled: [],
  });
  return queryClient;
}

// Under Node the router loads in server mode: a redirect is not followed but
// left in `_serverResult` with its target, so follow it here as the browser
// would.
async function visit(from: string, state = instance('signed-in'), maxHops = 6) {
  let location = from;
  for (let hop = 0; hop < maxHops; hop += 1) {
    const router = createAppRouter(
      state,
      createMemoryHistory({ initialEntries: [location] }),
    );
    await router.load();
    const result = (
      router as unknown as {
        _serverResult?: { type: string; redirect?: { headers: Headers } };
      }
    )._serverResult;
    const next = result?.redirect?.headers.get('Location');
    if (result?.type !== 'redirect' || next === null || next === undefined)
      return location;
    location = next;
  }
  return location;
}

describe('redirects', () => {
  it.each(Object.entries(RENAMED))('%s goes to %s', async (from, to) => {
    expect(await visit(from, instance('signed-in'), 1)).toBe(to);
  });

  it('keeps old addresses working before any session check', async () => {
    expect(await visit('/ledger', instance('signed-out'), 1)).toBe(
      '/transactions',
    );
  });

  it('sends a bare sub-tab screen to its first sub-tab', async () => {
    expect(await visit('/budget')).toBe('/budget/budgets');
    expect(await visit('/reports')).toBe('/reports/summary');
    expect(await visit('/settings')).toBe('/settings/money');
  });

  it('sends an unknown sub-tab back to the screen, then on', async () => {
    expect(await visit('/budget/nope')).toBe('/budget/budgets');
    expect(await visit('/accounts/nope')).toBe('/accounts');
    expect(await visit('/accounts/all')).toBe('/accounts');
  });

  it('keeps valid sub-tab addresses', async () => {
    expect(await visit('/accounts/credit')).toBe('/accounts/credit');
    expect(await visit('/reports/calendar')).toBe('/reports/calendar');
  });

  it('sends a signed-out visitor to sign-in with the way back', async () => {
    expect(await visit('/accounts/credit', instance('signed-out'))).toBe(
      '/sign-in?redirect=%2Faccounts%2Fcredit',
    );
  });

  it('sends a visitor to onboarding before the first account exists', async () => {
    expect(await visit('/', instance('fresh'))).toBe('/onboarding');
  });

  it('keeps a signed-in visitor off sign-in', async () => {
    expect(await visit('/sign-in')).toBe('/');
  });
});
