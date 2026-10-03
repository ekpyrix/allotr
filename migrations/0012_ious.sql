-- IOUs and split bills (ADR 0024). What people owe the user sits in a
-- Receivables system account and what the user owes in Payables, one of each
-- per currency, so two system roles are added. SQLite cannot change a CHECK
-- in place, so accounts is rebuilt: its rows are parked, the table is dropped
-- and created again under the same name, and the rows come back. Foreign
-- keys are deferred to the end of the migration's transaction, by which time
-- every referenced row is back (the rows must be inserted into the table
-- that is referenced by name for the check to be satisfied).
PRAGMA defer_foreign_keys = ON;

CREATE TABLE accounts_parked AS SELECT * FROM accounts;
DROP TABLE accounts;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind TEXT NOT NULL CHECK (
    kind IN ('asset', 'liability', 'receivable', 'payable',
             'expense', 'income', 'equity')
  ),
  system_role TEXT CHECK (
    system_role IN ('expenses', 'income', 'opening', 'conversion',
                    'receivables', 'payables')
  ),
  budget_group TEXT CHECK (budget_group IN ('on', 'off')),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (system_role IS NULL AND budget_group IS NOT NULL
      AND kind IN ('asset', 'liability', 'receivable', 'payable'))
    OR (system_role IS NOT NULL AND budget_group IS NULL
      AND kind = CASE system_role
        WHEN 'expenses' THEN 'expense'
        WHEN 'income' THEN 'income'
        WHEN 'receivables' THEN 'receivable'
        WHEN 'payables' THEN 'payable'
        ELSE 'equity'
      END)
  ),
  UNIQUE (id, user_id, currency)
) STRICT;

CREATE INDEX accounts_user_id_idx ON accounts (user_id);
CREATE UNIQUE INDEX accounts_id_user_idx ON accounts (id, user_id);
CREATE UNIQUE INDEX accounts_system_role_idx
  ON accounts (user_id, system_role, currency)
  WHERE system_role IS NOT NULL;
CREATE UNIQUE INDEX accounts_name_idx
  ON accounts (user_id, lower(name))
  WHERE system_role IS NULL AND archived = 0;

-- Foreign keys from other tables need the unique index to exist before the
-- first row goes back in.
INSERT INTO accounts
  (id, user_id, name, kind, system_role, budget_group, currency, archived,
   created_at, updated_at)
SELECT id, user_id, name, kind, system_role, budget_group, currency, archived,
       created_at, updated_at
FROM accounts_parked;
DROP TABLE accounts_parked;

CREATE TRIGGER accounts_fixed_columns
BEFORE UPDATE OF user_id, kind, system_role, budget_group, currency ON accounts
BEGIN
  SELECT RAISE(ABORT, 'account kind, group and currency are fixed');
END;

-- One row per person per entry that lent or borrowed. The entry holds the
-- money (a posting per person on the Receivables or Payables account); the
-- row says who owes it and when. Only the name and the due date can be
-- corrected later: they are not part of the ledger.
CREATE TABLE ious (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('owed-to-me', 'owed-by-me')),
  person TEXT NOT NULL CHECK (length(trim(person)) > 0 AND length(person) <= 100),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  origin_transaction_id TEXT NOT NULL,
  due_on TEXT CHECK (
    due_on IS NULL
    OR (due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(due_on) = due_on)
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (origin_transaction_id, user_id)
    REFERENCES transactions (id, user_id)
) STRICT;

CREATE INDEX ious_user_id_idx ON ious (user_id);
CREATE INDEX ious_origin_idx ON ious (origin_transaction_id);
CREATE INDEX ious_person_idx ON ious (user_id, lower(person));

CREATE TRIGGER ious_fixed_columns
BEFORE UPDATE OF user_id, direction, amount_minor, currency,
  origin_transaction_id, created_at ON ious
BEGIN
  SELECT RAISE(ABORT, 'an IOU keeps its direction, amount and entry');
END;

CREATE TRIGGER ious_no_delete
BEFORE DELETE ON ious
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  SELECT RAISE(ABORT, 'IOUs are never deleted; undo the entry instead');
END;

-- The entries that took an amount off an IOU: a repayment, or the write-off
-- of what was left. Undoing the entry undoes the settlement; the row stays.
CREATE TABLE iou_settlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  iou_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('repayment', 'write-off')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (iou_id, user_id) REFERENCES ious (id, user_id),
  FOREIGN KEY (transaction_id, user_id) REFERENCES transactions (id, user_id)
) STRICT;

CREATE INDEX iou_settlements_user_id_idx ON iou_settlements (user_id);
CREATE INDEX iou_settlements_iou_idx ON iou_settlements (iou_id);
CREATE INDEX iou_settlements_transaction_idx
  ON iou_settlements (transaction_id);

CREATE TRIGGER iou_settlements_no_update
BEFORE UPDATE ON iou_settlements
BEGIN
  SELECT RAISE(ABORT, 'IOU settlements are append-only');
END;

CREATE TRIGGER iou_settlements_no_delete
BEFORE DELETE ON iou_settlements
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  SELECT RAISE(ABORT, 'IOU settlements are append-only');
END;
