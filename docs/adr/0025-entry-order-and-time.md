# 0025. Order of entries within a day, and an optional time of day

- Status: Accepted
- Date: 2026-10-04

## Context

Entries carry only a date (`occurred_on`). Within a day, every list and every
projection that walks entries one by one (budget cover "per line, in time
order", the free money just before an entry, budget switches, cycles) ordered
them by `created_at`, then by a random UUID. As a result:

- users could not fix the order of entries logged after the fact (a batch
  typed in the evening, an offline queue arriving late);
- users could not record when something happened;
- an edit or a restore moved the entry to the end of its day, because the
  replacement gets a new `created_at`, which could change which budget
  covered a shortfall.

The ledger is append-only (domain.md invariant 2, `.agent/rules/ledger.md`):
`transactions` and `postings` are never updated.

## Decision

1. **One order everywhere.** Lists, exports and every projection that takes
   entries one at a time use the same order: date, then the entry's place in
   its day, then ID. Implemented once as `compareEntries` in
   `packages/core/src/ledger/order.ts`.
2. **The place is not part of the entry.** It is stored in a separate table,
   `transaction_ranks(transaction_id, user_id, occurred_on, sort_rank,
   updated_at)`, one row per transaction, written in the same database
   transaction as the entry. Only `sort_rank` may change after that (a
   trigger keeps the entry and day fixed). `transactions` and `postings` stay
   fully append-only; no ledger rule is relaxed.
3. **Ranks are fractional-index keys.** Base-62 strings that never end in the
   lowest digit, so a key always fits between two others and a move updates
   one row. A day whose keys grow past 64 characters is renumbered evenly.
   Keys compare as plain strings (SQLite BINARY collation; `<` in code, never
   `localeCompare`). Existing entries were backfilled in their old order.
4. **Time of day is part of the entry.** `transactions.occurred_time`,
   `HH:MM` on a 24-hour clock in the user's time zone, set when the entry is
   recorded and changed only by an edit, exactly like the date. Reversals
   copy their original's time.
5. **Time wins, then manual order.** Timed entries in a day always stay in
   time order: a new timed entry goes right after the last one timed no
   later; a move that would break time order is refused
   (`out_of_time_order`) and the user changes or clears the time instead.
   Untimed entries go anywhere; by default at the end of the day.
6. **Moves stay within a day.** Moving to another day is a change of date,
   i.e. an edit (reversal plus new entry), as before.
7. **Edits, restores and undos keep their place.** A replacement or a
   restored copy goes right after the entry it replaces when the day and
   time allow; an undo goes right after its entry.
8. **The time of day is a per-user setting** (`entryTimes`): `off` (default),
   `optional`, or `prefill-now` (the form fills in the current time for
   today's entries). Times already recorded are shown and kept whatever the
   setting. Imports keep their times regardless.

## Alternatives considered

- **A mutable `sort_rank` column on `transactions`**, with the update trigger
  narrowed to the other columns. One fewer join, but it is the first
  exception to "transactions are never updated", which the ledger rule says
  needs an ADR before any code. Rejected in favour of the side table.
- **Integer positions per day.** Simple, but a move renumbers the day.
- **Order recorded as append-only "move" rows.** Keeps a history of moves,
  but every read has to replay them; the history has no use the audit trail
  needs.
- **A full timestamp instead of date plus optional time.** Forces a time on
  every entry and makes "the day" depend on time-zone conversions at read
  time. Rejected: the calendar date stays the primary fact.
- **Display-only order** (projections keep `created_at`). Rejected: the list
  and the figures must not disagree.

## Consequences

- Moving an entry on a past day can change which budget covered a shortfall
  then, as a back-dated entry can. Balances and totals never change.
- The list cursor is `(occurred_on, sort_rank, id)`; old cursors are refused
  as `invalid_cursor` and clients refetch.
- The JSON bundle carries `time` and keeps the order within a day by array
  order; CSV gains a trailing `time` column; Beancount gets `time` metadata.
- The chat grammar gains an optional `HH:MM` token (docs/grammar.md), kept
  only when entry times are on.
