import { randomUUID } from 'node:crypto';
import type { ExchangeRate } from '@allotr/core';
import {
  currencyCode,
  localDate,
  parseRate,
  type CurrencyCode,
  type ExchangeRateView,
  type LocalDate,
  type Rate,
} from '@allotr/shared';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.ts';
import { RequestProblem } from '../http/domain-errors.ts';
import { userToday, type Db } from './store.ts';

// Manual exchange rates (ADR 0010, FR-X2). They are only read when a figure
// is converted to the default currency; entries never change with them.
// One rate per pair and day: entering it again replaces the earlier value.

type RateRow = {
  id: string;
  base: string;
  quote: string;
  rate: string;
  as_of: string;
  source: string;
  created_at: string;
};

const columns = [
  'id',
  'base',
  'quote',
  'rate',
  'as_of',
  'source',
  'created_at',
] as const;

function toView(row: RateRow): ExchangeRateView {
  return {
    id: row.id,
    base: currencyCode(row.base),
    quote: currencyCode(row.quote),
    rate: parseRate(row.rate),
    asOf: localDate(row.as_of),
    source: 'manual',
    createdAt: row.created_at,
  };
}

/** Rates newest first, optionally only those involving `currency`. */
export async function listRates(
  db: Db,
  userId: string,
  currency?: CurrencyCode,
): Promise<ExchangeRateView[]> {
  let query = db
    .selectFrom('fx_rates')
    .select(columns)
    .where('user_id', '=', userId);
  if (currency !== undefined) {
    query = query.where((eb) =>
      eb.or([eb('base', '=', currency), eb('quote', '=', currency)]),
    );
  }
  const rows = await query
    .orderBy('as_of', 'desc')
    .orderBy('base')
    .orderBy('quote')
    .execute();
  return rows.map(toView);
}

/** Every rate of a user, as the projections read them. */
export async function loadRates(
  db: Db,
  userId: string,
): Promise<ExchangeRate[]> {
  return (await listRates(db, userId)).map(({ base, quote, rate, asOf }) => ({
    base,
    quote,
    rate,
    asOf,
  }));
}

export type RateInput = Readonly<{
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: Rate;
  asOf?: LocalDate | undefined;
}>;

export async function putRate(
  db: Kysely<DB>,
  userId: string,
  input: RateInput,
  now: Date,
): Promise<{ rate: ExchangeRateView; replaced: boolean }> {
  if (input.base === input.quote) {
    throw new RequestProblem(
      400,
      'same_currency',
      'A rate converts between two different currencies.',
    );
  }
  return db.transaction().execute(async (trx) => {
    const asOf = input.asOf ?? (await userToday(trx, userId, now));
    const existing = await trx
      .selectFrom('fx_rates')
      .select('id')
      .where('user_id', '=', userId)
      .where('base', '=', input.base)
      .where('quote', '=', input.quote)
      .where('as_of', '=', asOf)
      .executeTakeFirst();
    const row = {
      id: existing?.id ?? randomUUID(),
      base: input.base,
      quote: input.quote,
      rate: input.rate,
      as_of: asOf,
      source: 'manual',
      created_at: now.toISOString(),
    };
    if (existing === undefined) {
      await trx
        .insertInto('fx_rates')
        .values({ ...row, user_id: userId })
        .execute();
    } else {
      await trx
        .updateTable('fx_rates')
        .set({ rate: row.rate, created_at: row.created_at })
        .where('user_id', '=', userId)
        .where('id', '=', existing.id)
        .execute();
    }
    return { rate: toView(row), replaced: existing !== undefined };
  });
}

export async function deleteRate(
  db: Db,
  userId: string,
  id: string,
): Promise<void> {
  const result = await db
    .deleteFrom('fx_rates')
    .where('user_id', '=', userId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw new RequestProblem(
      404,
      'rate_not_found',
      'There is no such exchange rate.',
    );
  }
}
