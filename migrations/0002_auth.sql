-- Accounts, sessions and TOTP for Better Auth (ADR 0006), plus invites and
-- sign-in lockout. Better Auth's camelCase fields are mapped to these
-- snake_case columns in apps/server/src/auth/schema-names.ts. Instants are
-- ISO 8601 UTC text; booleans are 0 or 1.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  image TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  two_factor_enabled INTEGER NOT NULL DEFAULT 0 CHECK (two_factor_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  scope TEXT,
  password TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider_id, account_id)
) STRICT;

CREATE INDEX accounts_user_id_idx ON accounts (user_id);

CREATE TABLE verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX verifications_identifier_idx ON verifications (identifier);

CREATE TABLE two_factors (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  verified INTEGER CHECK (verified IN (0, 1)),
  failed_verification_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
) STRICT;

CREATE INDEX two_factors_user_id_idx ON two_factors (user_id);
CREATE INDEX two_factors_secret_idx ON two_factors (secret);

-- Single-use invite links. Only a SHA-256 hash of the token is stored.
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT REFERENCES users (id) ON DELETE SET NULL
) STRICT;

-- Failed password sign-ins per normalised email, for temporary lockout.
-- Keyed by email rather than user so unknown addresses behave the same.
CREATE TABLE sign_in_failures (
  email TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL,
  window_started_at TEXT NOT NULL,
  locked_until TEXT
) STRICT;
