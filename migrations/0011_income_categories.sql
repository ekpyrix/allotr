-- Starter income categories for interest and tax refunds, neither of them a
-- paycheck. New users get them through the starter table and its trigger
-- (0003); users from before this migration get them here, unless they
-- already have a top-level category of that name (a renamed or merged
-- category does not count, and the name stays free for the unique index).
-- Only the columns of 0003 are named, so this runs with or without the
-- category style of a later migration; the new rows have no style then.
INSERT INTO starter_categories (name, parent_name, kind, is_paycheck, position) VALUES
  ('Interest', NULL, 'income', 0, 3),
  ('Tax refund', NULL, 'income', 0, 4);

INSERT INTO categories
  (id, user_id, name, kind, parent_id, is_paycheck, position, created_at, updated_at)
SELECT lower(hex(randomblob(16))), u.id, s.name, s.kind, NULL, 0, s.position,
       u.created_at, u.created_at
FROM users AS u
CROSS JOIN starter_categories AS s
WHERE s.name IN ('Interest', 'Tax refund')
  AND NOT EXISTS (
    SELECT 1 FROM categories AS c
    WHERE c.user_id = u.id
      AND c.parent_id IS NULL
      AND c.merged_into_id IS NULL
      AND lower(c.name) = lower(s.name)
  );
