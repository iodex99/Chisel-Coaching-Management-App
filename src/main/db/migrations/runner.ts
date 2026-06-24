import type { Db } from '../database'

export interface Migration {
  version: number
  name: string
  sql: string
}

import { m0001_init } from './0001_init'
import { m0002_two_factor } from './0002_two_factor'
import { m0003_core } from './0003_core'

/** Ordered list of all migrations. Append new ones; never edit a shipped one. */
export const MIGRATIONS: Migration[] = [m0001_init, m0002_two_factor, m0003_core]

/**
 * Apply any migrations whose version is newer than the highest applied. Each
 * migration runs in its own transaction; the file is persisted once at the end.
 */
export function runMigrations(db: Db): void {
  db.raw.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `)

  const applied = db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations')?.v ?? 0
  const pending = MIGRATIONS.filter((m) => m.version > applied).sort((a, b) => a.version - b.version)
  if (pending.length === 0) return

  for (const m of pending) {
    db.raw.run('BEGIN')
    try {
      db.raw.exec(m.sql)
      db.raw.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        new Date().toISOString()
      ])
      db.raw.run('COMMIT')
    } catch (err) {
      try {
        db.raw.run('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw err
    }
  }
  db.persist()
}
