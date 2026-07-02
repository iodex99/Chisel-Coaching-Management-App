import type { Migration } from './runner'

/** Post-dated cheques (PDCs): cheques received now but to be deposited later.
 *  Tracked separately from payments so the user is reminded when to deposit. */
export const m0009_pdc: Migration = {
  version: 9,
  name: 'postdated_cheques',
  sql: `
    CREATE TABLE postdated_cheques (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id   INTEGER REFERENCES students(id) ON DELETE SET NULL,
      student_name TEXT,                              -- snapshot for display
      amount       INTEGER NOT NULL,                  -- paise
      cheque_no    TEXT,
      bank         TEXT,
      deposit_date TEXT NOT NULL,                     -- ISO yyyy-mm-dd: when to deposit
      status       TEXT NOT NULL DEFAULT 'pending',   -- pending | deposited | bounced | cancelled
      notes        TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE INDEX idx_pdc_status ON postdated_cheques (status);
    CREATE INDEX idx_pdc_deposit ON postdated_cheques (deposit_date);
  `
}
