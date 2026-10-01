-- How a category looks: a colour (a chart series role of the active theme,
-- so every theme paints it with a contrast-fitted colour) and a Lucide icon
-- from a fixed set the API validates. Null means "follow the parent, else a
-- default". Nothing here changes any figure.
ALTER TABLE categories ADD COLUMN colour TEXT CHECK (
  colour IS NULL OR colour IN (
    'series-1', 'series-2', 'series-3', 'series-4',
    'series-5', 'series-6', 'series-7', 'series-8'
  )
);
ALTER TABLE categories ADD COLUMN icon TEXT CHECK (
  icon IS NULL OR (icon GLOB '[a-z]*' AND length(icon) <= 40)
);

-- The starter set carries a style, copied to new users with the rest.
ALTER TABLE starter_categories ADD COLUMN colour TEXT;
ALTER TABLE starter_categories ADD COLUMN icon TEXT;

UPDATE starter_categories SET colour = 'series-6', icon = 'utensils' WHERE name = 'Food' AND parent_name IS NULL;
UPDATE starter_categories SET icon = 'shopping-basket' WHERE name = 'Groceries';
UPDATE starter_categories SET icon = 'coffee' WHERE name = 'Eating out';
UPDATE starter_categories SET colour = 'series-1', icon = 'bus' WHERE name = 'Transport';
UPDATE starter_categories SET colour = 'series-4', icon = 'house' WHERE name = 'Housing' AND parent_name IS NULL;
UPDATE starter_categories SET icon = 'lightbulb' WHERE name = 'Utilities';
UPDATE starter_categories SET colour = 'series-2', icon = 'receipt' WHERE name = 'Bills and subscriptions';
UPDATE starter_categories SET colour = 'series-5', icon = 'heart-pulse' WHERE name = 'Health';
UPDATE starter_categories SET colour = 'series-7', icon = 'shopping-bag' WHERE name = 'Shopping';
UPDATE starter_categories SET colour = 'series-3', icon = 'ticket' WHERE name = 'Fun';
UPDATE starter_categories SET colour = 'series-8', icon = 'tag' WHERE name = 'Other';
UPDATE starter_categories SET colour = 'series-6', icon = 'banknote' WHERE name = 'Paycheck';
UPDATE starter_categories SET colour = 'series-3', icon = 'hand-coins' WHERE name = 'Other income';

-- Users from before get the style on starter categories they still have
-- unstyled; one they restyled or renamed is left alone.
UPDATE categories SET
  colour = (SELECT s.colour FROM starter_categories AS s
            WHERE s.name = categories.name
              AND s.parent_name IS (SELECT p.name FROM categories AS p WHERE p.id = categories.parent_id)),
  icon = (SELECT s.icon FROM starter_categories AS s
          WHERE s.name = categories.name
            AND s.parent_name IS (SELECT p.name FROM categories AS p WHERE p.id = categories.parent_id))
WHERE colour IS NULL AND icon IS NULL;

-- The seed trigger of 0003, now copying the style as well.
DROP TRIGGER users_seed_categories;
CREATE TRIGGER users_seed_categories
AFTER INSERT ON users
BEGIN
  INSERT INTO categories
    (id, user_id, name, kind, parent_id, is_paycheck, position, colour, icon,
     created_at, updated_at)
  SELECT lower(hex(randomblob(16))), NEW.id, name, kind, NULL, is_paycheck,
         position, colour, icon, NEW.created_at, NEW.created_at
  FROM starter_categories WHERE parent_name IS NULL;

  INSERT INTO categories
    (id, user_id, name, kind, parent_id, is_paycheck, position, colour, icon,
     created_at, updated_at)
  SELECT lower(hex(randomblob(16))), NEW.id, s.name, s.kind, p.id,
         s.is_paycheck, s.position, s.colour, s.icon, NEW.created_at,
         NEW.created_at
  FROM starter_categories AS s
  JOIN categories AS p
    ON p.user_id = NEW.id AND p.parent_id IS NULL AND p.name = s.parent_name;
END;
