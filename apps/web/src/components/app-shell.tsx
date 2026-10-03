import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useOnline } from '@/lib/online';
import { sessionQuery } from '@/lib/session';
import { QuickEntryProvider } from '@/features/quick-entry/quick-entry-provider';
import { t } from '@/messages/t';
import { AppNav } from './app-nav.tsx';
import { CommandPalette } from './command-palette.tsx';
import { OfflineNotice } from './offline-notice.tsx';

// The frame around every signed-in view. The skip link comes first so a
// keyboard user can pass the nav; after a route change focus moves to
// <main> so screen readers start at the new page (not on first load).
// Offline, the view gives way to a banner and a notice so no stale
// figures show (decision Q6).
export function AppShell({
  twoFactorRequired: initial,
}: {
  twoFactorRequired: boolean;
}) {
  // Live, so the notice goes away once the user enrols.
  const twoFactorRequired =
    useQuery(sessionQuery).data?.twoFactorRequired ?? initial;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const main = useRef<HTMLElement>(null);
  const firstPath = useRef(pathname);
  const online = useOnline();

  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = '';
    main.current?.focus();
  }, [pathname]);

  return (
    <QuickEntryProvider>
      <div className="min-h-dvh medium:grid medium:grid-cols-[14rem_1fr]">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-30 focus:rounded-md focus:bg-card-raised focus:px-4 focus:py-2 focus:outline-2 focus:outline-ring"
        >
          {t('nav.skip')}
        </a>
        <AppNav />
        <CommandPalette />
        <main
          id="content"
          ref={main}
          tabIndex={-1}
          className="mx-auto w-full max-w-3xl px-4 expanded:max-w-5xl pb-[calc(6.5rem+env(safe-area-inset-bottom))] outline-none medium:px-6 medium:pb-12 large:px-8"
        >
          {twoFactorRequired ? (
            <p
              role="status"
              className="mt-4 mb-4 max-w-prose rounded-lg bg-warning-container p-4 text-body"
            >
              {t('shell.twoFactorRequired')}{' '}
              <Link
                to="/settings"
                hash="security"
                className="font-medium underline underline-offset-4"
              >
                {t('shell.twoFactorSetUp')}
              </Link>
            </p>
          ) : null}
          {/* Stays mounted so losing the connection is announced. */}
          <p aria-live="polite" className="sr-only">
            {online ? '' : t('offline.title')}
          </p>
          {online ? <Outlet /> : <OfflineNotice />}
        </main>
      </div>
    </QuickEntryProvider>
  );
}
