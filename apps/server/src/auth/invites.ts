import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';

// Single-use, expiring invite links. The token is shown once; only its hash
// is stored.

export interface CreatedInvite {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: Date;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export async function createInvite(
  db: Kysely<DB>,
  options: { createdBy: string; now: Date; ttlMs: number },
): Promise<CreatedInvite> {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(options.now.getTime() + options.ttlMs);
  await db
    .insertInto('invites')
    .values({
      id,
      token_hash: hashToken(token),
      created_by: options.createdBy,
      created_at: options.now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .execute();
  return { id, token, expiresAt };
}

/** An unused, unexpired invite for this token, or null. */
export async function findInvite(
  db: Kysely<DB>,
  token: string,
  now: Date,
): Promise<{ id: string; expiresAt: Date } | null> {
  const row = await db
    .selectFrom('invites')
    .select(['id', 'expires_at'])
    .where('token_hash', '=', hashToken(token))
    .where('used_at', 'is', null)
    .where('expires_at', '>', now.toISOString())
    .executeTakeFirst();
  return row === undefined
    ? null
    : { id: row.id, expiresAt: new Date(row.expires_at) };
}

/** Marks the invite used; false if it was already used or has expired. */
export async function claimInvite(
  db: Kysely<DB>,
  id: string,
  now: Date,
): Promise<boolean> {
  const result = await db
    .updateTable('invites')
    .set({ used_at: now.toISOString() })
    .where('id', '=', id)
    .where('used_at', 'is', null)
    .where('expires_at', '>', now.toISOString())
    .executeTakeFirst();
  return result.numUpdatedRows === 1n;
}

/** Undoes a claim when creating the account failed. */
export async function releaseInvite(db: Kysely<DB>, id: string): Promise<void> {
  await db
    .updateTable('invites')
    .set({ used_at: null })
    .where('id', '=', id)
    .where('used_by', 'is', null)
    .execute();
}

export async function completeInvite(
  db: Kysely<DB>,
  id: string,
  userId: string,
): Promise<void> {
  await db
    .updateTable('invites')
    .set({ used_by: userId })
    .where('id', '=', id)
    .execute();
}
