import type { Migration } from './runner'

export const m0001_init: Migration = {
  version: 1,
  name: 'init',
  sql: /* sql */ `
    -- Single admin account (id is pinned to 1).
    CREATE TABLE app_user (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      username     TEXT NOT NULL,
      display_name TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    -- Key/value application settings (institute profile, receipt format, prefs).
    CREATE TABLE settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TEXT NOT NULL
    );

    -- Audit trail of sensitive actions.
    CREATE TABLE audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      action     TEXT NOT NULL,
      entity     TEXT,
      entity_id  INTEGER,
      details    TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_audit_created ON audit_log (created_at);
  `
}
