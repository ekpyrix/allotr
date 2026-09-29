import { useEffect, useState } from 'react';
import { z } from 'zod';

// Preferences kept on this device only (the configurable-defaults rule):
// motion, haptics, celebrations and density. public/theme-init.js applies
// the motion and density attributes before first paint from the same
// keys: change both together. Every storage access may throw (private
// browsing, blocked storage), so each is guarded and falls back to the
// default.

export const DEVICE_PREFS = {
  motion: {
    key: 'allotr.motion',
    schema: z.enum(['system', 'full', 'reduced', 'off']),
    fallback: 'system',
  },
  haptics: {
    key: 'allotr.haptics',
    schema: z.enum(['on', 'off']),
    fallback: 'on',
  },
  celebrations: {
    key: 'allotr.celebrations',
    schema: z.enum(['on', 'off']),
    fallback: 'on',
  },
  density: {
    key: 'allotr.density',
    schema: z.enum(['comfortable', 'compact']),
    fallback: 'comfortable',
  },
} as const;

export type DevicePref = keyof typeof DEVICE_PREFS;
export type DevicePrefValue<P extends DevicePref> = z.infer<
  (typeof DEVICE_PREFS)[P]['schema']
>;
export type MotionPref = DevicePrefValue<'motion'>;
/** How much motion the app actually uses. */
export type Motion = 'full' | 'reduced' | 'off';

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readPref<P extends DevicePref>(
  pref: P,
  from: Pick<Storage, 'getItem'> | undefined = storage(),
): DevicePrefValue<P> {
  const { key, schema, fallback } = DEVICE_PREFS[pref];
  try {
    const parsed = schema.safeParse(from?.getItem(key));
    return (parsed.success ? parsed.data : fallback) as DevicePrefValue<P>;
  } catch {
    return fallback as DevicePrefValue<P>;
  }
}

export function writePref<P extends DevicePref>(
  pref: P,
  value: DevicePrefValue<P>,
  to: Pick<Storage, 'setItem' | 'removeItem'> | undefined = storage(),
): void {
  const { key, fallback } = DEVICE_PREFS[pref];
  try {
    if (value === fallback) to?.removeItem(key);
    else to?.setItem(key, value);
  } catch {
    // The choice lasts for this page.
  }
}

/** The motion setting combined with the device's reduced-motion request. */
export function effectiveMotion(
  pref: MotionPref,
  prefersReduced: boolean,
): Motion {
  if (pref === 'system') return prefersReduced ? 'reduced' : 'full';
  return pref;
}

/** `data-motion` and `data-density` on <html>; absent for the defaults. */
export function applyPrefs(
  doc: Readonly<{ documentElement: { dataset: DOMStringMap } }>,
  prefs: Readonly<{ motion: MotionPref; density: DevicePrefValue<'density'> }>,
): void {
  const root = doc.documentElement;
  if (prefs.motion === 'system') delete root.dataset.motion;
  else root.dataset.motion = prefs.motion;
  if (prefs.density === 'comfortable') delete root.dataset.density;
  else root.dataset.density = prefs.density;
}

const reducedQuery = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia(reducedQuery).matches;
  } catch {
    return false;
  }
}

/** A device preference as React state, stored and applied on change. */
export function useDevicePref<P extends DevicePref>(
  pref: P,
): [DevicePrefValue<P>, (value: DevicePrefValue<P>) => void] {
  const [value, setValue] = useState(() => readPref(pref));
  function set(next: DevicePrefValue<P>) {
    writePref(pref, next);
    setValue(next);
    applyPrefs(document, {
      motion: pref === 'motion' ? (next as MotionPref) : readPref('motion'),
      density:
        pref === 'density'
          ? (next as DevicePrefValue<'density'>)
          : readPref('density'),
    });
  }
  return [value, set];
}

/** The motion the app uses now, following the device while on System. */
export function useEffectiveMotion(): Motion {
  const [pref] = useDevicePref('motion');
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(reducedQuery);
    } catch {
      return;
    }
    const update = () => {
      setReduced(media.matches);
    };
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
    };
  }, []);
  return effectiveMotion(pref, reduced);
}
