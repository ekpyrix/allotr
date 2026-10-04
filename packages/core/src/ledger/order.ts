import { rankBetween, type LocalTime } from '@allotr/shared';
import { LedgerError } from './errors.ts';
import type { Transaction, TransactionId } from './types.ts';

// The order of entries within a day (docs/domain.md "Order within a day").
// Every list and projection takes entries in this one order, so the cover a
// budget gives and the list the user sees never disagree. Entries with a
// time of day keep to time order; the rest go wherever the user puts them.

type Ordered = Pick<
  Transaction,
  'id' | 'occurredOn' | 'sortRank' | 'createdAt'
>;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Oldest first: by date, then place within the day, then (for entries not
 * yet placed) by when they were recorded, then by ID so the order never
 * depends on the input.
 */
export function compareEntries(a: Ordered, b: Ordered): number {
  return (
    compareText(a.occurredOn, b.occurredOn) ||
    (a.sortRank !== null && b.sortRank !== null
      ? compareText(a.sortRank, b.sortRank)
      : 0) ||
    compareText(a.createdAt, b.createdAt) ||
    compareText(a.id, b.id)
  );
}

/** An entry already placed in a day, as placement needs it. */
export type DaySlot = Readonly<{
  id: TransactionId;
  sortRank: string;
  occurredTime: LocalTime | null;
}>;

/** A day's entries in order. */
export function sortDay<T extends DaySlot>(day: readonly T[]): T[] {
  return [...day].sort(
    (a, b) => compareText(a.sortRank, b.sortRank) || compareText(a.id, b.id),
  );
}

// Whether an entry at `time` fits at index `at` of `day` (sorted) without
// putting timed entries out of time order. Equal times may go either way.
function fitsAt(
  day: readonly DaySlot[],
  time: LocalTime | null,
  at: number,
): boolean {
  if (time === null) return true;
  return (
    day
      .slice(0, at)
      .every((s) => s.occurredTime === null || s.occurredTime <= time) &&
    day
      .slice(at)
      .every((s) => s.occurredTime === null || s.occurredTime >= time)
  );
}

function rankAt(day: readonly DaySlot[], at: number): string {
  return rankBetween(day[at - 1]?.sortRank ?? null, day[at]?.sortRank ?? null);
}

// Where a new entry goes by default: at the end of the day, or, with a
// time, right after the last entry timed no later than it.
function defaultIndex(day: readonly DaySlot[], time: LocalTime | null): number {
  if (time === null) return day.length;
  const lastNotLater = day.findLastIndex(
    (s) => s.occurredTime !== null && s.occurredTime <= time,
  );
  if (lastNotLater >= 0) return lastNotLater + 1;
  const firstLater = day.findIndex(
    (s) => s.occurredTime !== null && s.occurredTime > time,
  );
  return firstLater >= 0 ? firstLater : day.length;
}

/**
 * The rank for a new entry in a day. With `after`, it goes right after
 * that entry when it is in the day and its time allows, as an edit or a
 * restored copy keeps the place of the entry it replaces; otherwise the
 * default place is used.
 */
export function placeEntry(
  day: readonly DaySlot[],
  entry: Readonly<{ occurredTime: LocalTime | null }>,
  after?: TransactionId,
): string {
  const sorted = sortDay(day);
  if (after !== undefined) {
    const index = sorted.findIndex((s) => s.id === after);
    if (index >= 0 && fitsAt(sorted, entry.occurredTime, index + 1)) {
      return rankAt(sorted, index + 1);
    }
  }
  return rankAt(sorted, defaultIndex(sorted, entry.occurredTime));
}

/**
 * The new rank for moving an entry within its day to right after `afterId`
 * (null for the start of the day). An entry with a time can only move
 * where timed entries stay in time order.
 */
export function moveEntry(
  day: readonly DaySlot[],
  id: TransactionId,
  afterId: TransactionId | null,
): string {
  const sorted = sortDay(day);
  const moving = sorted.find((s) => s.id === id);
  if (moving === undefined) {
    throw new LedgerError(
      'ledger.not_found',
      `Entry ${id} is not in this day.`,
    );
  }
  if (afterId === id) {
    throw new LedgerError(
      'ledger.invalid_transaction',
      'An entry cannot move after itself.',
    );
  }
  const others = sorted.filter((s) => s.id !== id);
  const at =
    afterId === null ? 0 : others.findIndex((s) => s.id === afterId) + 1;
  if (at === 0 && afterId !== null) {
    throw new LedgerError(
      'ledger.different_day',
      'An entry can only move within its own day. Change its date instead.',
    );
  }
  if (!fitsAt(others, moving.occurredTime, at)) {
    throw new LedgerError(
      'ledger.out_of_time_order',
      'This entry has a time, so it stays in time order. Clear or change its time to move it here.',
    );
  }
  return rankAt(others, at);
}
