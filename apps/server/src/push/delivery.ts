import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import type { Logger } from '../logger.ts';
import {
  sendWebPush,
  type PushResult,
  type PushSubscription,
  type VapidKeys,
} from './web-push.ts';

// Delivering a notification to the devices a user opted in on. A user with
// no subscription sends nothing: push is off by default, and so is the only
// outbound call it makes (docs/privacy.md).

export type PushMessage = Readonly<{
  title: string;
  body: string;
  url: string;
}>;

/** Sends one payload to one subscription; tests replace the network. */
export type PushSender = (
  subscription: PushSubscription,
  payload: string,
) => Promise<PushResult>;

export function createSender(
  keys: VapidKeys,
  subject: string,
  now: () => Date,
): PushSender {
  return (subscription, payload) =>
    sendWebPush(subscription, payload, keys, subject, now());
}

export type Delivery = Readonly<{
  sent: number;
  removed: number;
  failed: number;
}>;

export async function pushToUser(
  db: Kysely<DB>,
  send: PushSender,
  userId: string,
  message: PushMessage,
  logger?: Logger,
): Promise<Delivery> {
  const subscriptions = await db
    .selectFrom('push_subscriptions')
    .select(['id', 'endpoint', 'p256dh', 'auth'])
    .where('user_id', '=', userId)
    .execute();
  let sent = 0;
  let removed = 0;
  let failed = 0;
  const payload = JSON.stringify(message);
  for (const row of subscriptions) {
    const result = await send(
      { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
      payload,
    );
    if (result === 'sent') sent += 1;
    else if (result === 'gone') {
      removed += 1;
      await db
        .deleteFrom('push_subscriptions')
        .where('id', '=', row.id)
        .execute();
    } else {
      failed += 1;
      logger?.warn({ subscription: row.id }, 'push notification not delivered');
    }
  }
  return { sent, removed, failed };
}

export async function addSubscription(
  db: Kysely<DB>,
  userId: string,
  subscription: PushSubscription,
  userAgent: string | null,
  now: Date,
): Promise<string> {
  const id = randomUUID();
  // The same browser subscribing again (or another user on it) replaces the
  // old row: an endpoint belongs to one user at a time.
  await db
    .insertInto('push_subscriptions')
    .values({
      id,
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      user_agent: userAgent,
      created_at: now.toISOString(),
    })
    .onConflict((oc) =>
      oc.column('endpoint').doUpdateSet({
        user_id: userId,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        user_agent: userAgent,
        created_at: now.toISOString(),
      }),
    )
    .execute();
  const row = await db
    .selectFrom('push_subscriptions')
    .select('id')
    .where('endpoint', '=', subscription.endpoint)
    .executeTakeFirstOrThrow();
  return row.id;
}
