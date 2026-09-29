// Registers the service worker (production builds only) and tracks a new
// version waiting to take over, for the update prompt. The worker itself is
// src/sw/worker.ts.

export interface WorkerLike extends EventTarget {
  readonly state: string;
  postMessage(message: unknown): void;
}

export interface RegistrationLike extends EventTarget {
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
}

export interface ContainerLike extends EventTarget {
  readonly controller: unknown;
}

/**
 * Calls `onWaiting` when a new worker has installed while an older one
 * controls this page. On a first install nothing is waiting: the worker
 * takes over by itself.
 */
export function watchForUpdates(
  registration: RegistrationLike,
  container: ContainerLike,
  onWaiting: (worker: WorkerLike) => void,
) {
  const check = (worker: WorkerLike) => {
    if (worker.state === 'installed' && container.controller !== null)
      onWaiting(worker);
  };
  if (registration.waiting !== null) check(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (worker === null) return;
    worker.addEventListener('statechange', () => {
      check(worker);
    });
  });
}

/** Lets the waiting worker take over, then reloads onto the new version. */
export function applyUpdate(
  worker: WorkerLike,
  container: ContainerLike,
  reload: () => void,
) {
  container.addEventListener('controllerchange', reload, { once: true });
  worker.postMessage({ type: 'skip-waiting' });
}

// The waiting worker, shared with the update prompt.
let waiting: WorkerLike | null = null;
const listeners = new Set<() => void>();

function setWaiting(worker: WorkerLike | null) {
  waiting = worker;
  for (const listener of listeners) listener();
}

export const updateStore = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => waiting,
  dismiss: () => {
    setWaiting(null);
  },
};

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const container = navigator.serviceWorker;
  const registration = await container.register('/sw.js', { scope: '/' });
  watchForUpdates(registration, container, setWaiting);
  // An installed app can stay open for days: look for a new version
  // whenever it comes back to the foreground.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      registration.update().catch(() => undefined);
  });
}
