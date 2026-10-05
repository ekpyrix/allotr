import { randomUUID } from 'node:crypto';
import type { ExchangeRate, Transaction } from '@allotr/core';
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
// A foreign payment with no rate stored for its day leaves the rate it
// implied, with the source `implied`; a manual rate for the day replaces it.

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
    source: row.source === 'implied' ? 'implied' : 'manual',
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

/** Adds or replaces a rate inside the caller's database transaction. */
export async function upsertRate(
  db: Db,
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
  const asOf = input.asOf ?? (await userToday(db, userId, now));
  const existing = await db
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
    await db
      .insertInto('fx_rates')
      .values({ ...row, user_id: userId })
      .execute();
  } else {
    await db
      .updateTable('fx_rates')
      .set({ rate: row.rate, source: 'manual', created_at: row.created_at })
      .where('user_id', '=', userId)
      .where('id', '=', existing.id)
      .execute();
    // Entries no longer lean on it: the day's rate is now the user's own.
    await db
      .deleteFrom('fx_rate_entries')
      .where('user_id', '=', userId)
      .where('rate_id', '=', existing.id)
      .execute();
  }
  return { rate: toView(row), replaced: existing !== undefined };
}

export function putRate(
  db: Kysely<DB>,
  userId: string,
  input: RateInput,
  now: Date,
): Promise<{ rate: ExchangeRateView; replaced: boolean }> {
  return db.transaction().execute((trx) => upsertRate(trx, userId, input, now));
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

/**
 * Keeps the rate a foreign expense or income implied, when no rate between
 * its two currencies is stored for its day (either way round). A stored
 * rate is left alone, a manual one always wins, and the entry is noted
 * against an implied one so undoing it can take the rate back.
 */
export async function recordImpliedRate(
  db: Db,
  userId: string,
  transaction: Transaction,
  now: Date,
): Promise<void> {
  if (
    transaction.impliedRate === null ||
    (transaction.kind !== 'expense' && transaction.kind !== 'income')
  ) {
    return;
  }
  // The exchange legs book what was given up positive and what came out
  // negative, which is the direction the implied rate runs.
  const legs = await db
    .selectFrom('postings')
    .innerJoin('accounts', (join) =>
      join
        .onRef('accounts.id', '=', 'postings.account_id')
        .onRef('accounts.user_id', '=', 'postings.user_id'),
    )
    .select(['postings.amount_minor', 'postings.currency'])
    .where('postings.user_id', '=', userId)
    .where('postings.transaction_id', '=', transaction.id)
    .where('accounts.system_role', '=', 'conversion')
    .execute();
  const from = legs.find((leg) => leg.amount_minor > 0);
  const to = legs.find((leg) => leg.amount_minor < 0);
  if (from === undefined || to === undefined) return;

  const asOf = transaction.occurredOn;
  const stored = await db
    .selectFrom('fx_rates')
    .select(['id', 'source'])
    .where('user_id', '=', userId)
    .where('as_of', '=', asOf)
    .where((eb) =>
      eb.or([
        eb.and([eb('base', '=', from.currency), eb('quote', '=', to.currency)]),
        eb.and([eb('base', '=', to.currency), eb('quote', '=', from.currency)]),
      ]),
    )
    .executeTakeFirst();
  if (stored?.source === 'manual') return;
  let rateId = stored?.id;
  if (rateId === undefined) {
    rateId = randomUUID();
    await db
      .insertInto('fx_rates')
      .values({
        id: rateId,
        user_id: userId,
        base: from.currency,
        quote: to.currency,
        rate: transaction.impliedRate,
        as_of: asOf,
        source: 'implied',
        created_at: now.toISOString(),
      })
      .execute();
  }
  await db
    .insertInto('fx_rate_entries')
    .values({
      rate_id: rateId,
      transaction_id: transaction.id,
      user_id: userId,
    })
    .execute();
}

/**
 * Takes back what an undone entry left: it no longer leans on an implied
 * rate, and a rate no other entry implied goes with it.
 */
export async function releaseImpliedRate(
  db: Db,
  userId: string,
  transactionId: string,
): Promise<void> {
  const rows = await db
    .deleteFrom('fx_rate_entries')
    .where('user_id', '=', userId)
    .where('transaction_id', '=', transactionId)
    .returning('rate_id')
    .execute();
  for (const { rate_id: rateId } of rows) {
    await db
      .deleteFrom('fx_rates')
      .where('user_id', '=', userId)
      .where('id', '=', rateId)
      .where('source', '=', 'implied')
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('fx_rate_entries')
              .select('rate_id')
              .where('user_id', '=', userId)
              .whereRef('rate_id', '=', 'fx_rates.id'),
          ),
        ),
      )
      .execute();
  }
}
