import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './router.tsx';

// The route tree grows with the shell (WP3). Until then the index is the
// only production route; /dev/ routes exist in development only and have
// their own axe spec (e2e/components.spec.ts).
describe('route tree', () => {
  it('has the index route', () => {
    const router = createAppRouter(new QueryClient());
    const paths = Object.keys(router.routesByPath).filter(
      (path) => !path.startsWith('/dev/'),
    );
    expect(paths).toEqual(['/']);
  });
});
