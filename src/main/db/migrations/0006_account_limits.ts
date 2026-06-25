import type { Migration } from './runner'

export const m0006_account_limits: Migration = {
  version: 6,
  name: 'account_limits',
  sql: /* sql */ `
    -- Max payable to a single vendor from this account per financial year
    -- (paise). 0 = no limit.
    ALTER TABLE accounts ADD COLUMN vendor_fy_limit INTEGER NOT NULL DEFAULT 0;
  `
}
