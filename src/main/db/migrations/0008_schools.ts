import type { Migration } from './runner'

/** School master: the set of schools students are drawn from, plus a
 *  students.school_id link. */
export const m0008_schools: Migration = {
  version: 8,
  name: 'schools',
  sql: `
    CREATE TABLE schools (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      area       TEXT,
      contact    TEXT,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    ALTER TABLE students ADD COLUMN school_id INTEGER;
    CREATE INDEX idx_students_school ON students (school_id);
  `
}
