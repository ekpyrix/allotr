import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
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
        '/setup',
        '/sign-in',
        '/transactions',
        ...Object.keys(RENAMED),
      ].sort(),
    );
  });
});
