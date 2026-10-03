import { navItems } from '../nav-items.ts';

/** Routes outside the shell; everything else requires a session. */
export const publicPaths = [
  '/sign-in',
  '/onboarding',
  '/invite/$token',
] as const;

/** Old addresses that only redirect to a renamed route (ADR 0023). */
export const renamedPaths = [
  '/today',
  '/ledger',
  '/cycle',
  '/history',
  '/savings',
] as const;

/** Signed-in routes that are not in the nav but still get axe checks. */
export const extraShellPaths = [
  '/settings',
  '/reports/history',
  '/accounts/savings',
  // Redirects to the Dashboard once finished, as in the shell spec; setup.spec runs
  // axe on every step.
  '/setup',
  '/settings/themes/new',
] as const satisfies readonly `/${string}`[];

/**
 * Signed-in routes with a parameter, which the shell E2E cannot visit; the
 * spec named beside each runs axe on it. Never a sign-in redirect target.
 */
export const paramShellPaths = [
  // themes.spec
  '/settings/themes/$id',
] as const;

/** Every signed-in route; the shell E2E test visits each with axe. */
export const shellPaths = [
  ...navItems.map((item) => item.to),
  ...extraShellPaths,
] as const;

export type ShellPath = (typeof shellPaths)[number];

/**
 * Where to go after sign-in. Only exact known routes pass, so a crafted
 * link cannot send the user to another site.
 */
export function safeRedirect(value: unknown): ShellPath | undefined {
  return shellPaths.find((path) => path === value);
}
