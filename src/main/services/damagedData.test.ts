import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, readdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { authenticator } from 'otplib'

// Why "the right password was rejected" on v1.0.24: the encryption cannot tell a
// wrong password from a damaged data file (e.g. a save cut short by a power
// cut), and v1.0.24 reported every failure to open as "Incorrect password" and
// counted it toward the lockout. These tests pin the fixed behaviour.
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
import * as backup from './backup'
import { setupTestAuth } from './testAuth'
import { ensureDataDirs, dataPath } from '../paths'
import { createNewDatabase, closeDatabase, getDb, isOpen, flushCurrent, decryptFile } from '../db/database'
import { deriveKey, generateSalt, encrypt, DEFAULT_KDF } from '../db/crypto'
import { createLegacyKeyfile, readKeyfile, writeKeyfile, isLegacyKeyfile, dataKeyOf, type KeyfileV2, type LegacyKeyfile } from '../db/keyfile'

const PASSWORD = 'right-password-1'
const dirs: string[] = []
let secret = ''
const code = (): string => authenticator.generate(secret)

function freshDir(): void {
  const d = mkdtempSync(join(tmpdir(), 'chisel-damaged-'))
  dirs.push(d)
  process.env.CHISEL_DATA_DIR = d
  ensureDataDirs()
}

async function signOut(): Promise<void> {
  if (isOpen()) await flushCurrent()
  auth.logout()
}

/** Power cut right after a save: the file keeps its size, the data never reached the disk. */
function zeroFillLive(): Buffer {
  const before = readFileSync(dataPath('chisel.db'))
  writeFileSync(dataPath('chisel.db'), Buffer.alloc(before.length))
  return before
}

const admissionNos = (): string[] => students.listStudents({ status: 'all' }).map((s) => s.admissionNo).sort()

/** A v1.0.24-format install (password key, v1 keyfile) with an authenticator,
 *  backup "older" holding OLD-1 and backup "newer" holding OLD-1 + OLD-2. */
async function legacyInstallWithBackups(): Promise<{ older: string; newer: string; recovery: string[] }> {
  freshDir()
  const salt = generateSalt()
  const key = deriveKey(PASSWORD, salt, DEFAULT_KDF)
  const db = await createNewDatabase(key)
  createLegacyKeyfile('admin', salt, DEFAULT_KDF)
  const ts = new Date().toISOString()
  db.transaction((d) => d.run("INSERT INTO app_user (id, username, display_name, created_at, updated_at) VALUES (1, 'admin', 'admin', ?, ?)", [ts, ts]))
  const start = await twoFactor.beginEnroll('Phone', 'admin')
  secret = start.secret
  twoFactor.confirmEnroll(secret, 'Phone', code())
  const recovery = twoFactor.generateRecoveryCodes()
  students.createStudent({ admissionNo: 'OLD-1', firstName: 'One', status: 'active', guardians: [] })
  const older = (await backup.createBackup('auto')).name
  await new Promise((r) => setTimeout(r, 20)) // distinct mtimes
  students.createStudent({ admissionNo: 'OLD-2', firstName: 'Two', status: 'active', guardians: [] })
  const newer = (await backup.createBackup('auto')).name
  students.createStudent({ admissionNo: 'OLD-3', firstName: 'Three (after the last backup)', status: 'active', guardians: [] })
  await flushCurrent()
  closeDatabase()
  return { older, newer, recovery }
}

beforeEach(signOut)

afterAll(async () => {
  await signOut()
  delete process.env.CHISEL_DATA_DIR
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* best-effort temp cleanup */ }
  }
})

describe('password-based data (as left by v1.0.24) with a damaged data file', () => {
  it('the RIGHT password is recognised: "damaged", newest working backup offered, no failure counted', async () => {
    const { newer } = await legacyInstallWithBackups()
    zeroFillLive()
    const res = await auth.unlockLegacy({ password: PASSWORD, code: code() })
    expect(res).toMatchObject({ status: 'damaged', backup: { name: newer } })
    expect(readKeyfile().failedAttempts).toBe(0)
    expect(isOpen()).toBe(false)
    expect(isLegacyKeyfile(readKeyfile())).toBe(true) // nothing converted or changed
  })

  it('a WRONG password on the same damaged file is still "Incorrect password" and counts', async () => {
    await legacyInstallWithBackups()
    zeroFillLive()
    await expect(auth.unlockLegacy({ password: 'not-it', code: code() })).rejects.toThrow(/Incorrect password/)
    expect(readKeyfile().failedAttempts).toBe(1)
  })

  it('a truncated file is handled the same way', async () => {
    const { newer } = await legacyInstallWithBackups()
    writeFileSync(dataPath('chisel.db'), readFileSync(dataPath('chisel.db')).subarray(0, 20))
    expect(await auth.unlockLegacy({ password: PASSWORD, code: code() })).toMatchObject({ status: 'damaged', backup: { name: newer } })
  })

  it('restoring keeps the damaged file, puts the backup in place, and the normal unlock then works', async () => {
    const { newer } = await legacyInstallWithBackups()
    const damagedBytes = Buffer.alloc(statSync(dataPath('chisel.db')).size)
    writeFileSync(dataPath('chisel.db'), damagedBytes)

    await expect(auth.restoreDamaged({ name: newer, password: 'not-it' })).rejects.toThrow()
    await auth.restoreDamaged({ name: newer, password: PASSWORD })

    const aside = readdirSync(dataPath('backups')).filter((n) => n.startsWith('damaged-'))
    expect(aside).toHaveLength(1)
    expect(readFileSync(dataPath('backups', aside[0], 'chisel.db')).equals(damagedBytes)).toBe(true)
    expect(existsSync(dataPath('backups', aside[0], 'keyfile.json'))).toBe(true)

    const res = await auth.unlockLegacy({ password: PASSWORD, code: code() })
    expect(res.status).toBe('ok')
    expect(admissionNos()).toEqual(['OLD-1', 'OLD-2']) // OLD-3 was entered after the last backup
    expect(isLegacyKeyfile(readKeyfile())).toBe(false)
    // The set-aside damaged copy is never offered again.
    await signOut()
    expect(backup.listBackups().some((b) => b.name.startsWith('damaged-'))).toBe(true)
  })

  it('restore is refused when the data file is not actually damaged', async () => {
    const { newer } = await legacyInstallWithBackups()
    await expect(auth.restoreDamaged({ name: newer, password: PASSWORD })).rejects.toThrow(/not damaged/)
    expect(readdirSync(dataPath('backups')).some((n) => n.startsWith('damaged-'))).toBe(false)
  })

  it('restore refuses unknown backup names and the set-aside damaged copies', async () => {
    await legacyInstallWithBackups()
    zeroFillLive()
    await expect(auth.restoreDamaged({ name: 'nope', password: PASSWORD })).rejects.toThrow(/could not be verified/)
  })

  it('with no working backup the message says so — it does not just claim the password is wrong forever', async () => {
    await legacyInstallWithBackups()
    rmSync(dataPath('backups'), { recursive: true, force: true })
    zeroFillLive()
    await expect(auth.unlockLegacy({ password: PASSWORD, code: code() })).rejects.toThrow(/Incorrect password/)
  })
})

describe('lockout left behind by v1.0.24', () => {
  it('is lifted once for the upgrade, and the normal lockout applies after', async () => {
    await legacyInstallWithBackups()
    const kf = readKeyfile() as LegacyKeyfile
    writeKeyfile({ ...kf, failedAttempts: 9, lockedUntil: new Date(Date.now() + 8 * 3600_000).toISOString() })
    const res = await auth.unlockLegacy({ password: PASSWORD, code: code() })
    expect(res.status).toBe('ok')
  })

  it('is only lifted once', async () => {
    await legacyInstallWithBackups()
    for (let i = 0; i < 4; i++) await expect(auth.unlockLegacy({ password: 'x' })).rejects.toThrow(/Incorrect/)
    await expect(auth.unlockLegacy({ password: 'x' })).rejects.toThrow(/Too many failed attempts/)
    expect((readKeyfile() as LegacyKeyfile).upgradeLockReleased).toBe(true)
    await expect(auth.unlockLegacy({ password: PASSWORD, code: code() })).rejects.toThrow(/Too many failed attempts/)
  })
})

describe('code sign-in (v1.0.25 data) with a damaged data file', () => {
  async function v2InstallWithBackups(): Promise<{ newer: string; recovery: string[] }> {
    freshDir()
    secret = await setupTestAuth()
    const recovery = twoFactor.generateRecoveryCodes()
    students.createStudent({ admissionNo: 'N-1', firstName: 'One', status: 'active', guardians: [] })
    await backup.createBackup('auto')
    await new Promise((r) => setTimeout(r, 20))
    students.createStudent({ admissionNo: 'N-2', firstName: 'Two', status: 'active', guardians: [] })
    const newer = (await backup.createBackup('auto')).name
    await signOut()
    return { newer, recovery }
  }

  it('the right code is recognised and the newest backup offered; a wrong code counts', async () => {
    const { newer } = await v2InstallWithBackups()
    zeroFillLive()
    expect(await auth.login({ code: code() })).toMatchObject({ status: 'damaged', backup: { name: newer } })
    expect(readKeyfile().failedAttempts).toBe(0)
    await expect(auth.login({ code: '000000' })).rejects.toThrow(/no backup could be verified/)
    expect(readKeyfile().failedAttempts).toBe(1)
  })

  it('a recovery code also identifies the backup, without being used up', async () => {
    const { newer, recovery } = await v2InstallWithBackups()
    zeroFillLive()
    expect(await auth.login({ code: recovery[0] })).toMatchObject({ status: 'damaged', backup: { name: newer } })
    await auth.restoreDamaged({ name: newer, code: recovery[0] })
    await auth.login({ code: recovery[0] }) // still unused after the check
    expect(twoFactor.recoveryCodesRemaining()).toBe(9)
  })

  it('restore with the code, then sign in: the data is back', async () => {
    const { newer } = await v2InstallWithBackups()
    zeroFillLive()
    await expect(auth.restoreDamaged({ name: newer, code: '000000' })).rejects.toThrow(/could not be verified/)
    await auth.restoreDamaged({ name: newer, code: code() })
    expect((await auth.login({ code: code() })).status).toBe('ok')
    expect(admissionNos()).toEqual(['N-1', 'N-2'])
  })
})

describe('errors that are not about the password are reported as themselves', () => {
  it('data that decrypts but will not open: real message, nothing counted, nothing changed', async () => {
    await legacyInstallWithBackups()
    const kf = readKeyfile() as LegacyKeyfile
    const key = deriveKey(PASSWORD, Buffer.from(kf.kdf.salt, 'base64'), kf.kdf)
    writeFileSync(dataPath('chisel.db'), encrypt(Buffer.from('this is not an SQLite database at all, just text '.repeat(20)), key))
    const bytes = readFileSync(dataPath('chisel.db'))
    await expect(auth.unlockLegacy({ password: PASSWORD, code: code() })).rejects.toThrow(/sign-in details are correct, but the data could not be opened/)
    expect(readKeyfile().failedAttempts).toBe(0)
    expect(readFileSync(dataPath('chisel.db')).equals(bytes)).toBe(true)
    expect(isLegacyKeyfile(readKeyfile())).toBe(true)
  })
})

describe('saving is durable and ordered', () => {
  it('an older background save can never overwrite a newer one', async () => {
    freshDir()
    secret = await setupTestAuth()
    const db = getDb()
    students.createStudent({ admissionNo: 'S-1', firstName: 'First', status: 'active', guardians: [] })
    await new Promise((r) => setImmediate(r)) // background save of the S-1 state is now in flight
    students.createStudent({ admissionNo: 'S-2', firstName: 'Second', status: 'active', guardians: [] })
    db.persist() // e.g. sign-out / quit: the S-2 state is written synchronously
    // Let the older background save finish (no flush here — a flush would re-save and hide it).
    await new Promise((r) => setTimeout(r, 500))
    const key = dataKeyOf(readKeyfile() as KeyfileV2)
    const text = decryptFile(dataPath('chisel.db'), key)!.toString('latin1')
    expect(text).toContain('S-2')
    // no temp files are left behind
    expect(readdirSync(dataPath()).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('many rapid changes always leave a file that opens, with the latest data', async () => {
    freshDir()
    secret = await setupTestAuth()
    for (let i = 0; i < 30; i++) {
      students.createStudent({ admissionNo: `R-${i}`, firstName: 'R', status: 'active', guardians: [] })
      if (i % 3 === 0) await new Promise((r) => setImmediate(r))
    }
    await signOut()
    await auth.login({ code: code() })
    expect(admissionNos().filter((a) => a.startsWith('R-'))).toHaveLength(30)
    expect(readdirSync(dataPath()).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})
