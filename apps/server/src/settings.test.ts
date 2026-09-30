import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from './db/schema.ts';
import { readSettings, updateSettings } from './settings.ts';
import { createTestDatabase } from './testing/database.ts';

let db: Kysely<DB>;
beforeEach(() => {
  db = createTestDatabase();
});
afterEach(async () => {
  await db.destroy();
});

describe('instance settings', () => {
  it('defaults to invite-only registration, no required 2FA and no URL imports', async () => {
    expect(await readSettings(db)).toEqual({
      registrationMode: 'invite_only',
      requireTwoFactor: false,
      themeUrlImport: false,
    });
  });

  it('stores changes and leaves other settings alone', async () => {
    const now = new Date(Date.UTC(2026, 0, 1));
    await updateSettings(db, { registrationMode: 'closed' }, now);
    await updateSettings(db, { requireTwoFactor: true }, now);
    await updateSettings(db, { themeUrlImport: true }, now);

    expect(await readSettings(db)).toEqual({
      registrationMode: 'closed',
      requireTwoFactor: true,
      themeUrlImport: true,
    });
  });
});
