import { navItems } from '../nav-items.ts';

/** Routes outside the shell; everything else requires a session. */
export const publicPaths = [
  '/',
  '/sign-in',
  '/onboarding',
  '/invite/$token',
] as const;

/** Signed-in routes that are not in the nav but still get axe checks. */
export const extraShellPaths = [
  '/cycle',
  '/history',
  '/savings',
] as const satisfies readonly `/${string}`[];

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
