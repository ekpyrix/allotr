-- Pools (ADR 0021): named groups of accounts with a switch for whether they
-- count toward the daily number. An account is in one pool on any day. The
-- default pools, Budget and Savings, stand for the on-budget and off-budget
-- groups: accounts follow those groups and their dated switches until they
-- are moved into another pool. A move is a dated row, never updated.
CREATE TABLE pools (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('spending', 'savings')),
  counts_toward_daily INTEGER NOT NULL CHECK (counts_toward_daily IN (0, 1)),
  -- The pool a switch to this budget group moves accounts into; the
  -- default pools cannot be archived.
  default_for TEXT CHECK (default_for IN ('on', 'off')),
  position INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    default_for IS NULL
    OR (default_for = 'on' AND kind = 'spending')
    OR (default_for = 'off' AND kind = 'savings')
  ),
  CHECK (default_for IS NULL OR archived = 0),
  UNIQUE (id, user_id)
) STRICT;

CREATE INDEX pools_user_id_idx ON pools (user_id);
CREATE UNIQUE INDEX pools_default_for_idx
  ON pools (user_id, default_for) WHERE default_for IS NOT NULL;
CREATE UNIQUE INDEX pools_name_idx
  ON pools (user_id, lower(name)) WHERE archived = 0;

CREATE TRIGGER pools_fixed_columns
BEFORE UPDATE OF user_id, kind, default_for ON pools
BEGIN
  SELECT RAISE(ABORT, 'a pool kind is fixed');
END;

CREATE TABLE pool_moves (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  effective_on TEXT NOT NULL CHECK (
    effective_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(effective_on) = effective_on
  ),
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, user_id) REFERENCES accounts (id, user_id),
  FOREIGN KEY (pool_id, user_id) REFERENCES pools (id, user_id)
) STRICT;

CREATE INDEX pool_moves_user_id_idx ON pool_moves (user_id);
CREATE INDEX pool_moves_account_id_idx ON pool_moves (account_id);

CREATE TRIGGER pool_moves_no_update
BEFORE UPDATE ON pool_moves
BEGIN
  SELECT RAISE(ABORT, 'pool moves are append-only');
END;

CREATE TRIGGER pool_moves_no_delete
BEFORE DELETE ON pool_moves
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  SELECT RAISE(ABORT, 'pool moves are append-only');
END;

-- Every user gets the two default pools, in the same transaction as the user.
CREATE TRIGGER users_seed_pools
AFTER INSERT ON users
BEGIN
  INSERT INTO pools
    (id, user_id, name, kind, counts_toward_daily, default_for, position,
     created_at, updated_at)
  VALUES
    (lower(hex(randomblob(16))), NEW.id, 'Budget', 'spending', 1, 'on', 1,
     NEW.created_at, NEW.created_at),
    (lower(hex(randomblob(16))), NEW.id, 'Savings', 'savings', 0, 'off', 2,
     NEW.created_at, NEW.created_at);
END;

-- Users from before this migration get them too; their accounts already
-- follow their budget group, so no move is needed.
INSERT INTO pools
  (id, user_id, name, kind, counts_toward_daily, default_for, position,
   created_at, updated_at)
SELECT lower(hex(randomblob(16))), u.id, 'Budget', 'spending', 1, 'on', 1,
       u.created_at, u.created_at
FROM users AS u;

INSERT INTO pools
  (id, user_id, name, kind, counts_toward_daily, default_for, position,
   created_at, updated_at)
SELECT lower(hex(randomblob(16))), u.id, 'Savings', 'savings', 0, 'off', 2,
       u.created_at, u.created_at
FROM users AS u;
