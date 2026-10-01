-- Cover (ADR 0021): when spending passes what a budget has left, the
-- shortfall is covered in the user's cover order, computed by core when
-- read. Nothing about the cover is stored except what the user chose:
-- the order, in user_settings (`cover_order`), and these per-entry
-- overrides. An override is a setting on the entry, not a ledger change; the
-- entry and its postings stay as recorded.
--
-- Each row asks one source (free money, or a budget by ID) to cover an
-- amount of the entry's shortfall. Core caps every row at what the source
-- had, and the shortfall left after the rows goes through the cover order.
CREATE TABLE cover_overrides (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  source TEXT NOT NULL CHECK (length(source) > 0),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  created_at TEXT NOT NULL,
  UNIQUE (transaction_id, position),
  UNIQUE (transaction_id, source),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id, user_id) REFERENCES transactions (id, user_id)
    ON DELETE CASCADE
) STRICT;

CREATE INDEX cover_overrides_user_id_idx ON cover_overrides (user_id);
