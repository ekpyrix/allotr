import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { createTestDatabase, insertUser } from '../testing/database.ts';
import {
  claimInvite,
  createInvite,
  findInvite,
  releaseInvite,
  completeInvite,
} from './invites.ts';

const day = 86_400_000;
const now = new Date(Date.UTC(2026, 0, 1));
const later = (days: number) => new Date(now.getTime() + days * day);

let db: Kysely<DB>;
beforeEach(async () => {
  db = createTestDatabase();
  await insertUser(db, 'admin1', 'admin');
  await insertUser(db, 'user1');
});
afterEach(async () => {
  await db.destroy();
});

describe('invites', () => {
  it('stores only a hash of the token', async () => {
    const invite = await createInvite(db, {
      createdBy: 'admin1',
      now,
      ttlMs: day,
    });
    const row = await db
      .selectFrom('invites')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(invite.token.length).toBeGreaterThanOrEqual(43);
    expect(JSON.stringify(row)).not.toContain(invite.token);
  });

  it('finds a valid invite until it expires', async () => {
    const invite = await createInvite(db, {
      createdBy: 'admin1',
      now,
      ttlMs: 7 * day,
    });
    expect(await findInvite(db, invite.token, later(6))).toEqual({
      id: invite.id,
      expiresAt: later(7),
    });
    expect(await findInvite(db, invite.token, later(7))).toBeNull();
    expect(await findInvite(db, 'not-a-token', now)).toBeNull();
  });

  it('can be claimed only once', async () => {
    const invite = await createInvite(db, {
      createdBy: 'admin1',
      now,
      ttlMs: day,
    });
    expect(await claimInvite(db, invite.id, now)).toBe(true);
    expect(await claimInvite(db, invite.id, now)).toBe(false);
    expect(await findInvite(db, invite.token, now)).toBeNull();
  });

  it('cannot be claimed after it expires', async () => {
    const invite = await createInvite(db, {
      createdBy: 'admin1',
      now,
      ttlMs: day,
    });
    expect(await claimInvite(db, invite.id, later(2))).toBe(false);
  });

  it('can be released when sign-up fails and records the new user on success', async () => {
    const invite = await createInvite(db, {
      createdBy: 'admin1',
      now,
      ttlMs: day,
    });
    await claimInvite(db, invite.id, now);
    await releaseInvite(db, invite.id);
    expect(await claimInvite(db, invite.id, now)).toBe(true);

    await completeInvite(db, invite.id, 'user1');
    const row = await db
      .selectFrom('invites')
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(row.used_by).toBe('user1');
    expect(row.used_at).toBe(now.toISOString());
  });
});
