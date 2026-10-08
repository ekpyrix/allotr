import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
} from '@tanstack/react-router';

// WP1 ships the foundation only: the real route tree (docs/ui.md §6) arrives
// with the shell in WP3. Until then `/` is a placeholder and, in development,
// `/dev/components` shows every primitive.

export type RouterContext = { queryClient: QueryClient };

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <main className="p-4">
      <h1 className="text-big font-semibold">Allotr</h1>
    </main>
  ),
});

const devRoutes = import.meta.env.DEV
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/dev/components',
        component: lazyRouteComponent(
          () => import('./routes/dev-components.tsx'),
          'DevComponentsPage',
        ),
      }),
    ]
  : [];

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, ...devRoutes]),
    context: { queryClient },
    defaultPreload: 'intent',
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
