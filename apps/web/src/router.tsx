import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { Placeholder } from './screens/placeholder.tsx';
import { AuthPlaceholder } from './screens/auth-placeholder.tsx';
import { AppShell } from './shell/app-shell.tsx';
import { isSubTab, subTabs } from './nav-items.ts';
import { queryOrCached } from '@/lib/query-client';
import { safeRedirect, type ShellPath } from '@/lib/redirect';
import { onboardingQuery, sessionQuery } from '@/lib/session';
import { setupQuery } from '@/lib/setup';
import { t } from '@/messages/t';

// The route tree (docs/ui.md §6). Screens are placeholders until their work
// packages land; the guards, sub-tab addresses and old-address redirects are
// final.

export type RouterContext = { queryClient: QueryClient };

// Where a visitor belongs: onboarding until the first account exists, then
// sign-in, then the Dashboard.
async function destination(queryClient: QueryClient) {
  const { required } = await queryOrCached(queryClient, onboardingQuery);
  if (required) return '/onboarding' as const;
  const session = await queryOrCached(queryClient, sessionQuery);
  return session === null ? ('/sign-in' as const) : ('/' as const);
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <AuthPlaceholder title={t('notFound.title')}>
      <Link to="/" className="underline underline-offset-4">
        {t('notFound.home')}
      </Link>
    </AuthPlaceholder>
  ),
});

// Addresses earlier versions used. Each redirects, carrying nothing but the
// destination, before any session check, so old links and installed
// shortcuts keep working. `RENAMED` is the list the redirect tests read.
export const RENAMED = {
  '/today': '/',
  '/ledger': '/transactions',
  '/cycle': '/reports',
  '/history': '/reports/trends',
  '/savings': '/accounts/off-budget',
  '/accounts/savings': '/accounts/off-budget',
} as const;

const renamedRoutes = Object.entries(RENAMED).map(([from, to]) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: from,
    beforeLoad: () => {
      throw redirect({ href: to });
    },
  }),
);

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
  component: () => <AuthPlaceholder title={t('onboarding.title')} />,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  // Always return the key: the router merges raw search params underneath,
  // so leaving it out would let an unchecked `redirect` through.
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: ShellPath | undefined; deleted?: true | undefined } => ({
    redirect: safeRedirect(search.redirect),
    deleted: search.deleted === true ? true : undefined,
  }),
  beforeLoad: only('/sign-in'),
  component: () => <AuthPlaceholder title={t('signIn.title')} />,
});

// An invite link is for someone without an account: a signed-in visitor goes
// to the Dashboard, and before onboarding there is no one to invite them.
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  beforeLoad: async ({ context }) => {
    const target = await destination(context.queryClient);
    if (target !== '/sign-in') throw redirect({ to: target });
  },
  component: () => <AuthPlaceholder title={t('signIn.title')} />,
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
  component: AppShell,
});

// Sign-in, invites and the first account all land on the Dashboard, so this
// is where setup catches a new user. Other routes stay reachable during it.
// Required 2FA comes first: until then the server refuses the check.
const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    if (context.session.twoFactorRequired) return;
    const { finished } = await queryOrCached(context.queryClient, setupQuery);
    if (!finished) throw redirect({ to: '/setup' });
  },
  component: () => <Placeholder title={t('nav.dashboard')} />,
});

const budgetIndex = createRoute({
  getParentRoute: () => appRoute,
  path: '/budget',
  beforeLoad: () => {
    throw redirect({ to: '/budget/$sub', params: { sub: subTabs.budget[0] } });
  },
});
const budgetRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/budget/$sub',
  beforeLoad: ({ params }) => {
    if (!isSubTab('budget', params.sub)) throw redirect({ to: '/budget' });
  },
  component: () => <Placeholder title={t('nav.budget')} />,
});

const reportsIndex = createRoute({
  getParentRoute: () => appRoute,
  path: '/reports',
  beforeLoad: () => {
    throw redirect({
      to: '/reports/$sub',
      params: { sub: subTabs.reports[0] },
    });
  },
});
const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reports/$sub',
  beforeLoad: ({ params }) => {
    if (!isSubTab('reports', params.sub)) throw redirect({ to: '/reports' });
  },
  component: () => <Placeholder title={t('nav.reports')} />,
});

const settingsIndex = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  beforeLoad: () => {
    throw redirect({
      to: '/settings/$sub',
      params: { sub: subTabs.settings[0] },
    });
  },
});
const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/$sub',
  beforeLoad: ({ params }) => {
    if (!isSubTab('settings', params.sub)) throw redirect({ to: '/settings' });
  },
  component: () => <Placeholder title={t('nav.settings')} />,
});

// Accounts keeps its first sub-tab ("all") at the bare path.
const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts',
  component: () => <Placeholder title={t('nav.accounts')} />,
});
const accountsSubRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts/$sub',
  beforeLoad: ({ params }) => {
    if (params.sub === 'all' || !isSubTab('accounts', params.sub))
      throw redirect({ to: '/accounts' });
  },
  component: () => <Placeholder title={t('nav.accounts')} />,
});

const transactionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/transactions',
  // The filter, period, group, sort and selection live in the URL
  // (docs/ui.md §5); the transactions step validates them.
  validateSearch: (search: Record<string, unknown>) => search,
  component: () => <Placeholder title={t('nav.transactions')} />,
});

const setupRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/setup',
  beforeLoad: async ({ context }) => {
    if (context.session.twoFactorRequired) throw redirect({ to: '/' });
    const setup = await queryOrCached(context.queryClient, setupQuery);
    if (setup.finished) throw redirect({ to: '/' });
  },
  component: () => <Placeholder title={t('setup.title')} />,
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

const routeTree = rootRoute.addChildren([
  ...devRoutes,
  ...renamedRoutes,
  onboardingRoute,
  signInRoute,
  inviteRoute,
  appRoute.addChildren([
    dashboardRoute,
    accountsRoute,
    accountsSubRoute,
    transactionsRoute,
    budgetIndex,
    budgetRoute,
    reportsIndex,
    reportsRoute,
    settingsIndex,
    settingsRoute,
    setupRoute,
  ]),
]);

export function createAppRouter(
  queryClient: QueryClient,
  history?: RouterHistory,
) {
  return createRouter({
    routeTree,
    ...(history === undefined ? {} : { history }),
    context: { queryClient },
    defaultPreload: 'intent',
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
