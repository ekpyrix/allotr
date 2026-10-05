-- Where an entry was typed (docs/domain.md "Entry source").
--
-- `source` keeps saying how the entry reached the ledger: `api`, `import` or
-- `system`. `client` names the kind of client behind an `api` entry: `web`
-- for the app, `chat` for a chat gateway. Older entries and callers that do
-- not say stay NULL, which reads as plain `api`. A new column rather than a
-- wider `source` CHECK: SQLite cannot widen a CHECK without rebuilding
-- `transactions`, and dropping it would cascade away every posting.
ALTER TABLE transactions ADD COLUMN client TEXT CHECK (
  client IS NULL OR (client IN ('web', 'chat') AND source = 'api')
);
