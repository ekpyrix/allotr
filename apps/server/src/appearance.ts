import { appearanceSchema, type Appearance } from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from './db/schema.ts';

// A user's appearance settings (FR-W5), kept as one JSON value in
// user_settings. A value that no longer parses reads as the default rather
// than failing every page load.

const appearanceKey = 'appearance';
const defaultAppearance: Appearance = { mode: 'system' };

export async function readAppearance(
  db: Kysely<DB>,
  userId: string,
): Promise<Appearance> {
  const row = await db
    .selectFrom('user_settings')
    .select('value')
    .where('user_id', '=', userId)
    .where('key', '=', appearanceKey)
    .executeTakeFirst();
  if (row === undefined) return defaultAppearance;
  try {
    const parsed = appearanceSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : defaultAppearance;
  } catch {
    return defaultAppearance;
  }
}

export async function saveAppearance(
  db: Kysely<DB>,
  userId: string,
  appearance: Appearance,
  now: Date,
): Promise<Appearance> {
  const value = JSON.stringify(appearance);
  const at = now.toISOString();
  await db
    .insertInto('user_settings')
    .values({ user_id: userId, key: appearanceKey, value, updated_at: at })
    .onConflict((oc) =>
      oc.columns(['user_id', 'key']).doUpdateSet({ value, updated_at: at }),
    )
    .execute();
  return appearance;
}
