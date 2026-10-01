import type { MessageKey } from './messages/t.ts';

// Top-level destinations, in order (ADR 0023). The phone's tab bar and the
// desktop sidebar render from this list, and the shell E2E test visits every
// entry. Settings is not a tab: it opens from the header gear on phones and
// from the foot of the sidebar.
export const navItems = [
  { to: '/', label: 'nav.dashboard' },
  { to: '/accounts', label: 'nav.accounts' },
  { to: '/transactions', label: 'nav.transactions' },
  { to: '/budget', label: 'nav.budget' },
  { to: '/reports', label: 'nav.reports' },
] as const satisfies readonly { to: `/${string}`; label: MessageKey }[];

export type NavPath = (typeof navItems)[number]['to'];

export const settingsItem = {
  to: '/settings',
  label: 'nav.settings',
} as const satisfies { to: `/${string}`; label: MessageKey };
