import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DB } from '../db/schema.ts';
import { generateVapidKeys, type VapidKeys } from './web-push.ts';

// The instance's VAPID key pair (ADR 0024), generated the first time the
// server starts and kept with the other instance secrets in
// instance_settings (key `vapid_keys`; the database is plaintext, as ADR
// 0015 says). The private key never leaves the server: only the public key
// is served, so browsers can subscribe.

const KEY = 'vapid_keys';
const storedSchema = z.object({
  publicKey: z.string(),
  privateKey: z.string(),
});

async function read(db: Kysely<DB>): Promise<VapidKeys | null> {
  const row = await db
    .selectFrom('instance_settings')
    .select('value')
    .where('key', '=', KEY)
    .executeTakeFirst();
  return row === undefined
    ? null
    : storedSchema.parse(JSON.parse(row.value) as unknown);
}

/** The key pair, created on first use. Two callers never end up with two. */
export async function ensureVapidKeys(
  db: Kysely<DB>,
  now: Date,
): Promise<VapidKeys> {
  const existing = await read(db);
  if (existing !== null) return existing;
  await db
    .insertInto('instance_settings')
    .values({
      key: KEY,
      value: JSON.stringify(generateVapidKeys()),
      updated_at: now.toISOString(),
    })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute();
  const stored = await read(db);
  if (stored === null) throw new Error('The VAPID keys could not be stored.');
  return stored;
}
