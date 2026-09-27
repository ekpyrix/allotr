# Migrations

Forward-only SQL migrations for the SQLite database
([ADR 0004](../docs/adr/0004-sqlite-kysely.md)). The server applies pending
files at startup, in one transaction that also acts as the migration lock,
after copying the database to `backups/` next to it (the newest five are kept).

- Name files `NNNN_lower_snake_case.sql`, numbered in order.
- Never edit or delete a file once merged; the server refuses to start if an
  applied file changed. Fix mistakes with a new migration.
- Declare tables `STRICT`. Every user-owned table has a `user_id` column.
- Do not use `BEGIN`, `COMMIT` or `VACUUM`; the runner owns the transaction.
- Keep SQL portable where practical so a Postgres dialect can follow.
- After adding a migration, run `pnpm --filter @allotr/server db:codegen` and
  commit the regenerated `apps/server/src/db/schema.ts`.
