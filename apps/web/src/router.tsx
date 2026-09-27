import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { AuthLayout } from '@/components/auth-layout';
import { onboardingQuery, sessionQuery } from '@/lib/session';
import { OnboardingPage } from './routes/onboarding.tsx';
import { SignInPage } from './routes/sign-in.tsx';
import { TodayPage } from './routes/today.tsx';

interface RouterContext {
  queryClient: QueryClient;
}

// Where a visitor belongs: onboarding until the first account exists, then
// sign-in, then Today.
async function destination(queryClient: QueryClient) {
  const { required } = await queryClient.query(onboardingQuery);
  if (required) return '/onboarding' as const;
  const session = await queryClient.query(sessionQuery);
  return session === null ? ('/sign-in' as const) : ('/today' as const);
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <AuthLayout
      title="Page not found"
      intro="This address does not match a page in Allotr."
    >
      <Link to="/" className="font-medium underline underline-offset-4">
        Go to Allotr
      </Link>
    </AuthLayout>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    throw redirect({ to: await destination(context.queryClient) });
  },
});

function only(path: '/onboarding' | '/sign-in') {
  return async ({ context }: { context: RouterContext }) => {
    const target = await destination(context.queryClient);
    if (target !== path) throw redirect({ to: target });
  };
}

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  beforeLoad: only('/onboarding'),
  component: OnboardingPage,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  beforeLoad: only('/sign-in'),
  component: SignInPage,
});

const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/today',
  beforeLoad: async ({ context }) => {
    const target = await destination(context.queryClient);
    if (target !== '/today') throw redirect({ to: target });
    const session = await context.queryClient.query(sessionQuery);
    if (session === null) throw redirect({ to: '/sign-in' });
    return { session };
  },
  component: function Today() {
    const { session } = todayRoute.useRouteContext();
    return (
      <TodayPage
        user={session.user}
        twoFactorRequired={session.twoFactorRequired}
      />
    );
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  onboardingRoute,
  signInRoute,
  todayRoute,
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: false,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
