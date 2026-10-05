-- The Buffer's empty amount was seeded in the currency the user signed up
-- with, before setup chose their own. Planning needs the default currency, so
-- move every zero amount (only the Buffer can have one) to it.
UPDATE budget_amounts
SET currency = (
  SELECT u.default_currency FROM users AS u WHERE u.id = budget_amounts.user_id
)
WHERE amount_minor = 0
  AND currency <> (
    SELECT u.default_currency FROM users AS u WHERE u.id = budget_amounts.user_id
  );

-- The Buffer's start is the user's local day, which SQL cannot work out, so
-- the server moves it when the time zone is set. Let it, for the Buffer only;
-- every other budget keeps a fixed target and start.
DROP TRIGGER budgets_fixed_columns;
CREATE TRIGGER budgets_fixed_columns
BEFORE UPDATE OF user_id, kind, category_id, tag_id, started_on ON budgets
WHEN OLD.kind <> 'buffer'
  OR NEW.kind IS NOT OLD.kind
  OR NEW.user_id IS NOT OLD.user_id
  OR NEW.category_id IS NOT OLD.category_id
  OR NEW.tag_id IS NOT OLD.tag_id
BEGIN
  SELECT RAISE(ABORT, 'a budget target and start are fixed');
END;
