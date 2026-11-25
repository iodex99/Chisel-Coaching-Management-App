import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

let userDataDir: string

// Upgrading an existing v1.0.23 (schema v9) database to the receipt-details
// schema (v10) through the real sign-in path: decrypt -> backup -> migrate.
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => userDataDir },
  shell: { openPath: async () => '' }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from '../services/auth'
import * as demo from '../services/demo'
import * as payments from '../services/payment'
import { listBackups } from '../services/backup'
import { renderReceiptHtml } from '../services/receipt'
import { getDb, isOpen, flushCurrent } from './database'
import { MIGRATIONS } from './migrations/runner'
import { deriveKey, encrypt, decrypt, generateSalt, DEFAULT_KDF } from './crypto'
import { createLegacyKeyfile, readKeyfile, dataKeyOf, type KeyfileV2 } from './keyfile'
import { setupTestAuth, testLogin } from '../services/testAuth'
import { ensureDataDirs, dataPath } from '../paths'

type Row = Record<string, unknown>
type Dump = Record<string, Row[]>

const PASSWORD = 'password123'
const NEW_COLUMNS = ['batch_name', 'academic_year', 'course_name', 'school_name']
let SQL: SqlJsStatic
const dirs: string[] = []

beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'chisel-upg-ud-'))
  dirs.push(userDataDir)
  const wasm = readFileSync(join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer })
})

/** Drain pending async writes, then sign out (closes + persists the DB). */
async function signOut(): Promise<void> {
  if (isOpen()) await flushCurrent()
  auth.logout()
}

afterEach(signOut)

afterAll(() => {
  delete process.env.CHISEL_DATA_DIR
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {
      /* best-effort temp cleanup */
    }
  }
})

function freshDataDir(): void {
  const d = mkdtempSync(join(tmpdir(), 'chisel-upg-'))
  dirs.push(d)
  process.env.CHISEL_DATA_DIR = d
  ensureDataDirs()
}

function rawAll(db: Database, sql: string, params: (string | number | null)[] = []): Row[] {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params)
    const rows: Row[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    return rows
  } finally {
    stmt.free()
  }
}

/** Every row of every table (ordered by rowid), minus the given columns/tables. */
function dump(all: (sql: string) => Row[], opts: { dropColumns?: string[]; skipTables?: string[] } = {}): Dump {
  const tables = all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((r) => r.name as string)
    .filter((t) => !(opts.skipTables ?? []).includes(t))
  const out: Dump = {}
  for (const t of tables) {
    out[t] = all(`SELECT * FROM "${t}" ORDER BY rowid`).map((r) => {
      const copy = { ...r }
      if (t === 'payments') for (const c of opts.dropColumns ?? []) delete copy[c]
      return copy
    })
  }
  return out
}

const liveAll = (sql: string): Row[] => getDb().all(sql)
const fileAll = (file: string, key: Buffer) => {
  const db = new SQL.Database(decrypt(readFileSync(file), key))
  return { db, all: (sql: string): Row[] => rawAll(db, sql) }
}
const schemaVersion = (all: (sql: string) => Row[]): number => all('SELECT MAX(version) AS v FROM schema_migrations')[0].v as number
const paymentColumns = (all: (sql: string) => Row[]): string[] => all('PRAGMA table_info(payments)').map((r) => r.name as string)

/** Encrypt a raw database as the live data file the way v1.0.23 did: under a
 *  key derived from the master password, with a v1 (password) keyfile. */
function installAsLiveFile(raw: Database): Buffer {
  const salt = generateSalt()
  const key = deriveKey(PASSWORD, salt, DEFAULT_KDF)
  writeFileSync(dataPath('chisel.db'), encrypt(Buffer.from(raw.export()), key))
  createLegacyKeyfile('admin', salt, DEFAULT_KDF)
  return key
}

describe('upgrade from v1.0.23 (schema v9) to receipt details (schema v10)', () => {
  it('upgrades a database built by migrations 1–9 without changing any existing row', async () => {
    freshDataDir()

    // --- A genuine v9 database, built by the shipped migrations 1–9 ---
    const raw = new SQL.Database()
    raw.run('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)')
    for (const m of MIGRATIONS.filter((x) => x.version <= 9)) {
      raw.exec(m.sql)
      raw.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [m.version, m.name, '2026-06-25T08:31:43.328Z'])
    }
    const ts = '2026-06-25T09:00:00.000Z'
    raw.exec(`
      INSERT INTO app_user (id, username, display_name, created_at, updated_at) VALUES (1, 'admin', 'admin', '${ts}', '${ts}');
      INSERT INTO settings (key, value, updated_at) VALUES ('institute.name', 'Chisel Coaching Classes', '${ts}');
      INSERT INTO settings (key, value, updated_at) VALUES ('receipt.prefix', 'CHISEL', '${ts}');
      INSERT INTO settings (key, value, updated_at) VALUES ('receipt.seq.2026-27', '4', '${ts}');
      INSERT INTO accounts (id, name, type, opening_balance, is_active, created_at, updated_at) VALUES (1, 'Cash', 'cash', 0, 1, '${ts}', '${ts}');
      INSERT INTO batches (id, name, course_name, academic_year, default_fee, status, created_at, updated_at)
        VALUES (1, 'IX-A', 'IX ICSE', '2026-27', 6000000, 'active', '${ts}', '${ts}'),
               (2, 'X Crash', 'X CBSE', NULL, 4000000, 'active', '${ts}', '${ts}');
      INSERT INTO schools (id, name, area, is_active, created_at) VALUES (1, 'Campion School', 'Fort', 1, '${ts}');
      INSERT INTO students (id, admission_no, first_name, last_name, status, batch_id, school_id, created_at, updated_at)
        VALUES (1, 'A-1', 'Riya', 'Shah', 'active', 1, 1, '${ts}', '${ts}'),
               (2, 'A-2', 'Kabir', NULL, 'active', 2, NULL, '${ts}', '${ts}'),
               (3, 'A-3', 'Meera', 'Iyer', 'active', NULL, NULL, '${ts}', '${ts}'),
               (4, 'A-4', 'Dev', 'Rao', 'inactive', 1, 99, '${ts}', '${ts}');
      INSERT INTO guardians (student_id, name, relation, phone) VALUES (1, 'Anil Shah', 'Father', '9800000000');
      INSERT INTO fee_plans (id, student_id, name, total_amount, discount, net_amount, created_at, updated_at)
        VALUES (1, 1, 'IX fee', 6000000, 500000, 5500000, '${ts}', '${ts}');
      INSERT INTO fee_installments (id, fee_plan_id, seq_no, label, due_amount, due_date, created_at)
        VALUES (1, 1, 1, 'Term 1', 2750000, '2026-07-01', '${ts}'), (2, 1, 2, 'Term 2', 2750000, '2026-10-01', '${ts}');
      INSERT INTO payments (id, receipt_no, student_id, payment_date, amount, mode, account_id, reference_no, remarks, is_cancelled, cancel_reason, created_by, created_at)
        VALUES (1, 'CHISEL/2026-27/0001', 1, '2026-06-25', 2750000, 'upi', 1, 'UTR1', 'Term 1', 0, NULL, 1, '${ts}'),
               (2, 'CHISEL/2026-27/0002', 1, '2026-06-25', 100, 'cash', 1, NULL, NULL, 1, 'typo', 1, '${ts}'),
               (3, 'CHISEL/2026-27/0003', 2, '2026-06-26', 500000, 'cash', NULL, NULL, NULL, 0, NULL, 1, '${ts}'),
               (4, 'CHISEL/2026-27/0004', 3, '2026-06-27', 250000, 'cheque', 1, 'CHQ 1234', NULL, 0, NULL, 1, '${ts}');
      INSERT INTO payment_allocations (payment_id, installment_id, amount) VALUES (1, 1, 2750000);
      INSERT INTO audit_log (user_id, action, entity, entity_id, created_at) VALUES (1, 'payment', 'payment', 1, '${ts}');
    `)
    // Dev (id 4) points at a school id that no longer exists (dangling link).
    const before = dump((sql) => rawAll(raw, sql))
    expect(schemaVersion((sql) => rawAll(raw, sql))).toBe(9)
    const key = installAsLiveFile(raw)
    raw.close()

    // --- First sign-in with the new build (one-time password unlock): this runs the upgrade ---
    const res = await auth.unlockLegacy({ password: PASSWORD })
    expect(res.status).toBe('enroll_required') // this v9 data had no authenticator yet
    expect(schemaVersion(liveAll)).toBe(10)
    expect(paymentColumns(liveAll)).toEqual(expect.arrayContaining(NEW_COLUMNS))

    // Every existing row of every table is byte-for-byte unchanged.
    const after = dump(liveAll, { dropColumns: NEW_COLUMNS, skipTables: ['schema_migrations'] })
    const { schema_migrations: beforeMigrations, ...beforeData } = before
    expect(after).toEqual(beforeData)
    // Migration history kept; only v10 appended.
    const migs = liveAll('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
    expect(migs.slice(0, 9)).toEqual(beforeMigrations)
    expect(migs[9]).toMatchObject({ version: 10, name: 'receipt_details' })

    // Existing receipts were filled from each student's current batch / school.
    expect(payments.getPayment(1)).toMatchObject({ batchName: 'IX-A', academicYear: '2026-27', courseName: 'IX ICSE', schoolName: 'Campion School', amount: 2750000, receiptNo: 'CHISEL/2026-27/0001' })
    expect(payments.getPayment(2)).toMatchObject({ batchName: 'IX-A', isCancelled: true, cancelReason: 'typo' })
    expect(payments.getPayment(3)).toMatchObject({ batchName: 'X Crash', academicYear: null, courseName: 'X CBSE', schoolName: null })
    expect(payments.getPayment(4)).toMatchObject({ batchName: null, academicYear: null, courseName: null, schoolName: null, referenceNo: 'CHQ 1234' })
    const html = renderReceiptHtml(payments.getReceiptData(1))
    expect(html).toContain('<span>Batch</span>IX-A (2026-27)')
    expect(html).toContain('<span>Course</span>IX ICSE')
    expect(html).toContain('<span>School</span>Campion School')

    // The upgraded file on disk matches too.
    const disk = fileAll(dataPath('chisel.db'), key)
    expect(schemaVersion(disk.all)).toBe(10)
    expect(dump(disk.all, { dropColumns: NEW_COLUMNS, skipTables: ['schema_migrations'] })).toEqual(beforeData)
    disk.db.close()

    // A restorable pre-update backup holds the untouched v9 database.
    const backups = listBackups().filter((b) => b.name.startsWith('pre-update-'))
    expect(backups).toHaveLength(1)
    const bdir = dataPath('backups', backups[0].name)
    expect(existsSync(join(bdir, 'keyfile.json'))).toBe(true)
    const snap = fileAll(join(bdir, 'chisel.db'), key)
    expect(schemaVersion(snap.all)).toBe(9)
    expect(paymentColumns(snap.all)).not.toContain('batch_name')
    expect(dump(snap.all)).toEqual(before)
    snap.db.close()

    // Receipt numbering continues from the old sequence; new payments capture details.
    const next = payments.recordPayment({ studentId: 2, amount: 1000, paymentDate: '2026-07-05', mode: 'cash' })
    expect(next.receiptNo).toBe('CHISEL/2026-27/0005')
    expect(next).toMatchObject({ batchName: 'X Crash', courseName: 'X CBSE' })

    // Signing in again does not migrate or back up a second time.
    await signOut()
    await auth.unlockLegacy({ password: PASSWORD })
    expect(listBackups().filter((b) => b.name.startsWith('pre-update-'))).toHaveLength(1)
    expect(payments.getPayment(1)?.batchName).toBe('IX-A')
    expect(payments.getPayment(5)?.receiptNo).toBe('CHISEL/2026-27/0005')
  })

  it('upgrades a full sample-data database without changing any existing row', async () => {
    freshDataDir()
    await setupTestAuth()
    await demo.seedDemoData()
    const key = dataKeyOf(readKeyfile() as KeyfileV2)
    await signOut()

    // Turn the file back into a v1.0.23 (v9) database.
    const raw = new SQL.Database(decrypt(readFileSync(dataPath('chisel.db')), key))
    for (const c of NEW_COLUMNS) raw.run(`ALTER TABLE payments DROP COLUMN ${c}`)
    raw.run('DELETE FROM schema_migrations WHERE version = 10')
    writeFileSync(dataPath('chisel.db'), encrypt(Buffer.from(raw.export()), key))
    const before = dump((sql) => rawAll(raw, sql), { skipTables: ['schema_migrations'] })
    raw.close()
    expect(before.payments.length).toBeGreaterThan(10)
    expect(before.students.length).toBeGreaterThan(10)

    await testLogin()
    expect(schemaVersion(liveAll)).toBe(10)
    expect(dump(liveAll, { dropColumns: NEW_COLUMNS, skipTables: ['schema_migrations', 'audit_log', 'two_factor'] })).toEqual(
      (({ audit_log: _a, two_factor: _t, ...rest }) => rest)(before)
    )

    // Every payment's details equal the student's current batch / school.
    const rows = liveAll(`
      SELECT p.batch_name, p.academic_year, p.course_name, p.school_name,
             b.name AS b_name, b.academic_year AS b_year, b.course_name AS b_course, sc.name AS sc_name
      FROM payments p JOIN students s ON s.id = p.student_id
      LEFT JOIN batches b ON b.id = s.batch_id LEFT JOIN schools sc ON sc.id = s.school_id`)
    for (const r of rows) {
      expect([r.batch_name, r.academic_year, r.course_name, r.school_name]).toEqual([r.b_name, r.b_year, r.b_course, r.sc_name])
    }
    expect(rows.filter((r) => r.batch_name).length).toBeGreaterThan(0)
    expect(rows.filter((r) => r.school_name).length).toBeGreaterThan(0)
    expect(listBackups().filter((b) => b.name.startsWith('pre-update-'))).toHaveLength(1)
  })

  it('does not back up or migrate a database that is already current', async () => {
    freshDataDir()
    await setupTestAuth()
    await signOut()
    await testLogin()
    expect(schemaVersion(liveAll)).toBe(10)
    expect(listBackups()).toHaveLength(0)
  })

  it('a wrong password leaves an old database untouched and un-migrated', async () => {
    freshDataDir()
    const raw = new SQL.Database()
    raw.run('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)')
    for (const m of MIGRATIONS.filter((x) => x.version <= 9)) {
      raw.exec(m.sql)
      raw.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [m.version, m.name, 'x'])
    }
    raw.run("INSERT INTO app_user (id, username, created_at, updated_at) VALUES (1, 'admin', 'x', 'x')")
    installAsLiveFile(raw)
    raw.close()
    const bytes = readFileSync(dataPath('chisel.db'))
    await expect(auth.unlockLegacy({ password: 'wrong-password' })).rejects.toThrow(/Incorrect password/)
    expect(readFileSync(dataPath('chisel.db')).equals(bytes)).toBe(true)
    expect(listBackups()).toHaveLength(0)
  })
})
