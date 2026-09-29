import type { MessageKey } from './messages/t.ts';

// Top-level destinations, in order. Both the bottom bar and the side rail
// render from this list, and the shell E2E test visits every entry.
export const navItems = [
  { to: '/today', label: 'nav.today' },
  { to: '/ledger', label: 'nav.ledger' },
  { to: '/accounts', label: 'nav.accounts' },
  { to: '/settings', label: 'nav.settings' },
] as const satisfies readonly { to: `/${string}`; label: MessageKey }[];

export type NavPath = (typeof navItems)[number]['to'];

/**
 * Destinations only the rail and drawer have room for; on phones they stay
 * reachable from their parent view (Savings from Accounts).
 */
export const wideNavItems = [
  { to: '/savings', label: 'nav.savings' },
] as const satisfies readonly { to: `/${string}`; label: MessageKey }[];

export type WideNavPath = (typeof wideNavItems)[number]['to'];
