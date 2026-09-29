-- Reconciliations (FR-L9): the bank's balance for an account on a date.
-- The default policy records one when it matched the ledger or once the
-- difference was posted as an adjustment entry; a flag-only policy (M4)
-- may record a difference without one. A row counts as reconciled when the
-- balances matched or its adjustment was not undone since; readers check
-- for the reversal. Rows are a record, not the ledger: amounts are in the
-- account's currency.

CREATE TABLE reconciliations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  on_date TEXT NOT NULL CHECK (
    on_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(on_date) = on_date
  ),
  -- The bank's balance, and the ledger's at the end of on_date before any
  -- adjustment.
  stated_minor INTEGER NOT NULL,
  computed_minor INTEGER NOT NULL,
  adjustment_transaction_id TEXT,
  created_at TEXT NOT NULL,
  CHECK (adjustment_transaction_id IS NULL OR stated_minor <> computed_minor),
  FOREIGN KEY (account_id, user_id, currency)
    REFERENCES accounts (id, user_id, currency),
  FOREIGN KEY (adjustment_transaction_id, user_id)
    REFERENCES transactions (id, user_id)
) STRICT;

CREATE INDEX reconciliations_account_idx
  ON reconciliations (account_id, on_date);
CREATE INDEX reconciliations_user_id_idx ON reconciliations (user_id);
CREATE INDEX reconciliations_adjustment_idx
  ON reconciliations (adjustment_transaction_id);
