// How long a snackbar stays (spec §7.3): 5 s, or 8 s when it offers an
// action, paused while it is hovered or focused so nobody loses it
// mid-read (WCAG 2.2.1).

export const SNACK_MS = 5000;
export const SNACK_WITH_ACTION_MS = 8000;

export function snackDuration(hasAction: boolean): number {
  return hasAction ? SNACK_WITH_ACTION_MS : SNACK_MS;
}

type Timers = Readonly<{
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: never) => void;
  now: () => number;
}>;

const realTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle);
  },
  now: () => Date.now(),
};

/** A countdown that can pause and resume without losing the time left. */
export function createCountdown(
  ms: number,
  onDone: () => void,
  timers: Timers = realTimers,
) {
  let left = ms;
  let startedAt = 0;
  let handle: unknown = null;
  const run = () => {
    startedAt = timers.now();
    handle = timers.setTimeout(onDone, left);
  };
  run();
  return {
    pause() {
      if (handle === null) return;
      timers.clearTimeout(handle as never);
      handle = null;
      left = Math.max(0, left - (timers.now() - startedAt));
    },
    resume() {
      if (handle === null) run();
    },
    cancel() {
      if (handle !== null) timers.clearTimeout(handle as never);
      handle = null;
    },
  };
}
