import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { AuthLayout } from '@/components/auth-layout';
import { LoadError } from '@/components/load-error';
import { UpdatePrompt } from '@/components/update-prompt';
import { validateLedgerSearch } from '@/features/ledger/search';
import { queryOrCached } from '@/lib/query-client';
import { safeRedirect, type ShellPath } from '@/lib/redirect';
import { onboardingQuery, sessionQuery } from '@/lib/session';
import { AccountsPage } from './routes/accounts.tsx';
import { LedgerPage } from './routes/ledger.tsx';
import { OnboardingPage } from './routes/onboarding.tsx';
import { SettingsPage } from './routes/settings.tsx';
import { SignInPage } from './routes/sign-in.tsx';
import { TodayPage } from './routes/today.tsx';
import { t } from '@/messages/t';

interface RouterContext {
  queryClient: QueryClient;
}

// Where a visitor belongs: onboarding until the first account exists, then
// sign-in, then Today.
async function destination(queryClient: QueryClient) {
  const { required } = await queryOrCached(queryClient, onboardingQuery);
  if (required) return '/onboarding' as const;
  const session = await queryOrCached(queryClient, sessionQuery);
  return session === null ? ('/sign-in' as const) : ('/today' as const);
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      <UpdatePrompt />
    </>
  ),
  errorComponent: LoadError,
  notFoundComponent: () => (
    <AuthLayout title={t('notFound.title')} intro={t('notFound.intro')}>
      <Link to="/" className="font-medium underline underline-offset-4">
        {t('notFound.home')}
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
  // Always return the key: the router merges raw search params underneath,
  // so leaving it out would let an unchecked `redirect` through.
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: ShellPath | undefined } => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: only('/sign-in'),
  component: function SignIn() {
    const { redirect: target } = signInRoute.useSearch();
    return <SignInPage next={target ?? '/today'} />;
  },
});

// Every signed-in route lives under this pathless layout, so the session is
// loaded and checked once and shared through the route context.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: async ({ context, location }) => {
    const { queryClient } = context;
    const { required } = await queryOrCached(queryClient, onboardingQuery);
    if (required) throw redirect({ to: '/onboarding' });
    const session = await queryOrCached(queryClient, sessionQuery);
    if (session === null) {
      const target = safeRedirect(location.pathname);
      throw redirect({
        to: '/sign-in',
        search: target === undefined ? {} : { redirect: target },
      });
    }
    return { session };
  },
  component: function Shell() {
    const { session } = appRoute.useRouteContext();
    return <AppShell twoFactorRequired={session.twoFactorRequired} />;
  },
});

const todayRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/today',
  component: function Today() {
    const { session } = todayRoute.useRouteContext();
    return <TodayPage user={session.user} />;
  },
});

const ledgerRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ledger',
  validateSearch: validateLedgerSearch,
  component: function Ledger() {
    const search = ledgerRoute.useSearch();
    const navigate = ledgerRoute.useNavigate();
    return (
      <LedgerPage
        search={search}
        navigate={(next, options) => {
          void navigate({ search: next, replace: options?.replace === true });
        }}
      />
    );
  },
});

const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts',
  component: AccountsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  onboardingRoute,
  signInRoute,
  appRoute.addChildren([todayRoute, ledgerRoute, accountsRoute, settingsRoute]),
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
