import { instanceSettingsSchema, type InstanceSettings } from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from './db/schema.ts';

// Admin-managed settings in instance_settings (docs/architecture.md §7).
// Each key holds a JSON value; missing keys fall back to the defaults.

const defaults: InstanceSettings = {
  registrationMode: 'invite_only',
  requireTwoFactor: false,
  themeUrlImport: false,
};

const columns = {
  registrationMode: 'registration_mode',
  requireTwoFactor: 'require_two_factor',
  themeUrlImport: 'theme_url_import',
} as const satisfies Record<keyof InstanceSettings, string>;

type SettingName = keyof InstanceSettings;
const names = Object.keys(columns) as SettingName[];

export async function readSettings(db: Kysely<DB>): Promise<InstanceSettings> {
  const rows = await db
    .selectFrom('instance_settings')
    .select(['key', 'value'])
    .where('key', 'in', Object.values(columns))
    .execute();
  const stored = new Map(
    rows.map((row) => [row.key, JSON.parse(row.value) as unknown]),
  );
  const merged = Object.fromEntries(
    names.map((name) => [name, stored.get(columns[name]) ?? defaults[name]]),
  );
  return instanceSettingsSchema.parse(merged);
}

export async function updateSettings(
  db: Kysely<DB>,
  patch: {
    readonly [K in keyof InstanceSettings]?: InstanceSettings[K] | undefined;
  },
  now: Date,
): Promise<InstanceSettings> {
  const entries = names.flatMap((name) => {
    const value = patch[name];
    return value === undefined ? [] : [{ key: columns[name], value }];
  });
  await db.transaction().execute(async (trx) => {
    for (const { key, value } of entries) {
      const json = JSON.stringify(value);
      await trx
        .insertInto('instance_settings')
        .values({ key, value: json, updated_at: now.toISOString() })
        .onConflict((oc) =>
          oc
            .column('key')
            .doUpdateSet({ value: json, updated_at: now.toISOString() }),
        )
        .execute();
    }
  });
  return readSettings(db);
}
