-- Budgets (ADR 0021): a planned amount per period on a category (a parent
-- covers its children) or on a tag. They are virtual: tied to no account,
-- and no posting carries a budget. Spent and left come from the entries,
-- folded by core when read. The Buffer is a budget with no target that only
-- holds money, created for every user.
CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('category', 'tag', 'buffer')),
  category_id TEXT,
  tag_id TEXT,
  -- Daily budgets stay in the daily number; set-aside ones are held out of it.
  mode TEXT NOT NULL CHECK (mode IN ('daily', 'set-aside')),
  -- What happens to what is left at the end of a period.
  leftover TEXT NOT NULL CHECK (leftover IN ('free', 'carry')),
  -- The budget counts from the period that holds started_on, and until the
  -- period that holds ended_on. A budget is ended, never deleted, so past
  -- periods keep their figures.
  started_on TEXT NOT NULL CHECK (
    started_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(started_on) = started_on
  ),
  ended_on TEXT CHECK (
    ended_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(ended_on) = ended_on
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind = 'category') = (category_id IS NOT NULL)),
  CHECK ((kind = 'tag') = (tag_id IS NOT NULL)),
  CHECK (kind <> 'buffer' OR (mode = 'set-aside' AND leftover = 'carry')),
  CHECK (kind <> 'buffer' OR ended_on IS NULL),
  UNIQUE (id, user_id),
  FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id),
  FOREIGN KEY (tag_id, user_id) REFERENCES tags (id, user_id)
) STRICT;

CREATE INDEX budgets_user_id_idx ON budgets (user_id);
-- At most one budget in use per category and per tag, and one Buffer.
CREATE UNIQUE INDEX budgets_category_idx
  ON budgets (user_id, category_id)
  WHERE category_id IS NOT NULL AND ended_on IS NULL;
CREATE UNIQUE INDEX budgets_tag_idx
  ON budgets (user_id, tag_id)
  WHERE tag_id IS NOT NULL AND ended_on IS NULL;
CREATE UNIQUE INDEX budgets_buffer_idx
  ON budgets (user_id) WHERE kind = 'buffer';
CREATE UNIQUE INDEX budgets_name_idx
  ON budgets (user_id, lower(name)) WHERE ended_on IS NULL;

CREATE TRIGGER budgets_fixed_columns
BEFORE UPDATE OF user_id, kind, category_id, tag_id, started_on ON budgets
BEGIN
  SELECT RAISE(ABORT, 'a budget target and start are fixed');
END;

-- The planned amount from the day it was set. A later row replaces it for the
-- period it was set in and the periods after, so changing a budget never
-- rewrites the figures of periods that are over.
CREATE TABLE budget_amounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  budget_id TEXT NOT NULL,
  effective_on TEXT NOT NULL CHECK (
    effective_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(effective_on) = effective_on
  ),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  created_at TEXT NOT NULL,
  UNIQUE (budget_id, effective_on),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (budget_id, user_id) REFERENCES budgets (id, user_id)
    ON DELETE CASCADE
) STRICT;

CREATE INDEX budget_amounts_user_id_idx ON budget_amounts (user_id);

-- Every user gets a Buffer, empty until they plan an amount for it.
CREATE TRIGGER users_seed_buffer
AFTER INSERT ON users
BEGIN
  INSERT INTO budgets
    (id, user_id, name, kind, mode, leftover, started_on, created_at, updated_at)
  VALUES
    (lower(hex(randomblob(16))), NEW.id, 'Buffer', 'buffer', 'set-aside',
     'carry', date(NEW.created_at), NEW.created_at, NEW.created_at);
  INSERT INTO budget_amounts
    (id, user_id, budget_id, effective_on, amount_minor, currency, created_at)
  SELECT lower(hex(randomblob(16))), NEW.id, b.id, b.started_on, 0,
         NEW.default_currency, NEW.created_at
  FROM budgets AS b WHERE b.user_id = NEW.id AND b.kind = 'buffer';
END;

-- Users from before this migration get one too.
INSERT INTO budgets
  (id, user_id, name, kind, mode, leftover, started_on, created_at, updated_at)
SELECT lower(hex(randomblob(16))), u.id, 'Buffer', 'buffer', 'set-aside',
       'carry', date(u.created_at), u.created_at, u.created_at
FROM users AS u;

INSERT INTO budget_amounts
  (id, user_id, budget_id, effective_on, amount_minor, currency, created_at)
SELECT lower(hex(randomblob(16))), b.user_id, b.id, b.started_on, 0,
       u.default_currency, b.created_at
FROM budgets AS b JOIN users AS u ON u.id = b.user_id
WHERE b.kind = 'buffer';
