import type { MessageKey } from './messages/t.ts';

// Top-level destinations, in order (ADR 0027). The tab bar, rail and sidebar
// render from this list, `1`–`5` jump to them in this order, and the shell
// E2E test visits every entry. Settings is not a destination: it opens from
// the title strip gear on phones and from the foot of the sidebar and rail.
export const navItems = [
  {
    to: '/',
    label: 'nav.dashboard',
    short: 'nav.short.dashboard',
    key: 'dashboard',
  },
  {
    to: '/accounts',
    label: 'nav.accounts',
    short: 'nav.short.accounts',
    key: 'accounts',
  },
  {
    to: '/transactions',
    label: 'nav.transactions',
    short: 'nav.short.transactions',
    key: 'transactions',
  },
  {
    to: '/budget',
    label: 'nav.budget',
    short: 'nav.short.budget',
    key: 'budget',
  },
  {
    to: '/reports',
    label: 'nav.reports',
    short: 'nav.short.reports',
    key: 'reports',
  },
] as const satisfies readonly {
  to: `/${string}`;
  label: MessageKey;
  short: MessageKey;
  key: string;
}[];

export type NavPath = (typeof navItems)[number]['to'];
export type ScreenKey = (typeof navItems)[number]['key'] | 'settings';

export const settingsItem = {
  to: '/settings',
  label: 'nav.settings',
  short: 'nav.short.settings',
  key: 'settings',
} as const satisfies {
  to: `/${string}`;
  label: MessageKey;
  short: MessageKey;
  key: string;
};

/**
 * Sub-tabs of a screen, in order (docs/ui.md §6). The first is the default.
 * Accounts keeps its first sub-tab at the bare path, so the filtered ones
 * are the only addresses with a segment.
 */
export const subTabs = {
  accounts: ['all', 'on-budget', 'off-budget', 'credit'],
  budget: ['budgets', 'pools', 'bills', 'goals', 'ious', 'cover-order'],
  reports: ['summary', 'trends', 'plan', 'calendar', 'cycles'],
  settings: ['money', 'categories', 'policies', 'app', 'account', 'data'],
} as const;

export type SubTabScreen = keyof typeof subTabs;
export type SubTab<S extends SubTabScreen> = (typeof subTabs)[S][number];

export function isSubTab<S extends SubTabScreen>(
  screen: S,
  value: unknown,
): value is SubTab<S> {
  return (subTabs[screen] as readonly unknown[]).includes(value);
}
