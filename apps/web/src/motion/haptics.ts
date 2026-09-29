import { readPref } from '@/lib/device-prefs';

// Haptics (spec §7.6): the Vibration API where the browser has it, always
// beside a visual change, and only while the Haptics setting is on. Where
// there is no vibration API (iOS Safari) nothing happens; there is no
// workaround.

export const HAPTIC_PATTERNS = {
  save: [12],
  tick: [8],
  error: [10, 60, 10],
  celebrate: [20, 40, 20],
} as const satisfies Readonly<Record<string, readonly number[]>>;
export type Haptic = keyof typeof HAPTIC_PATTERNS;

type Vibrate = (pattern: number[]) => boolean;

function deviceVibrate(): Vibrate | undefined {
  if (typeof navigator === 'undefined') return undefined;
  if (typeof (navigator as Partial<Navigator>).vibrate !== 'function')
    return undefined;
  return (pattern) => navigator.vibrate(pattern);
}

/** Whether this device can vibrate at all (for showing the setting). */
export function canVibrate(): boolean {
  return deviceVibrate() !== undefined;
}

export function haptic(
  kind: Haptic,
  vibrate: Vibrate | undefined = deviceVibrate(),
  enabled: boolean = readPref('haptics') === 'on',
): void {
  if (!enabled || vibrate === undefined) return;
  try {
    vibrate([...HAPTIC_PATTERNS[kind]]);
  } catch {
    // A refused vibration changes nothing on screen.
  }
}
