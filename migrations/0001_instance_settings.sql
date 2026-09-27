-- Instance-wide settings managed from the admin UI (docs/architecture.md §7).
-- Values are JSON text so each setting keeps its own shape.
CREATE TABLE instance_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL
) STRICT;
