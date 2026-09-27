-- Bill payments, only as far as the reserve needs them (docs/domain.md
-- "Daily usable"): a payment settles one due date and releases that bill's
-- reserve from the day it was paid. It may point at the entry that paid it.
-- Unlike postings these rows are not the ledger, so undoing a payment
-- deletes its row. M4 adds the payment flows on top.

-- Target for the composite foreign key below, which keeps a payment in its
-- bill's user.
CREATE UNIQUE INDEX bills_id_user_idx ON bills (id, user_id);

CREATE TABLE bill_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  bill_id TEXT NOT NULL,
  due_on TEXT NOT NULL CHECK (
    due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(due_on) = due_on
  ),
  paid_on TEXT NOT NULL CHECK (
    paid_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(paid_on) = paid_on
  ),
  transaction_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (bill_id, due_on),
  FOREIGN KEY (bill_id, user_id) REFERENCES bills (id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (transaction_id, user_id) REFERENCES transactions (id, user_id)
) STRICT;

CREATE INDEX bill_payments_user_id_idx ON bill_payments (user_id);
CREATE INDEX bill_payments_transaction_id_idx ON bill_payments (transaction_id);
