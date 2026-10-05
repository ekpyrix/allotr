-- Rates a foreign payment implied (docs/domain.md "Exchange rates").
--
-- When an entry with a foreign amount is saved and no rate for its pair is
-- stored on its day, the rate the payment itself implied is stored with the
-- source `implied`. A manual rate for the day replaces it. SQLite cannot
-- widen a CHECK in place, so the table is rebuilt.
CREATE TABLE fx_rates_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  base TEXT NOT NULL CHECK (base GLOB '[A-Z][A-Z][A-Z]'),
  quote TEXT NOT NULL CHECK (quote GLOB '[A-Z][A-Z][A-Z]'),
  rate TEXT NOT NULL CHECK (
    rate GLOB '[0-9]*' AND rate NOT GLOB '*[^0-9.]*' AND rate GLOB '*[1-9]*'
  ),
  as_of TEXT NOT NULL CHECK (
    as_of GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(as_of) = as_of
  ),
  source TEXT NOT NULL CHECK (source IN ('manual', 'implied')),
  created_at TEXT NOT NULL,
  CHECK (base <> quote),
  UNIQUE (user_id, base, quote, as_of),
  UNIQUE (id, user_id)
) STRICT;

INSERT INTO fx_rates_new (id, user_id, base, quote, rate, as_of, source, created_at)
SELECT id, user_id, base, quote, rate, as_of, source, created_at FROM fx_rates;

DROP TABLE fx_rates;
ALTER TABLE fx_rates_new RENAME TO fx_rates;

-- Which entries relied on an implied rate. Undoing the last of them removes
-- the rate; a manual rate for the day drops the rows.
CREATE TABLE fx_rate_entries (
  rate_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (rate_id, transaction_id),
  FOREIGN KEY (rate_id, user_id) REFERENCES fx_rates (id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (transaction_id, user_id) REFERENCES transactions (id, user_id)
    ON DELETE CASCADE
) STRICT;

CREATE INDEX fx_rate_entries_by_transaction
  ON fx_rate_entries (user_id, transaction_id);
