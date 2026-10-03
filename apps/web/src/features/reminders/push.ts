import {
  pushSubscriptionBodySchema,
  type PushSubscriptionBody,
} from '@allotr/shared';

// Web Push in the browser (ADR 0024). Off until the user turns it on for
// this device; nothing here runs before that.

/** The server's VAPID public key in the form `subscribe` wants. */
export function applicationServerKey(
  publicKey: string,
): Uint8Array<ArrayBuffer> {
  const padded = publicKey
    .replace(/-/gu, '+')
    .replace(/_/gu, '/')
    .padEnd(Math.ceil(publicKey.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** A browser subscription as the API takes it, or null when it is not one. */
export function toSubscriptionBody(json: unknown): PushSubscriptionBody | null {
  const parsed = pushSubscriptionBodySchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export type PushSupport =
  | { state: 'unsupported' }
  | { state: 'blocked' }
  | { state: 'available'; permission: 'default' | 'granted' };

/** What this browser can do: push needs a worker, the Push API and permission. */
export function pushSupport(env: {
  hasWorker: boolean;
  hasPush: boolean;
  permission: NotificationPermission | undefined;
}): PushSupport {
  if (!env.hasWorker || !env.hasPush || env.permission === undefined)
    return { state: 'unsupported' };
  if (env.permission === 'denied') return { state: 'blocked' };
  return { state: 'available', permission: env.permission };
}

export function currentSupport(): PushSupport {
  return pushSupport({
    hasWorker: 'serviceWorker' in navigator,
    hasPush: 'PushManager' in window,
    permission: 'Notification' in window ? Notification.permission : undefined,
  });
}
