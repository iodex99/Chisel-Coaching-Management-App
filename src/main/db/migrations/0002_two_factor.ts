import type { Migration } from './runner'

export const m0002_two_factor: Migration = {
  version: 2,
  name: 'two_factor',
  sql: /* sql */ `
    -- Enrolled TOTP authenticator apps (up to 3, enforced in the service).
    CREATE TABLE two_factor (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      label        TEXT NOT NULL,
      secret       TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      last_used_at TEXT
    );

    -- One-time recovery codes (stored hashed).
    CREATE TABLE recovery_codes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code_hash  TEXT NOT NULL,
      used_at    TEXT,
      created_at TEXT NOT NULL
    );

    -- Machine-bound trusted devices (up to 3). The hmac binds the device id to a
    -- per-machine secret kept OUTSIDE the portable data folder, so copying the
    -- data folder to another PC does not carry trust.
    CREATE TABLE trusted_devices (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id    TEXT NOT NULL UNIQUE,
      hmac         TEXT NOT NULL,
      label        TEXT,
      created_at   TEXT NOT NULL,
      last_seen_at TEXT
    );
  `
}
