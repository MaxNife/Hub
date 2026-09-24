-- 001_init: user state only. apps/ folder is source of truth for what exists.
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS app_state (
  app_id       TEXT PRIMARY KEY,
  installed    INTEGER NOT NULL DEFAULT 0,
  pinned       INTEGER NOT NULL DEFAULT 0,
  installed_at TEXT
);

CREATE TABLE IF NOT EXISTS app_opens (
  id        INTEGER PRIMARY KEY,
  app_id    TEXT NOT NULL,
  opened_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS app_opens_app_time ON app_opens (app_id, opened_at);

CREATE TABLE IF NOT EXISTS health_checks (
  app_id     TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  ok         INTEGER NOT NULL,
  status     INTEGER,
  latency_ms INTEGER,
  error      TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
