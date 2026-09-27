-- The M1 ledger (docs/domain.md): accounts, categories, tags, append-only
-- transactions and postings, minimal bills, manual exchange rates and
-- per-user ledger settings. Dates are `YYYY-MM-DD` text, instants ISO 8601
-- UTC text, amounts integer minor units with an ISO 4217 code.

-- Better Auth's sign-in accounts move aside so `accounts` means ledger
-- accounts, as in docs/domain.md.
ALTER TABLE accounts RENAME TO auth_accounts;
DROP INDEX accounts_user_id_idx;
CREATE INDEX auth_accounts_user_id_idx ON auth_accounts (user_id);

-- Ledger settings that most figures need. Defaults suit a new install;
-- onboarding and settings change them.
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE users ADD COLUMN tz TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'USD'
  CHECK (default_currency GLOB '[A-Z][A-Z][A-Z]');

-- Per-user policy settings (payday day, payday override, later the M4
-- policies). Values are JSON text, as in instance_settings.
CREATE TABLE user_settings (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
) STRICT;

-- User-facing accounts are asset, liability, receivable or payable and sit
-- in a budget group. System accounts balance the other side of an entry:
-- one per role and currency (Expenses, Income, Equity:Opening,
-- Equity:Conversion). The currency never changes (ADR 0010); budget_group
-- is the group at creation, later switches are dated system transactions.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind TEXT NOT NULL CHECK (
    kind IN ('asset', 'liability', 'receivable', 'payable',
             'expense', 'income', 'equity')
  ),
  system_role TEXT CHECK (
    system_role IN ('expenses', 'income', 'opening', 'conversion')
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
        ELSE 'equity'
      END)
  ),
  -- Targets for the composite foreign keys below, which keep postings and
  -- bills in their account's user and currency (invariants 3 and 7).
  UNIQUE (id, user_id, currency)
) STRICT;

CREATE INDEX accounts_user_id_idx ON accounts (user_id);
-- A foreign key needs a unique index on exactly its columns; this one serves
-- references that do not carry a currency.
CREATE UNIQUE INDEX accounts_id_user_idx ON accounts (id, user_id);
CREATE UNIQUE INDEX accounts_system_role_idx
  ON accounts (user_id, system_role, currency)
  WHERE system_role IS NOT NULL;
CREATE UNIQUE INDEX accounts_name_idx
  ON accounts (user_id, lower(name))
  WHERE system_role IS NULL AND archived = 0;

-- Only the name, archived flag and updated_at change after creation.
CREATE TRIGGER accounts_fixed_columns
BEFORE UPDATE OF user_id, kind, system_role, budget_group, currency ON accounts
BEGIN
  SELECT RAISE(ABORT, 'account kind, group and currency are fixed');
END;

-- Two levels: a parent (parent_id NULL) and its children, of the same kind.
-- A category in use is never deleted; it is merged into another one, and
-- merged_into_id redirects it so committed transactions stay untouched.
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
  parent_id TEXT,
  is_paycheck INTEGER NOT NULL DEFAULT 0 CHECK (is_paycheck IN (0, 1)),
  default_account_id TEXT,
  merged_into_id TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (is_paycheck = 0 OR kind = 'income'),
  UNIQUE (id, user_id),
  FOREIGN KEY (parent_id, user_id) REFERENCES categories (id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (merged_into_id, user_id) REFERENCES categories (id, user_id),
  FOREIGN KEY (default_account_id, user_id) REFERENCES accounts (id, user_id)
) STRICT;

CREATE INDEX categories_user_id_idx ON categories (user_id);
CREATE INDEX categories_parent_id_idx ON categories (parent_id);
CREATE UNIQUE INDEX categories_name_idx
  ON categories (user_id, coalesce(parent_id, ''), lower(name))
  WHERE merged_into_id IS NULL;

CREATE TRIGGER categories_two_levels_insert
BEFORE INSERT ON categories
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'a category has at most two levels')
  WHERE (SELECT parent_id FROM categories WHERE id = NEW.parent_id) IS NOT NULL
     OR EXISTS (SELECT 1 FROM categories WHERE parent_id = NEW.id);
  SELECT RAISE(ABORT, 'a subcategory has the kind of its parent')
  WHERE (SELECT kind FROM categories WHERE id = NEW.parent_id) <> NEW.kind;
END;

CREATE TRIGGER categories_two_levels_update
BEFORE UPDATE OF parent_id, kind ON categories
BEGIN
  SELECT RAISE(ABORT, 'a category has at most two levels')
  WHERE NEW.parent_id IS NOT NULL AND (
    (SELECT parent_id FROM categories WHERE id = NEW.parent_id) IS NOT NULL
    OR EXISTS (SELECT 1 FROM categories WHERE parent_id = NEW.id)
  );
  SELECT RAISE(ABORT, 'a subcategory has the kind of its parent')
  WHERE (SELECT kind FROM categories WHERE id = NEW.parent_id) <> NEW.kind
     OR EXISTS (SELECT 1 FROM categories WHERE parent_id = NEW.id AND kind <> NEW.kind);
END;

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id)
) STRICT;

CREATE UNIQUE INDEX tags_name_idx ON tags (user_id, lower(name));

-- The append-only ledger (docs/domain.md, invariants 1–4). Undo is a
-- reversal that references the original and carries its date, so figures
-- for every past day are corrected too; an edit is a reversal plus a new
-- transaction. A budget switch moves switch_account_id into
-- switch_budget_group from occurred_on and has no postings. Later
-- milestones add kinds and sources in new migrations.
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN ('expense', 'income', 'transfer', 'opening', 'write_off',
             'budget_switch', 'reversal')
  ),
  occurred_on TEXT NOT NULL CHECK (
    occurred_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(occurred_on) = occurred_on
  ),
  created_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('api', 'import', 'system')),
  category_id TEXT,
  note TEXT,
  reverses_id TEXT UNIQUE,
  idempotency_key TEXT,
  -- Units of the received currency per unit sent, for cross-currency
  -- transfers (ADR 0010). An exact decimal string, informational only.
  fx_rate_implied TEXT CHECK (
    fx_rate_implied GLOB '[0-9]*' AND fx_rate_implied NOT GLOB '*[^0-9.]*'
  ),
  switch_account_id TEXT,
  switch_budget_group TEXT CHECK (switch_budget_group IN ('on', 'off')),
  CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL)),
  CHECK (
    (kind = 'budget_switch')
      = (switch_account_id IS NOT NULL AND switch_budget_group IS NOT NULL)
  ),
  CHECK ((switch_account_id IS NULL) = (switch_budget_group IS NULL)),
  UNIQUE (id, user_id),
  UNIQUE (user_id, idempotency_key),
  FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id),
  FOREIGN KEY (reverses_id, user_id) REFERENCES transactions (id, user_id),
  FOREIGN KEY (switch_account_id, user_id) REFERENCES accounts (id, user_id)
) STRICT;

CREATE INDEX transactions_user_date_idx
  ON transactions (user_id, occurred_on);
CREATE INDEX transactions_category_id_idx ON transactions (category_id);

-- One leg of a transaction. The composite key to accounts makes the
-- posting's currency its account's currency and keeps it in one user.
-- category_id marks the balancing leg (ready for split entries in M2).
CREATE TABLE postings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  currency TEXT NOT NULL,
  category_id TEXT,
  position INTEGER NOT NULL,
  UNIQUE (transaction_id, position),
  FOREIGN KEY (transaction_id, user_id) REFERENCES transactions (id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (account_id, user_id, currency)
    REFERENCES accounts (id, user_id, currency),
  FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id)
) STRICT;

CREATE INDEX postings_account_id_idx ON postings (account_id);
CREATE INDEX postings_user_id_idx ON postings (user_id);

CREATE TABLE transaction_tags (
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (transaction_id, tag_id),
  FOREIGN KEY (transaction_id, user_id) REFERENCES transactions (id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (tag_id, user_id) REFERENCES tags (id, user_id)
    ON DELETE CASCADE
) STRICT;

CREATE INDEX transaction_tags_tag_id_idx ON transaction_tags (tag_id);

-- Committed entries never change (invariant 2). Rows go only when their
-- user is deleted: the user row is gone before the cascade reaches them.
CREATE TRIGGER transactions_no_update
BEFORE UPDATE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'transactions are append-only');
END;

CREATE TRIGGER transactions_no_delete
BEFORE DELETE ON transactions
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  SELECT RAISE(ABORT, 'transactions are append-only');
END;

CREATE TRIGGER postings_no_update
BEFORE UPDATE ON postings
BEGIN
  SELECT RAISE(ABORT, 'postings are append-only');
END;

CREATE TRIGGER postings_no_delete
BEFORE DELETE ON postings
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  SELECT RAISE(ABORT, 'postings are append-only');
END;

CREATE TRIGGER transaction_tags_no_update
BEFORE UPDATE ON transaction_tags
BEGIN
  SELECT RAISE(ABORT, 'transaction tags are append-only');
END;

CREATE TRIGGER transaction_tags_no_delete
BEFORE DELETE ON transaction_tags
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  SELECT RAISE(ABORT, 'transaction tags are append-only');
END;

-- Bills, only as far as the daily figure needs them: the amount reserved
-- at payday until the bill is paid. Cadence and reminders come in M4.
CREATE TABLE bills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  account_id TEXT NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id, user_id, currency)
    REFERENCES accounts (id, user_id, currency)
) STRICT;

CREATE INDEX bills_user_id_idx ON bills (user_id);

-- Exchange rates for reporting only (ADR 0010): how many units of `quote`
-- one unit of `base` buys, as an exact decimal string. Manual in M1.
CREATE TABLE fx_rates (
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
  source TEXT NOT NULL CHECK (source IN ('manual')),
  created_at TEXT NOT NULL,
  CHECK (base <> quote),
  UNIQUE (user_id, base, quote, as_of)
) STRICT;

-- The compact starter set (docs/domain.md), copied into every new user's
-- categories as ordinary editable rows. Reference data, not user-owned.
CREATE TABLE starter_categories (
  name TEXT NOT NULL,
  parent_name TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  is_paycheck INTEGER NOT NULL CHECK (is_paycheck IN (0, 1)),
  position INTEGER NOT NULL,
  UNIQUE (parent_name, name)
) STRICT;

INSERT INTO starter_categories (name, parent_name, kind, is_paycheck, position) VALUES
  ('Food', NULL, 'expense', 0, 1),
  ('Groceries', 'Food', 'expense', 0, 1),
  ('Eating out', 'Food', 'expense', 0, 2),
  ('Transport', NULL, 'expense', 0, 2),
  ('Housing', NULL, 'expense', 0, 3),
  ('Rent', 'Housing', 'expense', 0, 1),
  ('Utilities', 'Housing', 'expense', 0, 2),
  ('Bills and subscriptions', NULL, 'expense', 0, 4),
  ('Health', NULL, 'expense', 0, 5),
  ('Shopping', NULL, 'expense', 0, 6),
  ('Fun', NULL, 'expense', 0, 7),
  ('Other', NULL, 'expense', 0, 8),
  ('Paycheck', NULL, 'income', 1, 1),
  ('Other income', NULL, 'income', 0, 2);

-- Seeds in the database so every way of creating a user gets them, in the
-- same transaction. Parents first, then children found by parent name.
CREATE TRIGGER users_seed_categories
AFTER INSERT ON users
BEGIN
  INSERT INTO categories
    (id, user_id, name, kind, parent_id, is_paycheck, position, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), NEW.id, name, kind, NULL, is_paycheck,
         position, NEW.created_at, NEW.created_at
  FROM starter_categories WHERE parent_name IS NULL;

  INSERT INTO categories
    (id, user_id, name, kind, parent_id, is_paycheck, position, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), NEW.id, s.name, s.kind, p.id,
         s.is_paycheck, s.position, NEW.created_at, NEW.created_at
  FROM starter_categories AS s
  JOIN categories AS p
    ON p.user_id = NEW.id AND p.parent_id IS NULL AND p.name = s.parent_name;
END;

-- Users from before this migration get the same set.
INSERT INTO categories
  (id, user_id, name, kind, parent_id, is_paycheck, position, created_at, updated_at)
SELECT lower(hex(randomblob(16))), u.id, s.name, s.kind, NULL, s.is_paycheck,
       s.position, u.created_at, u.created_at
FROM users AS u CROSS JOIN starter_categories AS s
WHERE s.parent_name IS NULL;

INSERT INTO categories
  (id, user_id, name, kind, parent_id, is_paycheck, position, created_at, updated_at)
SELECT lower(hex(randomblob(16))), p.user_id, s.name, s.kind, p.id,
       s.is_paycheck, s.position, p.created_at, p.created_at
FROM starter_categories AS s
JOIN categories AS p ON p.parent_id IS NULL AND p.name = s.parent_name;
