import { useSyncExternalStore } from 'react';

// Whether a media query matches, kept in sync as it changes. Only for
// choosing between structures (a dialog or a pane); anything visual is
// CSS. Without matchMedia (tests, old browsers) it never matches.

function subscribe(query: string) {
  return (callback: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => undefined;
    const media = window.matchMedia(query);
    media.addEventListener('change', callback);
    return () => {
      media.removeEventListener('change', callback);
    };
  };
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia(query).matches,
    () => false,
  );
}

/** The expanded window size class and wider (spec §6). */
export const EXPANDED = '(min-width: 840px)';
