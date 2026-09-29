-- Reconciliations (FR-L9): the bank's balance for an account on a date,
-- recorded when it matched the ledger or once the difference was posted as
-- an adjustment entry. A row whose adjustment was later undone no longer
-- counts as reconciled; readers check for the reversal. Rows are a record,
-- not the ledger: amounts are in the account's currency.

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
  CHECK ((stated_minor = computed_minor) = (adjustment_transaction_id IS NULL)),
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
