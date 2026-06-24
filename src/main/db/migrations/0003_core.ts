import type { Migration } from './runner'

export const m0003_core: Migration = {
  version: 3,
  name: 'core',
  sql: /* sql */ `
    -- Cash / bank / UPI accounts that money flows in and out of.
    CREATE TABLE accounts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'cash',   -- cash | bank | upi | other
      opening_balance INTEGER NOT NULL DEFAULT 0,     -- paise
      is_active       INTEGER NOT NULL DEFAULT 1,
      notes           TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    -- Course / batch definitions.
    CREATE TABLE batches (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      course_name   TEXT,
      academic_year TEXT,
      default_fee   INTEGER NOT NULL DEFAULT 0,        -- paise
      start_date    TEXT,
      end_date      TEXT,
      status        TEXT NOT NULL DEFAULT 'active',    -- active | inactive
      notes         TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    -- Student master + admission records.
    CREATE TABLE students (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_no   TEXT NOT NULL UNIQUE,
      first_name     TEXT NOT NULL,
      last_name      TEXT,
      gender         TEXT,
      dob            TEXT,
      phone          TEXT,
      email          TEXT,
      address        TEXT,
      batch_id       INTEGER REFERENCES batches(id),
      admission_date TEXT,
      status         TEXT NOT NULL DEFAULT 'active',   -- active | inactive | dropped | completed
      notes          TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
    CREATE INDEX idx_students_batch ON students (batch_id);
    CREATE INDEX idx_students_status ON students (status);

    -- Parent / guardian details (a student may have several).
    CREATE TABLE guardians (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      relation   TEXT,
      phone      TEXT,
      email      TEXT,
      occupation TEXT
    );
    CREATE INDEX idx_guardians_student ON guardians (student_id);
  `
}
