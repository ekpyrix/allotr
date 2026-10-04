-- Which entry an edit replaced (docs/domain.md "Corrections and edits").
--
-- An edit is the undo of the old entry plus a new one. The undo points at
-- what it undid; this row says the new entry took the old one's place, so
-- an edit's undo is not mistaken for a delete and an entry can show its
-- earlier versions. Rows are written with the edit, in the same database
-- transaction, and never change: like transactions, they are append-only.
CREATE TABLE transaction_replacements (
  replacement_id TEXT PRIMARY KEY,
  original_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  -- An entry is replaced at most once: after that it is undone.
  UNIQUE (original_id),
  CHECK (replacement_id <> original_id),
  FOREIGN KEY (replacement_id, user_id) REFERENCES transactions (id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (original_id, user_id) REFERENCES transactions (id, user_id)
    ON DELETE CASCADE
) STRICT;

CREATE TRIGGER transaction_replacements_no_update
BEFORE UPDATE ON transaction_replacements
BEGIN
  SELECT RAISE(ABORT, 'transaction replacements are append-only');
END;

CREATE TRIGGER transaction_replacements_no_delete
BEFORE DELETE ON transaction_replacements
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  SELECT RAISE(ABORT, 'transaction replacements are append-only');
END;

-- Earlier edits were not recorded as such. An edit stores the undo and the
-- new entry with the same created_at, and nothing else of that user's
-- shares it, so such a pair is taken as an edit. Anything less certain
-- stays a delete, as it was shown before.
INSERT INTO transaction_replacements (replacement_id, original_id, user_id)
SELECT replacement.id, undo.reverses_id, undo.user_id
FROM transactions AS undo
JOIN transactions AS replacement
  ON replacement.user_id = undo.user_id
  AND replacement.created_at = undo.created_at
  AND replacement.kind <> 'reversal'
WHERE undo.kind = 'reversal'
  AND (
    SELECT count(*) FROM transactions AS same
    WHERE same.user_id = undo.user_id AND same.created_at = undo.created_at
  ) = 2;
