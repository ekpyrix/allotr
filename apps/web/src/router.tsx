import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { useCallback } from 'react';
import { AppShell } from '@/components/app-shell';
import { AuthLayout } from '@/components/auth-layout';
import { LoadError } from '@/components/load-error';
import { UpdatePrompt } from '@/components/update-prompt';
import { validateCycleSearch } from '@/features/cycles/search';
import {
  validateLedgerSearch,
  type LedgerSearch,
} from '@/features/ledger/search';
import { queryOrCached } from '@/lib/query-client';
import { safeRedirect, type ShellPath } from '@/lib/redirect';
import { onboardingQuery, sessionQuery } from '@/lib/session';
import { saveSetup, setupQuery } from '@/lib/setup';
import { AccountsPage } from './routes/accounts.tsx';
import { CyclePage } from './routes/cycle.tsx';
import { HistoryPage } from './routes/history.tsx';
import { InvitePage } from './routes/invite.tsx';
import { LedgerPage } from './routes/ledger.tsx';
import { OnboardingPage } from './routes/onboarding.tsx';
import { SavingsPage } from './routes/savings.tsx';
import { SettingsPage } from './routes/settings.tsx';
import { SetupPage } from './routes/setup.tsx';
import { EditThemePage, NewThemePage } from './routes/theme-editor.tsx';
import { SignInPage } from './routes/sign-in.tsx';
import { TodayPage } from './routes/today.tsx';
import { viewTransitions } from './motion/view-transitions.ts';
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
  ): { redirect?: ShellPath | undefined; deleted?: true | undefined } => ({
    redirect: safeRedirect(search.redirect),
    // Set after account deletion, to confirm it on arrival.
    deleted: search.deleted === true ? true : undefined,
  }),
  beforeLoad: only('/sign-in'),
  component: function SignIn() {
    const { redirect: target, deleted } = signInRoute.useSearch();
    return <SignInPage next={target ?? '/today'} deleted={deleted === true} />;
  },
});

// An invite link is for someone without an account: a signed-in visitor
// goes to Today, and before onboarding there is no one to invite them.
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite/$token',
  beforeLoad: async ({ context }) => {
    const target = await destination(context.queryClient);
    if (target !== '/sign-in') throw redirect({ to: target });
  },
  component: function Invite() {
    const { token } = inviteRoute.useParams();
    return <InvitePage token={token} />;
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

// Sign-in, invites and the first account all land on Today, so this is
// where setup catches a new user. Other routes stay reachable during it.
// Required 2FA comes first: until then the server refuses the check.
const todayRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/today',
  beforeLoad: async ({ context }) => {
    if (context.session.twoFactorRequired) return;
    const { finished } = await queryOrCached(context.queryClient, setupQuery);
    if (!finished) throw redirect({ to: '/setup' });
  },
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
    const go = useCallback(
      (next: LedgerSearch, options?: { replace?: boolean }) => {
        void navigate({ search: next, replace: options?.replace === true });
      },
      [navigate],
    );
    return <LedgerPage search={search} navigate={go} />;
  },
});

const accountsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accounts',
  component: AccountsPage,
});

// The cycle, history and savings views hang off Today and Accounts rather
// than the nav.
const cycleRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/cycle',
  validateSearch: validateCycleSearch,
  component: function Cycle() {
    const { start } = cycleRoute.useSearch();
    return <CyclePage start={start} />;
  },
});

const historyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/history',
  component: HistoryPage,
});

const savingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/savings',
  component: SavingsPage,
});

const setupRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/setup',
  beforeLoad: async ({ context }) => {
    if (context.session.twoFactorRequired) throw redirect({ to: '/today' });
    const { queryClient } = context;
    const setup = await queryOrCached(queryClient, setupQuery);
    if (setup.finished) throw redirect({ to: '/today' });
    // Until something is saved, an account added from another view would
    // read as setup done, so save the start.
    if (setup.handled.length === 0)
      queryClient.setQueryData(setupQuery.queryKey, await saveSetup(setup));
  },
  component: SetupPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: function Settings() {
    const { session } = settingsRoute.useRouteContext();
    return <SettingsPage session={session} />;
  },
});

const newThemeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/themes/new',
  validateSearch: (search: Record<string, unknown>): { from?: string } =>
    typeof search.from === 'string' ? { from: search.from } : {},
  component: function NewTheme() {
    const { session } = newThemeRoute.useRouteContext();
    const { from } = newThemeRoute.useSearch();
    return <NewThemePage session={session} from={from} />;
  },
});

const editThemeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings/themes/$id',
  component: function EditTheme() {
    const { session } = editThemeRoute.useRouteContext();
    const { id } = editThemeRoute.useParams();
    return <EditThemePage session={session} id={id} />;
  },
});

// The component gallery, in development only; the dynamic import keeps it
// out of production builds.
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
  indexRoute,
  onboardingRoute,
  signInRoute,
  inviteRoute,
  appRoute.addChildren([
    todayRoute,
    ledgerRoute,
    accountsRoute,
    cycleRoute,
    historyRoute,
    savingsRoute,
    setupRoute,
    settingsRoute,
    newThemeRoute,
    editThemeRoute,
  ]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: false,
    defaultViewTransition: viewTransitions,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
