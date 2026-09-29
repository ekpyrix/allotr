import { setupSchema, type SetupState } from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from './db/schema.ts';

// Where a user is in setup after first sign-in (FR-W7), kept as one JSON
// value in user_settings. It cannot be worked out from the ledger: the
// default currency and payday look the same whether chosen or not.

const setupKey = 'setup';

/**
 * The stored progress. With none stored, someone who already has accounts
 * (an older user or an imported ledger) counts as finished, so setup only
 * ever catches new users.
 */
export async function readSetup(
  db: Kysely<DB>,
  userId: string,
): Promise<SetupState> {
  const row = await db
    .selectFrom('user_settings')
    .select('value')
    .where('user_id', '=', userId)
    .where('key', '=', setupKey)
    .executeTakeFirst();
  if (row !== undefined) {
    try {
      const parsed = setupSchema.safeParse(JSON.parse(row.value));
      if (parsed.success) return parsed.data;
    } catch {
      // A value that no longer parses falls through to the ledger check.
    }
  }
  const account = await db
    .selectFrom('accounts')
    .select('id')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return { finished: account !== undefined, handled: [] };
}

export async function saveSetup(
  db: Kysely<DB>,
  userId: string,
  setup: SetupState,
  now: Date,
): Promise<SetupState> {
  const value = JSON.stringify(setup);
  const at = now.toISOString();
  await db
    .insertInto('user_settings')
    .values({ user_id: userId, key: setupKey, value, updated_at: at })
    .onConflict((oc) =>
      oc.columns(['user_id', 'key']).doUpdateSet({ value, updated_at: at }),
    )
    .execute();
  return setup;
}
