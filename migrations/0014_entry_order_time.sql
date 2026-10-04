-- The order of entries within a day, and an optional time of day
-- (docs/domain.md "Order within a day").
--
-- The time an entry happened is part of the entry, like its date: it is
-- set when the entry is recorded and changes only through an edit, so the
-- append-only triggers on transactions still hold. HH:MM on a 24-hour
-- clock in the user's time zone.
ALTER TABLE transactions ADD COLUMN occurred_time TEXT CHECK (
  occurred_time GLOB '[0-2][0-9]:[0-5][0-9]' AND occurred_time <= '23:59'
);

-- An entry's place within its day is not part of the entry: the user can
-- rearrange a day without recording anything new. It lives here so that
-- transactions and postings stay append-only. Every transaction has one
-- row, written in the same database transaction as the entry. sort_rank is
-- a base-62 key that never ends in '0' (packages/shared/src/rank.ts), so a
-- key always fits between two others; keys compare with BINARY collation.
-- occurred_on repeats the entry's date so a day's order is one index read.
CREATE TABLE transaction_ranks (
  transaction_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  sort_rank TEXT NOT NULL CHECK (
    length(sort_rank) BETWEEN 1 AND 64
    AND sort_rank NOT GLOB '*[^0-9A-Za-z]*'
    AND sort_rank GLOB '*[1-9A-Za-z]'
  ),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (transaction_id, user_id) REFERENCES transactions (id, user_id)
    ON DELETE CASCADE
) STRICT;

CREATE INDEX transaction_ranks_day_idx
  ON transaction_ranks (user_id, occurred_on, sort_rank);

-- Only the rank moves; the entry it belongs to and its day do not.
CREATE TRIGGER transaction_ranks_fixed_entry
BEFORE UPDATE OF transaction_id, user_id, occurred_on ON transaction_ranks
BEGIN
  SELECT RAISE(ABORT, 'a rank stays with its entry and day');
END;

-- Existing entries keep the order they had: by when they were recorded.
-- Fixed-width keys sort the same as their numbers.
INSERT INTO transaction_ranks
  (transaction_id, user_id, occurred_on, sort_rank, updated_at)
SELECT
  id,
  user_id,
  occurred_on,
  printf(
    '%06dV',
    row_number() OVER (
      PARTITION BY user_id, occurred_on ORDER BY created_at, id
    )
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM transactions;
