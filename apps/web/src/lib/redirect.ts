import {
  navItems,
  settingsItem,
  subTabs,
  type SubTab,
  type SubTabScreen,
} from '../nav-items.ts';

/** Routes outside the shell; everything else requires a session. */
export const publicPaths = [
  '/sign-in',
  '/onboarding',
  '/invite/$token',
] as const;

/** Signed-in routes that are not in the nav but still get axe checks. */
export const extraShellPaths = [
  '/settings/money',
  '/setup',
] as const satisfies readonly `/${string}`[];

/**
 * Every sub-tab address. Accounts' first sub-tab is the bare `/accounts`, so
 * only its filtered ones have a segment.
 */
export type SubTabPath = {
  [S in SubTabScreen]: `/${S}/${Exclude<SubTab<S>, 'all'>}`;
}[SubTabScreen];

export const subTabPaths = (Object.keys(subTabs) as SubTabScreen[]).flatMap(
  (screen) =>
    subTabs[screen]
      .filter((sub) => sub !== 'all')
      .map((sub) => `/${screen}/${sub}` as SubTabPath),
);

/** Every signed-in route; the shell E2E test visits each with axe. */
export const shellPaths = [
  ...navItems.map((item) => item.to),
  settingsItem.to,
  ...extraShellPaths,
  ...subTabPaths,
] as const;

export type ShellPath = (typeof shellPaths)[number];

/**
 * Where to go after sign-in. Only exact known routes pass, so a crafted
 * link cannot send the user to another site.
 */
export function safeRedirect(value: unknown): ShellPath | undefined {
  return shellPaths.find((path) => path === value);
}
