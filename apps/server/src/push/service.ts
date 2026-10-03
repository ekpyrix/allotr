import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { createSender, type PushSender } from './delivery.ts';
import { ensureVapidKeys } from './keys.ts';

// The pieces of Web Push the routes and the scheduler share: the public
// key (created on first use) and a sender that signs with the private one.
// Tests replace the sender, so nothing here touches the network by itself.

export type PushService = Readonly<{
  publicKey: () => Promise<string>;
  send: PushSender;
}>;

export function createPushService(
  db: Kysely<DB>,
  baseUrl: string,
  now: () => Date,
  override?: PushSender,
): PushService {
  const keys = () => ensureVapidKeys(db, now());
  return {
    publicKey: async () => (await keys()).publicKey,
    send:
      override ??
      (async (subscription, payload) =>
        createSender(await keys(), baseUrl, now)(subscription, payload)),
  };
}
