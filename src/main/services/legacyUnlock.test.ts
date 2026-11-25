import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { authenticator } from 'otplib'

// Data created by v1.0.24 and earlier is encrypted with a key derived from the
// master password. The first sign-in after the update unlocks it once with
// that password + an authenticator code and switches it to code-only sign-in.
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() },
  shell: { openPath: async () => '' }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from './auth'
import * as twoFactor from './twoFactor'
import * as students from './student'
import * as payments from './payment'
import * as backup from './backup'
import * as demo from './demo'
import { ensureDataDirs, dataPath } from '../paths'
import { createNewDatabase, closeDatabase, getDb, isOpen, flushCurrent } from '../db/database'
import { deriveKey, generateSalt, decrypt, DEFAULT_KDF } from '../db/crypto'
import { createLegacyKeyfile, readKeyfile, isLegacyKeyfile, dataKeyOf, type KeyfileV2 } from '../db/keyfile'

const PASSWORD = 'oldpass123'
const dirs: string[] = []
let secret = ''
let recovery: string[] = []
const code = (s = secret): string => authenticator.generate(s)

type Row = Record<string, unknown>
/** Every row of every table, ordered by rowid. */
function dumpAll(): Record<string, Row[]> {
  const out: Record<string, Row[]> = {}
  const tables = getDb()
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((r) => r.name)
  for (const t of tables) out[t] = getDb().all(`SELECT * FROM "${t}" ORDER BY rowid`)
  return out
}
/** Same, minus the rows that signing in itself legitimately touches. */
function dumpData(): Record<string, Row[]> {
  const d = dumpAll()
  delete d.audit_log // sign-in / conversion are audited
  d.two_factor = d.two_factor.map(({ last_used_at: _ignored, ...r }) => r) // "last used" is stamped
  d.recovery_codes = d.recovery_codes.map(({ used_at: _ignored, ...r }) => r)
  return d
}

async function signOut(): Promise<void> {
  if (isOpen()) await flushCurrent()
  auth.logout()
}

/** Build a data folder exactly as v1.0.24 did: password-derived key, v1
 *  keyfile, optional authenticator + recovery codes, some real records. */
async function legacyInstall(opts: { enroll: boolean; sample?: boolean }): Promise<Record<string, Row[]>> {
  const dir = mkdtempSync(join(tmpdir(), 'chisel-legacy-'))
  dirs.push(dir)
  process.env.CHISEL_DATA_DIR = dir
  ensureDataDirs()

  const salt = generateSalt()
  const key = deriveKey(PASSWORD, salt, DEFAULT_KDF)
  const db = await createNewDatabase(key)
  const ts = new Date().toISOString()
  db.transaction((d) => {
    d.run("INSERT INTO app_user (id, username, display_name, created_at, updated_at) VALUES (1, 'admin', 'admin', ?, ?)", [ts, ts])
    d.run("INSERT INTO settings (key, value, updated_at) VALUES ('institute.name', 'Chisel Coaching Classes', ?)", [ts])
  })
  if (opts.enroll) {
    const start = await twoFactor.beginEnroll('Phone', 'admin')
    secret = start.secret
    twoFactor.confirmEnroll(secret, 'Phone', code())
    recovery = twoFactor.generateRecoveryCodes()
  }
  if (opts.sample) await demo.seedDemoData()
  students.createStudent({ admissionNo: 'L-1', firstName: 'Legacy', lastName: 'Student', status: 'active', guardians: [] })
  payments.recordPayment({ studentId: students.listStudents().find((s) => s.admissionNo === 'L-1')!.id, amount: 123456, paymentDate: '2026-06-01', mode: 'cash' })
  const before = dumpData()
  await flushCurrent()
  closeDatabase()
  createLegacyKeyfile('admin', salt, DEFAULT_KDF)
  return before
}

beforeEach(signOut)

afterAll(async () => {
  await signOut()
  delete process.env.CHISEL_DATA_DIR
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* best-effort temp cleanup */ }
  }
})

describe('one-time unlock of password-based data', () => {
  it('reports the data as legacy and refuses a plain code sign-in', async () => {
    await legacyInstall({ enroll: true })
    expect(auth.getAuthState()).toMatchObject({ initialized: true, authenticated: false, legacyPassword: true })
    await expect(auth.login({ code: code() })).rejects.toThrow(/master password/)
    expect(isLegacyKeyfile(readKeyfile())).toBe(true)
    expect(readKeyfile().failedAttempts).toBe(0)
  })

  it('a wrong password is refused, leaves the files untouched and counts toward the lock', async () => {
    await legacyInstall({ enroll: true })
    const dbBytes = readFileSync(dataPath('chisel.db'))
    await expect(auth.unlockLegacy({ password: 'wrong', code: code() })).rejects.toThrow(/Incorrect password/)
    expect(readFileSync(dataPath('chisel.db')).equals(dbBytes)).toBe(true)
    expect(isLegacyKeyfile(readKeyfile())).toBe(true)
    expect(readKeyfile().failedAttempts).toBe(1)
    expect(isOpen()).toBe(false)
  })

  it('the right password alone is not enough when an authenticator exists', async () => {
    await legacyInstall({ enroll: true })
    await expect(auth.unlockLegacy({ password: PASSWORD })).rejects.toThrow(/6-digit code/)
    await expect(auth.unlockLegacy({ password: PASSWORD, code: '000000' })).rejects.toThrow(/Invalid authentication code/)
    expect(isLegacyKeyfile(readKeyfile())).toBe(true)
    expect(auth.getAuthState().authenticated).toBe(false)
    expect(isOpen()).toBe(false)
  })

  it('password + code converts to code-only sign-in without changing any data', async () => {
    const before = await legacyInstall({ enroll: true, sample: true })
    const legacyKf = readKeyfile()
    const res = await auth.unlockLegacy({ password: PASSWORD, code: code() })
    expect(res.status).toBe('ok')
    expect(auth.getAuthState()).toMatchObject({ authenticated: true, legacyPassword: false })

    // Every record is exactly as it was.
    expect(dumpData()).toEqual(before)
    expect(before.payments.length).toBeGreaterThan(10)

    // The keyfile is now v2, holding the same key — the database was not re-encrypted.
    const kf = readKeyfile() as KeyfileV2 & Record<string, unknown>
    expect(kf.version).toBe(2)
    expect(kf.kdf).toBeUndefined()
    expect(kf.username).toBeUndefined()
    expect(kf.createdAt).toBe(legacyKf.createdAt)
    expect(kf.convertedFromPasswordAt).toBeTruthy()
    expect(dataKeyOf(kf).equals(deriveKey(PASSWORD, Buffer.from((legacyKf as { kdf: { salt: string } }).kdf.salt, 'base64'), DEFAULT_KDF))).toBe(true)
    expect(getDb().get<{ c: number }>("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'remove-password'")?.c).toBe(1)

    // From now on: code only. The password is no longer asked for or accepted.
    await signOut()
    await auth.login({ code: code() })
    expect(dumpData()).toEqual(before)
    await signOut()
    await expect(auth.unlockLegacy({ password: PASSWORD, code: code() })).rejects.toThrow(/already up to date/)
    // The file on disk decrypts with the stored key.
    expect(() => decrypt(readFileSync(dataPath('chisel.db')), dataKeyOf(kf))).not.toThrow()
  })

  it('a recovery code works for the unlock (phone lost)', async () => {
    const before = await legacyInstall({ enroll: true })
    await auth.unlockLegacy({ password: PASSWORD, code: recovery[3] })
    expect(auth.getAuthState().authenticated).toBe(true)
    expect(twoFactor.recoveryCodesRemaining()).toBe(9)
    expect(isLegacyKeyfile(readKeyfile())).toBe(false)
    expect(dumpData().students).toEqual(before.students)
  })

  it('old data with no authenticator: enroll first, and only then is the password dropped', async () => {
    const before = await legacyInstall({ enroll: false })
    const res = await auth.unlockLegacy({ password: PASSWORD })
    expect(res.status).toBe('enroll_required')
    expect(auth.getAuthState()).toMatchObject({ stage: 'pending-enroll', authenticated: false })
    expect(() => auth.requireSession()).toThrow(/Not authorized/)
    // Quitting before enrolling leaves the data on its old password.
    await signOut()
    expect(isLegacyKeyfile(readKeyfile())).toBe(true)

    await auth.unlockLegacy({ password: PASSWORD })
    const start = await twoFactor.beginEnroll(undefined, auth.accountName())
    secret = start.secret
    twoFactor.confirmEnroll(secret, 'New phone', code())
    auth.noteEnrollment()
    expect(auth.getAuthState()).toMatchObject({ authenticated: true, legacyPassword: false })
    expect(isLegacyKeyfile(readKeyfile())).toBe(false)
    expect(dumpData().payments).toEqual(before.payments)

    await signOut()
    await auth.login({ code: code() })
    expect(auth.getAuthState().authenticated).toBe(true)
  })

  it('wrong passwords and wrong codes share one lockout', async () => {
    await legacyInstall({ enroll: true })
    for (let i = 0; i < 2; i++) await expect(auth.unlockLegacy({ password: 'nope', code: code() })).rejects.toThrow(/Incorrect/)
    for (let i = 0; i < 2; i++) await expect(auth.unlockLegacy({ password: PASSWORD, code: '000000' })).rejects.toThrow(/Invalid/)
    await expect(auth.unlockLegacy({ password: 'nope' })).rejects.toThrow(/Too many failed attempts/)
    await expect(auth.unlockLegacy({ password: PASSWORD, code: code() })).rejects.toThrow(/Too many failed attempts/)
    expect(isLegacyKeyfile(readKeyfile())).toBe(true)
  })
})

describe('backups across the switch', () => {
  it('restoring a pre-switch backup brings back the password unlock; data and code both work', async () => {
    await legacyInstall({ enroll: true })
    // Backup made while still on v1.0.24's password scheme (folder holds the v1 keyfile).
    const legacyBackup = await backup.createBackup('manual')
    expect(JSON.parse(readFileSync(join(dataPath('backups', legacyBackup.name), 'keyfile.json'), 'utf8')).version).toBe(1)

    await auth.unlockLegacy({ password: PASSWORD, code: code() })
    students.createStudent({ admissionNo: 'AFTER', firstName: 'After', status: 'active', guardians: [] })
    expect(students.listStudents().some((s) => s.admissionNo === 'AFTER')).toBe(true)

    await backup.restoreBackup(legacyBackup.name)
    expect(auth.getAuthState()).toMatchObject({ authenticated: false, legacyPassword: true })
    await expect(auth.login({ code: code() })).rejects.toThrow(/master password/)
    await auth.unlockLegacy({ password: PASSWORD, code: code() })
    expect(students.listStudents().some((s) => s.admissionNo === 'L-1')).toBe(true)
    expect(students.listStudents().some((s) => s.admissionNo === 'AFTER')).toBe(false)
    expect(auth.getAuthState().legacyPassword).toBe(false)
  })

  it('a backup made after the switch restores and signs in with just the code', async () => {
    await legacyInstall({ enroll: true })
    await auth.unlockLegacy({ password: PASSWORD, code: code() })
    const snap = await backup.createBackup('manual')
    const bkf = JSON.parse(readFileSync(join(dataPath('backups', snap.name), 'keyfile.json'), 'utf8'))
    expect(bkf.version).toBe(2)
    expect(existsSync(join(dataPath('backups', snap.name), 'chisel.db'))).toBe(true)

    students.createStudent({ admissionNo: 'LATER', firstName: 'Later', status: 'active', guardians: [] })
    await backup.restoreBackup(snap.name)
    expect(auth.getAuthState()).toMatchObject({ authenticated: false, legacyPassword: false })
    await auth.login({ code: code() })
    expect(students.listStudents().some((s) => s.admissionNo === 'LATER')).toBe(false)
    expect(students.listStudents().some((s) => s.admissionNo === 'L-1')).toBe(true)
  })
})
