import initSqlJs, { type Database, type SqlJsStatic, type BindParams } from 'sql.js'
import { readFileSync, existsSync, writeFileSync, renameSync, copyFileSync, mkdirSync } from 'fs'
import { writeFile, rename } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import log from 'electron-log/main'
import { dataPath } from '../paths'
import { encrypt, decrypt } from './crypto'
import { runMigrations } from './migrations/runner'

let SQL: SqlJsStatic | null = null

function resolveWasmPath(): string {
  // The sql.js WASM binary ships inside node_modules; it is readable from the
  // asar archive at runtime, so the same path works in dev and production.
  return join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}

async function getSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL
  const fileBuf = readFileSync(resolveWasmPath())
  // sql.js expects an ArrayBuffer; hand it an exact-length copy of the file bytes.
  const wasmBinary = fileBuf.buffer.slice(
    fileBuf.byteOffset,
    fileBuf.byteOffset + fileBuf.byteLength
  ) as ArrayBuffer
  SQL = await initSqlJs({ wasmBinary })
  return SQL
}

const dbFilePath = (): string => dataPath('chisel.db')

/**
 * A thin synchronous wrapper around a sql.js Database that transparently
 * encrypts the whole database file (AES-256-GCM) on every persist.
 */
export class Db {
  private sqldb: Database
  private key: Buffer

  constructor(sqldb: Database, key: Buffer) {
    this.sqldb = sqldb
    this.key = key
    // Foreign keys are off by default in SQLite and reset per connection.
    this.sqldb.run('PRAGMA foreign_keys = ON')
  }

  /** Direct access to the underlying sql.js handle (used by the migration runner). */
  get raw(): Database {
    return this.sqldb
  }

  /** Run a query and return all rows as objects. */
  all<T = Record<string, unknown>>(sql: string, params: BindParams = []): T[] {
    const stmt = this.sqldb.prepare(sql)
    try {
      stmt.bind(params)
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as unknown as T)
      return rows
    } finally {
      stmt.free()
    }
  }

  /** Run a query and return the first row, or undefined. */
  get<T = Record<string, unknown>>(sql: string, params: BindParams = []): T | undefined {
    return this.all<T>(sql, params)[0]
  }

  /** Execute a single write statement. Does NOT persist — wrap writes in `transaction`. */
  run(sql: string, params: BindParams = []): { lastInsertRowid: number; changes: number } {
    this.sqldb.run(sql, params)
    const id = this.get<{ id: number }>('SELECT last_insert_rowid() AS id')?.id ?? 0
    return { lastInsertRowid: id, changes: this.sqldb.getRowsModified() }
  }

  /** Run one or more raw statements (no parameters). */
  exec(sql: string): void {
    this.sqldb.exec(sql)
  }

  /** Execute `fn` inside a transaction, then persist. Rolls back on error.
   *  Persistence is scheduled asynchronously and coalesced, so recording a
   *  payment never blocks on the (whole-file) encrypt+write even as the
   *  database grows. Reads always see the latest state (it's in memory). */
  transaction<T>(fn: (db: Db) => T): T {
    this.sqldb.run('BEGIN')
    try {
      const result = fn(this)
      this.sqldb.run('COMMIT')
      this.schedulePersist()
      return result
    } catch (err) {
      try {
        this.sqldb.run('ROLLBACK')
      } catch {
        /* ignore rollback failure */
      }
      throw err
    }
  }

  // --- Persistence (async + coalesced, with synchronous flush points) ---
  private dirty = false
  private scheduled = false
  private pending: Promise<void> = Promise.resolve()

  private encryptCurrent(): Buffer {
    return encrypt(Buffer.from(this.sqldb.export()), this.key)
  }

  /** Mark the DB changed and flush asynchronously, coalescing rapid writes. */
  schedulePersist(): void {
    this.dirty = true
    if (this.scheduled) return
    this.scheduled = true
    setImmediate(() => {
      this.scheduled = false
      if (!this.dirty) return
      this.dirty = false
      const blob = this.encryptCurrent()
      const tmp = `${dbFilePath()}.${Date.now()}.tmp`
      this.pending = writeFile(tmp, blob)
        .then(() => rename(tmp, dbFilePath()))
        .catch((e) => {
          this.dirty = true // retry on next change
          log.error('Async persist failed:', e)
        })
    })
  }

  /** Synchronous, authoritative write of the current state. */
  persist(): void {
    this.dirty = false
    const tmp = `${dbFilePath()}.tmp`
    writeFileSync(tmp, this.encryptCurrent())
    renameSync(tmp, dbFilePath())
  }

  /** Make the on-disk file authoritative for the current in-memory state.
   *  A coalesced `schedulePersist` can fire *during* the await below — clearing
   *  `dirty` and reassigning `this.pending` to a new in-flight write. So after
   *  draining the write we were aware of, we persist synchronously regardless of
   *  `dirty` (cheap and infrequent — only at backup/rekey/restore/quit), then
   *  await once more so any write that started mid-flush has finished its rename
   *  before a caller copies the file. */
  async flush(): Promise<void> {
    await this.pending
    this.dirty = false
    this.persist()
    await this.pending
  }

  /** Re-encrypt under a new key. Callers must `await flush()` first so no
   *  old-key write is still pending. */
  rekey(newKey: Buffer): void {
    this.key = newKey
    this.persist()
  }

  close(): void {
    this.persist()
    this.sqldb.close()
  }
}

let current: Db | null = null

export function getDb(): Db {
  if (!current) throw new Error('Database is not open')
  return current
}

export function isOpen(): boolean {
  return current !== null
}

/** Await any pending async write, then flush the open DB to disk. */
export async function flushCurrent(): Promise<void> {
  if (current) await current.flush()
}

/** Synchronously flush the open DB to disk (used on app quit). */
export function flushCurrentSync(): void {
  if (current) current.persist()
}

export function dbFileExists(): boolean {
  return existsSync(dbFilePath())
}

/** Create a brand-new encrypted database, run migrations, and open it. */
export async function createNewDatabase(key: Buffer): Promise<Db> {
  const sqljs = await getSqlJs()
  const db = new Db(new sqljs.Database(), key)
  runMigrations(db)
  db.persist()
  current = db
  return db
}

/** Open the existing database. Throws if the key (password) is wrong. */
export async function openExistingDatabase(key: Buffer): Promise<Db> {
  const sqljs = await getSqlJs()
  const blob = readFileSync(dbFilePath())
  const bytes = decrypt(blob, key) // throws on wrong key / tampering
  const db = new Db(new sqljs.Database(bytes), key)
  runMigrations(db) // apply any migrations added by an update
  current = db
  return db
}

export function closeDatabase(): void {
  if (current) {
    current.close()
    current = null
  }
}

/** Drop the in-memory database WITHOUT persisting (used before a restore so the
 * stale image cannot overwrite the freshly-restored file). */
export function discardDatabase(): void {
  current = null
}

/** Copy the encrypted database file into data/backups with a timestamped name. */
export function backupDbFile(label: string): string | null {
  if (!existsSync(dbFilePath())) return null
  const dir = dataPath('backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = dataPath('backups', `chisel-${label}-${stamp}.db`)
  copyFileSync(dbFilePath(), dest)
  return dest
}
