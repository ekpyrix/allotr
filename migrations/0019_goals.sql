-- Savings goals (ADR 0021: goals are earmarks on savings). A goal is a target
-- amount, and optionally a date, on one account or one pool. Nothing is moved
-- and no posting carries a goal: progress is the balance of its target,
-- folded from the ledger when read. A goal is archived, never deleted.
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  pool_id TEXT,
  account_id TEXT,
  target_minor INTEGER NOT NULL CHECK (target_minor > 0),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  target_on TEXT CHECK (
    target_on IS NULL
    OR (
      target_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND date(target_on) = target_on
    )
  ),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((pool_id IS NULL) <> (account_id IS NULL)),
  UNIQUE (id, user_id),
  FOREIGN KEY (pool_id, user_id) REFERENCES pools (id, user_id),
  FOREIGN KEY (account_id, user_id) REFERENCES accounts (id, user_id)
) STRICT;

CREATE INDEX goals_user_id_idx ON goals (user_id);
-- One goal in use per pool and per account, so two goals never count the
-- same money twice.
CREATE UNIQUE INDEX goals_pool_idx
  ON goals (user_id, pool_id) WHERE pool_id IS NOT NULL AND archived = 0;
CREATE UNIQUE INDEX goals_account_idx
  ON goals (user_id, account_id) WHERE account_id IS NOT NULL AND archived = 0;
CREATE UNIQUE INDEX goals_name_idx
  ON goals (user_id, lower(name)) WHERE archived = 0;

CREATE TRIGGER goals_fixed_columns
BEFORE UPDATE OF user_id, pool_id, account_id, currency ON goals
BEGIN
  SELECT RAISE(ABORT, 'a goal target and currency are fixed');
END;
