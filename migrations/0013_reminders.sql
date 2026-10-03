-- Reminders and Web Push (ADR 0024). A reminder is one thing the user should
-- look at: a bill due, an IOU due or overdue, the weekly review. The
-- scheduler creates each at most once, so `dedupe_key` is unique per user.
-- A push subscription is one browser the user opted in on; the endpoint
-- belongs to the browser vendor's push service and is only used after that
-- opt-in. VAPID keys live in instance_settings (key 'vapid_keys').
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN ('bill_due', 'iou_due', 'iou_overdue', 'weekly_review')
  ),
  dedupe_key TEXT NOT NULL CHECK (length(dedupe_key) > 0),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- A path inside the app that the reminder opens.
  url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (user_id, dedupe_key)
) STRICT;

CREATE INDEX reminders_user_created_idx ON reminders (user_id, created_at DESC);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL CHECK (endpoint GLOB 'https://*'),
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (endpoint)
) STRICT;

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);
