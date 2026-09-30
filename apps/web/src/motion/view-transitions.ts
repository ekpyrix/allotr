import { effectiveMotion, readPref } from '@/lib/device-prefs';
import { navItems } from '@/nav-items';

// Route changes as same-document view transitions (ADR 0019), typed so the
// stylesheet can pick the motion: `tab` between top-level destinations
// fades through, `push` into a deeper page and `pop` back out slide 24 px.
// With reduced or no motion there is no transition at all. Browsers
// without view transitions, or without transition types, just navigate.

export type TransitionType = 'tab' | 'push' | 'pop';

const tabs: readonly string[] = navItems.map((item) => item.to);

function topLevel(path: string): string {
  return `/${path.split('/')[1] ?? ''}`;
}

/** The kind of move between two paths, or null for none. */
export function transitionType(
  from: string | undefined,
  to: string,
): TransitionType | null {
  if (from === undefined || from === to) return null;
  if (to.startsWith(`${from}/`)) return 'push';
  if (from.startsWith(`${to}/`)) return 'pop';
  if (tabs.includes(topLevel(from)) && tabs.includes(topLevel(to)))
    return topLevel(from) === topLevel(to) ? 'push' : 'tab';
  return null;
}

function prefersReduced(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export const viewTransitions = {
  types: ({
    fromLocation,
    toLocation,
    pathChanged,
  }: {
    fromLocation?: { pathname: string } | undefined;
    toLocation: { pathname: string };
    pathChanged: boolean;
  }): TransitionType[] | false => {
    if (!pathChanged) return false;
    if (effectiveMotion(readPref('motion'), prefersReduced()) !== 'full')
      return false;
    const type = transitionType(fromLocation?.pathname, toLocation.pathname);
    return type === null ? false : [type];
  },
};
