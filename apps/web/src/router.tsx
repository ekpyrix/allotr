import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
  redirect,
  useRouter,
  type ErrorComponentProps,
  type RouterHistory,
} from '@tanstack/react-router';
import { Dashboard } from './screens/dashboard/dashboard.tsx';
import { AccountsScreen } from './screens/accounts/accounts-screen.tsx';
import { validateAccountsSearch } from './screens/accounts/search-params.ts';
import { BudgetScreen } from './screens/budget/budget-screen.tsx';
import { ReportsScreen } from './screens/reports/reports-screen.tsx';
import { validateReportsSearch } from './screens/reports/reports-search.ts';
import { SettingsScreen } from './screens/settings/settings-screen.tsx';
import { ThemeEditorScreen } from './screens/settings/theme-editor-screen.tsx';
import { InviteScreen } from './screens/auth/invite-screen.tsx';
import { OnboardingScreen } from './screens/auth/onboarding-screen.tsx';
import { SetupScreen } from './screens/auth/setup-screen.tsx';
import { SignInScreen } from './screens/auth/sign-in-screen.tsx';
import { TransactionsScreen } from './screens/transactions/transactions-screen.tsx';
import { validateTransactionsSearch } from './screens/transactions/search-params.ts';
import { AuthPlaceholder } from './screens/auth-placeholder.tsx';
import { AppShell } from './shell/app-shell.tsx';
import { isSubTab, subTabs } from './nav-items.ts';
import { queryOrCached } from '@/lib/query-client';
import { safeRedirect, type ShellPath } from '@/lib/redirect';
import { onboardingQuery, sessionQuery } from '@/lib/session';
import { setupQuery } from '@/lib/setup';
import { BracketButton } from '@/components/buttons';
import { errorMessage } from '@/lib/problem';
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

// A failed guard (the server is down, a session check errors) offers a
// retry instead of a dead end. Invalidating runs the guards again.
function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <AuthPlaceholder title={t('errors.pageTitle')}>
      <p className="mt-2 text-small text-text-muted">{errorMessage(error)}</p>
      <BracketButton
        className="mt-3"
        onPress={() => {
          void router.invalidate();
        }}
      >
        {t('errors.retry')}
      </BracketButton>
    </AuthPlaceholder>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  // A failed guard (the server is down, a session check errors) offers a
  // retry instead of a dead end.
  errorComponent: RouteError,
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
  component: OnboardingScreen,
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
  component: SignInScreen,
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
  component: InviteScreen,
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
  component: Dashboard,
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
  component: BudgetScreen,
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
  validateSearch: validateReportsSearch,
  beforeLoad: ({ params }) => {
    if (!isSubTab('reports', params.sub)) throw redirect({ to: '/reports' });
  },
  component: ReportsScreen,
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
  component: SettingsScreen,
});
const themeNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/themes/new',
  component: () => <ThemeEditorScreen />,
});
const themeEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/themes/$id',
  component: function ThemeEdit() {
    const { id } = themeEditRoute.useParams();
    return <ThemeEditorScreen id={id} />;
  },
});

// Accounts keeps its first sub-tab ("all") at the bare path.
const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts',
  validateSearch: validateAccountsSearch,
  component: AccountsScreen,
});
const accountsSubRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts/$sub',
  validateSearch: validateAccountsSearch,
  beforeLoad: ({ params }) => {
    if (params.sub === 'all' || !isSubTab('accounts', params.sub))
      throw redirect({ to: '/accounts' });
  },
  component: AccountsScreen,
});

const transactionsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/transactions',
  // The filter, period, group and selection live in the URL (docs/ui.md §5).
  validateSearch: validateTransactionsSearch,
  component: TransactionsScreen,
});

const setupRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/setup',
  beforeLoad: async ({ context }) => {
    if (context.session.twoFactorRequired) throw redirect({ to: '/' });
    const setup = await queryOrCached(context.queryClient, setupQuery);
    if (setup.finished) throw redirect({ to: '/' });
  },
  component: SetupScreen,
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
    themeNewRoute,
    themeEditRoute,
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
