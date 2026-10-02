import {
  budgetPeriodRuleSchema,
  currencyCode,
  dailyModeSchema,
  payYourselfFirstSchema,
  localDateSchema,
  paydayRuleSchema,
  type BudgetPeriodRule,
  type DailyMode,
  type LedgerSettingsView,
  type PayYourselfFirstSetting,
  type LocalDate,
  type PaydayRule,
} from '@allotr/shared';
import { defaultWriteOffAfterDays } from '@allotr/core';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import type { Db } from './store.ts';

// A user's ledger settings (FR-C2, FR-X2). Locale, time zone and default
// currency are user columns; the payday rule lives in user_settings. None of
// them touch the ledger: changing one only changes how figures come out.

/** Payday before the user sets one (docs/domain.md "Policies"). */
export const defaultPaydayDay = 1;
export const defaultPaydayRule: PaydayRule = 'fixed';

const paydayRuleKey = 'payday_rule';
const paydayDayKey = 'payday_day';
const paydayOverrideKey = 'payday_override';
const countSavingsKey = 'count_savings_in_daily';
const budgetPeriodKey = 'budget_period';
const dailyModeKey = 'daily_mode';
const payFirstKey = 'pay_yourself_first';
const emergencyKey = 'emergency_months';
const iouWriteOffKey = 'iou_write_off_after_days';
const iouWriteOffSchema = z.int().min(1).max(3650);

const paydayDaySchema = z.int().min(1).max(31);
const paydayOverrideSchema = localDateSchema.nullable();

// A stored value that no longer parses falls back to the default rather
// than making every figure fail.
function parsed<T>(schema: z.ZodType<T>, text: string | undefined): T | null {
  if (text === undefined) return null;
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function readLedgerSettings(
  db: Db,
  userId: string,
): Promise<LedgerSettingsView> {
  const [user, rows] = await Promise.all([
    db
      .selectFrom('users')
      .select(['locale', 'tz', 'default_currency'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('user_settings')
      .select(['key', 'value'])
      .where('user_id', '=', userId)
      .where('key', 'in', [
        paydayRuleKey,
        paydayDayKey,
        paydayOverrideKey,
        countSavingsKey,
        budgetPeriodKey,
        dailyModeKey,
        payFirstKey,
        emergencyKey,
        iouWriteOffKey,
      ])
      .execute(),
  ]);
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  return {
    locale: user.locale,
    timeZone: user.tz,
    defaultCurrency: currencyCode(user.default_currency),
    paydayRule:
      parsed(paydayRuleSchema, stored.get(paydayRuleKey)) ?? defaultPaydayRule,
    paydayDay:
      parsed(paydayDaySchema, stored.get(paydayDayKey)) ?? defaultPaydayDay,
    paydayOverride: parsed(paydayOverrideSchema, stored.get(paydayOverrideKey)),
    countSavingsInDaily:
      parsed(z.boolean(), stored.get(countSavingsKey)) ?? false,
    budgetPeriod:
      parsed(budgetPeriodRuleSchema, stored.get(budgetPeriodKey)) ?? 'cycle',
    dailyMode: parsed(dailyModeSchema, stored.get(dailyModeKey)) ?? 'free',
    payYourselfFirst:
      parsed(payYourselfFirstSchema, stored.get(payFirstKey)) ?? null,
    emergencyMonths:
      parsed(z.int().min(1).max(24), stored.get(emergencyKey)) ?? 3,
    iouWriteOffAfterDays:
      parsed(iouWriteOffSchema, stored.get(iouWriteOffKey)) ??
      defaultWriteOffAfterDays,
  };
}

const startedOnKey = 'ledger_started_on';

/**
 * The earliest day of imported history, if the ledger was imported. The
 * first cycle opens then when it is before the day the user joined
 * (docs/domain.md "Cycles"). It is internal, not a user setting.
 */
export async function readLedgerStart(
  db: Db,
  userId: string,
): Promise<LocalDate | null> {
  const row = await db
    .selectFrom('user_settings')
    .select('value')
    .where('user_id', '=', userId)
    .where('key', '=', startedOnKey)
    .executeTakeFirst();
  return parsed(localDateSchema, row?.value);
}

/**
 * Records the start of imported history: its earliest dated entry. Only a
 * history with a paycheck has one, so Today still starts from the day the
 * user joined when there is none (payday would be long past otherwise).
 */
export async function recordLedgerStart(
  db: Db,
  userId: string,
  now: Date,
): Promise<void> {
  const paycheck = await db
    .selectFrom('postings as p')
    .innerJoin('categories as c', (join) =>
      join
        .onRef('c.id', '=', 'p.category_id')
        .onRef('c.user_id', '=', 'p.user_id'),
    )
    .select('p.id')
    .where('p.user_id', '=', userId)
    .where('c.is_paycheck', '=', 1)
    .executeTakeFirst();
  if (paycheck === undefined) return;
  const earliest = await db
    .selectFrom('transactions')
    .select((eb) => eb.fn.min('occurred_on').as('day'))
    .where('user_id', '=', userId)
    .executeTakeFirst();
  const day = earliest?.day ?? null;
  if (day === null) return;
  const value = JSON.stringify(day);
  const at = now.toISOString();
  await db
    .insertInto('user_settings')
    .values({ user_id: userId, key: startedOnKey, value, updated_at: at })
    .onConflict((oc) =>
      oc.columns(['user_id', 'key']).doUpdateSet({ value, updated_at: at }),
    )
    .execute();
}

export type LedgerSettingsPatch = Readonly<{
  locale?: string | undefined;
  timeZone?: string | undefined;
  defaultCurrency?: string | undefined;
  paydayRule?: PaydayRule | undefined;
  paydayDay?: number | undefined;
  paydayOverride?: LocalDate | null | undefined;
  countSavingsInDaily?: boolean | undefined;
  budgetPeriod?: BudgetPeriodRule | undefined;
  dailyMode?: DailyMode | undefined;
  payYourselfFirst?: PayYourselfFirstSetting | null | undefined;
  emergencyMonths?: number | undefined;
  iouWriteOffAfterDays?: number | undefined;
}>;

function canonicalLocale(locale: string): string {
  try {
    const [canonical] = Intl.getCanonicalLocales(locale);
    if (canonical !== undefined) return canonical;
  } catch {
    // Reported below.
  }
  throw new RequestProblem(
    400,
    'invalid_locale',
    `"${locale}" is not a locale. Use a tag such as en-US.`,
  );
}

function canonicalTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    throw new RequestProblem(
      400,
      'invalid_time_zone',
      `"${timeZone}" is not a time zone. Use a name such as Europe/Berlin.`,
    );
  }
}

/** Writes a settings change inside the caller's database transaction. */
export async function applyLedgerSettings(
  db: Db,
  userId: string,
  patch: LedgerSettingsPatch,
  now: Date,
): Promise<void> {
  const user = {
    ...(patch.locale === undefined
      ? {}
      : { locale: canonicalLocale(patch.locale) }),
    ...(patch.timeZone === undefined
      ? {}
      : { tz: canonicalTimeZone(patch.timeZone) }),
    ...(patch.defaultCurrency === undefined
      ? {}
      : { default_currency: patch.defaultCurrency }),
  };
  const at = now.toISOString();
  const settings = [
    ...(patch.paydayRule === undefined
      ? []
      : [{ key: paydayRuleKey, value: JSON.stringify(patch.paydayRule) }]),
    ...(patch.paydayDay === undefined
      ? []
      : [{ key: paydayDayKey, value: JSON.stringify(patch.paydayDay) }]),
    ...(patch.paydayOverride === undefined
      ? []
      : [
          {
            key: paydayOverrideKey,
            value: JSON.stringify(patch.paydayOverride),
          },
        ]),
    ...(patch.countSavingsInDaily === undefined
      ? []
      : [
          {
            key: countSavingsKey,
            value: JSON.stringify(patch.countSavingsInDaily),
          },
        ]),
    ...(patch.budgetPeriod === undefined
      ? []
      : [{ key: budgetPeriodKey, value: JSON.stringify(patch.budgetPeriod) }]),
    ...(patch.dailyMode === undefined
      ? []
      : [{ key: dailyModeKey, value: JSON.stringify(patch.dailyMode) }]),
    ...(patch.payYourselfFirst === undefined
      ? []
      : [
          {
            key: payFirstKey,
            value: JSON.stringify(patch.payYourselfFirst),
          },
        ]),
    ...(patch.emergencyMonths === undefined
      ? []
      : [{ key: emergencyKey, value: JSON.stringify(patch.emergencyMonths) }]),
    ...(patch.iouWriteOffAfterDays === undefined
      ? []
      : [
          {
            key: iouWriteOffKey,
            value: JSON.stringify(patch.iouWriteOffAfterDays),
          },
        ]),
  ];
  if (Object.keys(user).length > 0) {
    await db
      .updateTable('users')
      .set({ ...user, updated_at: at })
      .where('id', '=', userId)
      .execute();
  }
  for (const { key, value } of settings) {
    await db
      .insertInto('user_settings')
      .values({ user_id: userId, key, value, updated_at: at })
      .onConflict((oc) =>
        oc.columns(['user_id', 'key']).doUpdateSet({ value, updated_at: at }),
      )
      .execute();
  }
}

export async function updateLedgerSettings(
  db: Kysely<DB>,
  userId: string,
  patch: LedgerSettingsPatch,
  now: Date,
): Promise<LedgerSettingsView> {
  await db
    .transaction()
    .execute((trx) => applyLedgerSettings(trx, userId, patch, now));
  return readLedgerSettings(db, userId);
}
