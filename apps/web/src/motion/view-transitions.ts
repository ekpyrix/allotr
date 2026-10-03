import { effectiveMotion, readPref } from '@/lib/device-prefs';

// Route changes as same-document view transitions (ADR 0019, amended by
// 0023), typed so the stylesheet can pick the motion: `push` into a deeper
// page and `pop` back out slide 24 px. Switching between top-level
// destinations is instant: no transition at all. With reduced or no motion
// there is no transition either. Browsers without view transitions, or
// without transition types, just navigate.

export type TransitionType = 'push' | 'pop';

function topLevel(path: string): string {
  return `/${path.split('/')[1] ?? ''}`;
}

/** The kind of move between two paths, or null for none. */
export function transitionType(
  from: string | undefined,
  to: string,
): TransitionType | null {
  if (from === undefined || from === to) return null;
  if (to.startsWith(`${from}/`) && from !== '/') return 'push';
  if (from.startsWith(`${to}/`) && to !== '/') return 'pop';
  const place = topLevel(to);
  if (place !== '/' && place === topLevel(from)) return 'push';
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
