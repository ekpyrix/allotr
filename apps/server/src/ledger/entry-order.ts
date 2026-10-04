import {
  localTime,
  type LocalDate,
  type LocalTime,
  RANK_MAX_LENGTH,
  rankSequence,
} from '@allotr/shared';
import {
  moveEntry,
  placeEntry,
  sortDay,
  transactionId,
  type DaySlot,
  type TransactionId,
} from '@allotr/core';
import type { Db } from './store.ts';

// Ranks for the order of entries within a day (docs/domain.md "Order within
// a day"). The rules are in core; this reads and writes transaction_ranks.

/** A user's entries on one day with their place and time. */
export async function loadDay(
  db: Db,
  userId: string,
  occurredOn: LocalDate,
): Promise<DaySlot[]> {
  const rows = await db
    .selectFrom('transaction_ranks')
    .innerJoin(
      'transactions',
      'transactions.id',
      'transaction_ranks.transaction_id',
    )
    .select([
      'transaction_ranks.transaction_id',
      'transaction_ranks.sort_rank',
      'transactions.occurred_time',
    ])
    .where('transaction_ranks.user_id', '=', userId)
    .where('transaction_ranks.occurred_on', '=', occurredOn)
    .execute();
  return sortDay(
    rows.map((row) => ({
      id: transactionId(row.transaction_id),
      sortRank: row.sort_rank,
      occurredTime:
        row.occurred_time === null ? null : localTime(row.occurred_time),
    })),
  );
}

// Spreads a day's keys out again, in the same order, once inserts at one
// spot have made them long.
async function renumber(
  db: Db,
  userId: string,
  day: readonly DaySlot[],
  now: Date,
): Promise<DaySlot[]> {
  const keys = rankSequence(day.length);
  const renumbered = day.map((slot, i) => ({
    ...slot,
    sortRank: keys[i] ?? slot.sortRank,
  }));
  for (const slot of renumbered) {
    await db
      .updateTable('transaction_ranks')
      .set({ sort_rank: slot.sortRank, updated_at: now.toISOString() })
      .where('user_id', '=', userId)
      .where('transaction_id', '=', slot.id)
      .execute();
  }
  return renumbered;
}

// Works out a rank, renumbering the day first if the key would be too long.
async function withRoom(
  db: Db,
  userId: string,
  day: DaySlot[],
  now: Date,
  rankIn: (day: readonly DaySlot[]) => string,
): Promise<string> {
  const rank = rankIn(day);
  if (rank.length <= RANK_MAX_LENGTH) return rank;
  return rankIn(await renumber(db, userId, day, now));
}

/**
 * Gives a newly stored entry its place in its day, inside the caller's
 * transaction. `after` keeps the place of an entry it replaces.
 */
export async function placeNewEntry(
  db: Db,
  userId: string,
  entry: Readonly<{
    id: TransactionId;
    occurredOn: LocalDate;
    occurredTime: LocalTime | null;
  }>,
  now: Date,
  after?: TransactionId,
): Promise<void> {
  const day = await loadDay(db, userId, entry.occurredOn);
  const sortRank = await withRoom(db, userId, day, now, (d) =>
    placeEntry(d, entry, after),
  );
  await db
    .insertInto('transaction_ranks')
    .values({
      transaction_id: entry.id,
      user_id: userId,
      occurred_on: entry.occurredOn,
      sort_rank: sortRank,
      updated_at: now.toISOString(),
    })
    .execute();
}

/**
 * Moves an entry within its day to right after `afterId`, or to the start
 * of the day when that is null. Returns the day's entries in their new
 * order.
 */
export async function moveInDay(
  db: Db,
  userId: string,
  id: TransactionId,
  occurredOn: LocalDate,
  afterId: TransactionId | null,
  now: Date,
): Promise<TransactionId[]> {
  const day = await loadDay(db, userId, occurredOn);
  const sortRank = await withRoom(db, userId, day, now, (d) =>
    moveEntry(d, id, afterId),
  );
  await db
    .updateTable('transaction_ranks')
    .set({ sort_rank: sortRank, updated_at: now.toISOString() })
    .where('user_id', '=', userId)
    .where('transaction_id', '=', id)
    .execute();
  return (await loadDay(db, userId, occurredOn)).map((slot) => slot.id);
}
