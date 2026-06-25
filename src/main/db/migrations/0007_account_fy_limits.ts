import type { Migration } from './runner'

export const m0007_account_fy_limits: Migration = {
  version: 7,
  name: 'account_fy_limits',
  sql: /* sql */ `
    -- Per-financial-year overrides of an account's per-vendor limit (paise).
    -- A year without a row falls back to accounts.vendor_fy_limit (the default).
    CREATE TABLE account_vendor_limits (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      fy           TEXT NOT NULL,
      limit_amount INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX idx_avl_account_fy ON account_vendor_limits (account_id, fy);
  `
}
