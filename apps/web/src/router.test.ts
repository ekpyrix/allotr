import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { paramShellPaths, publicPaths, shellPaths } from './lib/redirect.ts';
import { createAppRouter } from './router.tsx';

// Every signed-in route must be in shellPaths, which the shell E2E test
// visits with axe (NFR-8), or in paramShellPaths with its own axe check. Add
// new views to nav-items.ts, extraShellPaths or paramShellPaths.
describe('route tree', () => {
  it('lists every signed-in route for the accessibility checks', () => {
    const router = createAppRouter(new QueryClient());
    const routed = Object.keys(router.routesByPath).filter(
      (path) =>
        path.startsWith('/') &&
        !(publicPaths as readonly string[]).includes(path),
    );
    expect(new Set(routed)).toEqual(
      new Set([...shellPaths, ...paramShellPaths]),
    );
  });
});

describe('sign-in redirect', () => {
  // The router merges raw search params under each route's validated ones,
  // so this checks what the sign-in route really receives.
  function signInSearch(redirect: string) {
    const router = createAppRouter(new QueryClient());
    const match = router
      .matchRoutes('/sign-in', { redirect })
      .find((m) => m.routeId === '/sign-in');
    return match?.routeId === '/sign-in' ? match.search : undefined;
  }

  it('keeps a known route', () => {
    expect(signInSearch('/accounts')).toEqual({ redirect: '/accounts' });
  });

  it('drops a crafted target instead of passing it through', () => {
    expect(signInSearch('//evil.example')?.redirect).toBeUndefined();
  });
});
