import initSqlJs, { type Database, type SqlJsStatic, type BindParams } from 'sql.js'
import { readFileSync, existsSync, writeFileSync, renameSync, copyFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
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

  /** Execute `fn` inside a transaction, then persist atomically. Rolls back on error. */
  transaction<T>(fn: (db: Db) => T): T {
    this.sqldb.run('BEGIN')
    try {
      const result = fn(this)
      this.sqldb.run('COMMIT')
      this.persist()
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

  /** Encrypt and write the whole database to disk atomically (tmp + rename). */
  persist(): void {
    const bytes = Buffer.from(this.sqldb.export())
    const blob = encrypt(bytes, this.key)
    const tmp = `${dbFilePath()}.tmp`
    writeFileSync(tmp, blob)
    renameSync(tmp, dbFilePath())
  }

  /** Re-encrypt the database under a new key (used by change-password). */
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

/** Copy the encrypted database file into data/backups with a timestamped name. */
export function backupDbFile(label: string): string | null {
  if (!existsSync(dbFilePath())) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = dataPath('backups', `chisel-${label}-${stamp}.db`)
  copyFileSync(dbFilePath(), dest)
  return dest
}
