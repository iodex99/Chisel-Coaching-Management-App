import type { Migration } from './runner'

export const m0005_expenses: Migration = {
  version: 5,
  name: 'expenses',
  sql: /* sql */ `
    CREATE TABLE expense_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE vendors (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      contact    TEXT,
      notes      TEXT,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE expenses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      category_id  INTEGER REFERENCES expense_categories(id),
      vendor_id    INTEGER REFERENCES vendors(id),
      payee        TEXT,
      amount       INTEGER NOT NULL,             -- paise
      mode         TEXT NOT NULL,                -- cash | upi | bank_transfer | cheque | other
      account_id   INTEGER REFERENCES accounts(id),
      reference_no TEXT,
      remarks      TEXT,
      created_by   INTEGER,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX idx_expenses_date ON expenses (expense_date);
    CREATE INDEX idx_expenses_category ON expenses (category_id);
    CREATE INDEX idx_expenses_vendor ON expenses (vendor_id);

    -- A few sensible starter categories.
    INSERT INTO expense_categories (name, is_active, created_at) VALUES
      ('Rent', 1, '2026-01-01T00:00:00.000Z'),
      ('Salaries', 1, '2026-01-01T00:00:00.000Z'),
      ('Utilities', 1, '2026-01-01T00:00:00.000Z'),
      ('Stationery', 1, '2026-01-01T00:00:00.000Z'),
      ('Marketing', 1, '2026-01-01T00:00:00.000Z'),
      ('Miscellaneous', 1, '2026-01-01T00:00:00.000Z');
  `
}
