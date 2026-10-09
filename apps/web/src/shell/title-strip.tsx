import { Link, useLocation } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import {
  navItems,
  settingsItem,
  subTabs,
  type ScreenKey,
  type SubTabScreen,
} from '../nav-items.ts';
import { IconSettings3Line } from '@/generated/icons';
import { screenIcons } from './icons.ts';

/** The screen a path belongs to. */
export function screenOf(pathname: string): ScreenKey {
  if (pathname.startsWith(settingsItem.to)) return 'settings';
  const match = navItems
    .filter((item) => item.to !== '/')
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  return match?.key ?? 'dashboard';
}

function hasSubTabs(screen: ScreenKey): screen is SubTabScreen {
  return screen in subTabs;
}

/** Where a sub-tab lives. Accounts' first sub-tab is the bare path. */
export function subTabPath(screen: SubTabScreen, sub: string): string {
  if (screen === 'accounts')
    return sub === 'all' ? '/accounts' : `/accounts/${sub}`;
  return `/${screen}/${sub}`;
}

const label = {
  dashboard: 'nav.dashboard',
  accounts: 'nav.accounts',
  transactions: 'nav.transactions',
  budget: 'nav.budget',
  reports: 'nav.reports',
  settings: 'nav.settings',
} as const satisfies Record<ScreenKey, Parameters<typeof t>[0]>;

// The title strip (docs/ui.md §3): the screen's icon and name, then its
// sub-tabs as route links (selected = filled `primary`). A screen's own
// controls (search, period, filter) mount into `#strip-controls` through
// `StripControls` later. On phones the name is hidden and a gear opens
// Settings.
export function TitleStrip() {
  const { pathname } = useLocation();
  const screen = screenOf(pathname);
  const Icon = screenIcons[screen];
  return (
    <div
      data-slot="strip"
      className="col-start-1 row-start-2 flex h-strip min-w-0 items-center gap-2 border-b bg-chrome px-3 medium:col-start-2"
    >
      <Icon aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
      <h1 className="truncate text-base font-semibold compact:sr-only">
        {t(label[screen])}
      </h1>
      {hasSubTabs(screen) ? (
        <nav
          aria-label={t('shell.tabs.label')}
          className="flex min-w-0 items-center overflow-hidden"
        >
          {subTabs[screen].map((sub) => {
            const to = subTabPath(screen, sub);
            const active =
              pathname === to ||
              (screen === 'accounts' &&
                sub === 'all' &&
                pathname === '/accounts');
            return (
              <Link
                key={sub}
                to={to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'press flex h-strip min-w-hit items-center px-2 text-small',
                  active && 'bg-primary text-on-primary hover:bg-primary',
                )}
              >
                {t(`shell.tabs.${sub}`)}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <div
        id="strip-controls"
        className="ml-auto flex min-w-0 items-center gap-1"
      />
      <Link
        to={settingsItem.to}
        aria-label={t('nav.settings')}
        className="press flex min-h-hit min-w-hit items-center justify-center medium:hidden"
      >
        <IconSettings3Line className="size-4" />
      </Link>
    </div>
  );
}
