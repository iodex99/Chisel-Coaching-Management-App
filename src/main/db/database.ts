import initSqlJs, { type Database, type SqlJsStatic, type BindParams } from 'sql.js'
import {
  readFileSync,
  existsSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  mkdirSync,
  openSync,
  fsyncSync,
  closeSync,
  rmSync
} from 'fs'
import { open } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import log from 'electron-log/main'
import { dataPath } from '../paths'
import { encrypt, decrypt } from './crypto'
import { runMigrations, hasPendingMigrations } from './migrations/runner'

let SQL: SqlJsStatic | null = null

function resolveWasmPath(): string {
  // The sql.js WASM binary ships inside node_modules; it is readable from the
  // asar archive at runtime, so the same path works in dev and production.
  return join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}

export async function getSqlJs(): Promise<SqlJsStatic> {
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

/** Write a file and force it to the disk before returning. Without the fsync, a
 *  power cut or forced shutdown right after the rename can leave chisel.db with
 *  its new size but unwritten (zeroed) contents, which no key can decrypt. */
async function writeDurable(path: string, data: Buffer): Promise<void> {
  const fh = await open(path, 'w')
  try {
    await fh.writeFile(data)
    await fh.sync()
  } finally {
    await fh.close()
  }
}

function writeDurableSync(path: string, data: Buffer): void {
  const fd = openSync(path, 'w')
  try {
    writeFileSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

/** Copy a file and force the copy to disk (backups must survive a power cut). */
export function copyFileDurable(from: string, to: string): void {
  copyFileSync(from, to)
  const fd = openSync(to, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

let tmpCounter = 0
const tmpPath = (): string => `${dbFilePath()}.${process.pid}.${Date.now()}.${++tmpCounter}.tmp`

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
  /** Every save takes a sequence number; `onDisk` is the newest one renamed into
   *  place, so a slower, older save can never land on top of a newer one. */
  private seq = 0
  private onDisk = 0

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
      const mySeq = ++this.seq
      const tmp = tmpPath()
      this.pending = writeDurable(tmp, blob)
        .then(() => {
          // The rename is synchronous so the check and the swap cannot interleave
          // with a synchronous persist() on the main thread.
          if (mySeq < this.onDisk) {
            rmSync(tmp, { force: true }) // a newer state is already on disk
            return
          }
          renameSync(tmp, dbFilePath())
          this.onDisk = mySeq
        })
        .catch((e) => {
          this.dirty = true // retry on next change
          rmSync(tmp, { force: true })
          log.error('Async persist failed:', e)
        })
    })
  }

  /** Synchronous, authoritative write of the current state. */
  persist(): void {
    this.dirty = false
    const mySeq = ++this.seq
    const tmp = tmpPath()
    try {
      writeDurableSync(tmp, this.encryptCurrent())
      renameSync(tmp, dbFilePath())
    } catch (e) {
      rmSync(tmp, { force: true })
      throw e
    }
    this.onDisk = mySeq
  }

  /** Make the on-disk file authoritative for the current in-memory state.
   *  A coalesced `schedulePersist` can fire *during* the await below — clearing
   *  `dirty` and reassigning `this.pending` to a new in-flight write. So after
   *  draining the write we were aware of, we persist synchronously regardless of
   *  `dirty` (cheap and infrequent — only at setup/backup/restore/quit), then
   *  await once more so any write that started mid-flush has finished its rename
   *  before a caller copies the file. */
  async flush(): Promise<void> {
    await this.pending
    this.dirty = false
    this.persist()
    await this.pending
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

/** Decrypt an encrypted database file. Returns null when `key` does not open it —
 *  a wrong key and a damaged file look identical here (the GCM tag fails), so
 *  callers must not report null as "wrong password" without checking further.
 *  An unreadable file (missing, locked) throws instead. */
export function decryptFile(path: string, key: Buffer): Buffer | null {
  const blob = readFileSync(path)
  if (blob.length < 28) return null // shorter than the [iv][tag] header
  try {
    return decrypt(blob, key)
  } catch {
    return null
  }
}

/** Decrypt the live database with `key`, or null if the key does not open it. */
export function decryptLiveDatabase(key: Buffer): Buffer | null {
  return decryptFile(dbFilePath(), key)
}

/** Open the existing database. Throws if the key does not open the file. */
export async function openExistingDatabase(key: Buffer): Promise<Db> {
  const bytes = decryptLiveDatabase(key)
  if (!bytes) throw new Error('The key does not open the database file')
  return openDecryptedDatabase(bytes, key)
}

/** Open already-decrypted database bytes as the live database, applying any
 *  migrations added by an update. Errors here are real errors (not a wrong key). */
export async function openDecryptedDatabase(bytes: Buffer, key: Buffer): Promise<Db> {
  const sqljs = await getSqlJs()
  const db = new Db(new sqljs.Database(bytes), key)
  if (hasPendingMigrations(db)) backupBeforeMigration()
  runMigrations(db) // apply any migrations added by an update
  current = db
  return db
}

/** Snapshot the untouched file + key file as a regular backup folder before an
 *  update changes the schema, so it is listed under Backups and restorable.
 *  Best-effort: migrations are transactional, so a failed copy never blocks. */
function backupBeforeMigration(): void {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dir = dataPath('backups', `pre-update-${stamp}`)
    mkdirSync(dir, { recursive: true })
    copyFileDurable(dbFilePath(), join(dir, 'chisel.db'))
    const kf = dataPath('keyfile.json')
    if (existsSync(kf)) copyFileDurable(kf, join(dir, 'keyfile.json'))
  } catch (e) {
    log.warn('Pre-update backup failed:', e)
  }
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
