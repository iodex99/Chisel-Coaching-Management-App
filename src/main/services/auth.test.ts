import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { authenticator } from 'otplib'
import initSqlJs from 'sql.js'

let userDataDir: string

// Mock Electron: data dir via CHISEL_DATA_DIR; the WASM path resolves to the project root.
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd())
  }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from './auth'
import * as twoFactor from './twoFactor'
import * as students from './student'
import { getSetting } from './settings'
import { ensureDataDirs, dataPath } from '../paths'
import { isOpen, flushCurrent } from '../db/database'
import { readKeyfile, writeKeyfile, dataKeyOf, type KeyfileV2 } from '../db/keyfile'
import { decrypt } from '../db/crypto'

let dataDir: string

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-test-'))
  userDataDir = mkdtempSync(join(tmpdir(), 'chisel-userdata-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
})

afterAll(async () => {
  if (isOpen()) {
    await flushCurrent()
    auth.logout()
  }
  delete process.env.CHISEL_DATA_DIR
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* best-effort temp cleanup */ }
  try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* best-effort temp cleanup */ }
})

// Shared across the ordered flow below.
let secret = ''
let recoveryCodes: string[] = []
const code = (s = secret): string => authenticator.generate(s)

async function signOut(): Promise<void> {
  if (isOpen()) await flushCurrent()
  auth.logout()
}

describe('first-run setup (no username, no password)', () => {
  it('starts uninitialized with no password-related state', () => {
    expect(auth.isInitialized()).toBe(false)
    expect(auth.getAuthState()).toEqual({
      initialized: false,
      authenticated: false,
      stage: null,
      locked: false,
      lockedUntil: null,
      legacyPassword: false
    })
  })

  it('beginSetup returns a QR code without creating any data', async () => {
    const start = await auth.beginSetup()
    expect(start.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(start.otpauthUrl).toContain('otpauth://totp/')
    expect(start.secret.length).toBeGreaterThanOrEqual(16)
    expect(existsSync(dataPath('keyfile.json'))).toBe(false)
    expect(existsSync(dataPath('chisel.db'))).toBe(false)
  })

  it('a wrong code during setup creates nothing', async () => {
    const start = await auth.beginSetup()
    await expect(auth.setup({ secret: start.secret, code: '000000' })).rejects.toThrow(/not valid/)
    // a code from a different secret is just as wrong
    const other = authenticator.generateSecret()
    await expect(auth.setup({ secret: start.secret, code: code(other) === code(start.secret) ? '111111' : code(other) })).rejects.toThrow(/not valid/)
    expect(auth.isInitialized()).toBe(false)
    expect(existsSync(dataPath('keyfile.json'))).toBe(false)
    expect(existsSync(dataPath('chisel.db'))).toBe(false)
  })

  it('the code from the scanned app creates the data, signed in, with that authenticator', async () => {
    const start = await auth.beginSetup('My Institute')
    secret = start.secret
    const res = await auth.setup({ instituteName: 'My Institute', secret, label: 'Office phone', code: code() })
    expect(res.status).toBe('ok')
    expect(res.user.id).toBe(1)
    expect(auth.isInitialized()).toBe(true)
    expect(auth.getAuthState()).toMatchObject({ initialized: true, authenticated: true, stage: 'authenticated', legacyPassword: false })
    expect(twoFactor.enrolledCount()).toBe(1)
    expect(twoFactor.listAuthenticators()[0].label).toBe('Office phone')
    expect(getSetting('institute.name')).toBe('My Institute')
  })

  it('keyfile v2 holds a random 256-bit key and nothing password-related', () => {
    const kf = readKeyfile() as KeyfileV2 & Record<string, unknown>
    expect(kf.version).toBe(2)
    expect(dataKeyOf(kf)).toHaveLength(32)
    expect(kf.kdf).toBeUndefined()
    expect(kf.username).toBeUndefined()
    expect(JSON.stringify(kf)).not.toMatch(/password|salt/i)
    expect(kf.failedAttempts).toBe(0)
  })

  it('setup cannot run twice', async () => {
    await expect(auth.beginSetup()).rejects.toThrow(/already set up/)
    await expect(auth.setup({ secret, code: code() })).rejects.toThrow(/already set up/)
  })

  it('the database on disk is encrypted with the stored key', async () => {
    students.createStudent({ admissionNo: 'ENC-1', firstName: 'Zebulon', lastName: 'Quartz', status: 'active', guardians: [] })
    await flushCurrent()
    const blob = readFileSync(dataPath('chisel.db'))
    expect(blob.includes(Buffer.from('Zebulon'))).toBe(false)
    const SQL = await initSqlJs({ wasmBinary: readFileSync(join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')).buffer as ArrayBuffer })
    const db = new SQL.Database(decrypt(blob, dataKeyOf(readKeyfile() as KeyfileV2)))
    expect(db.exec("SELECT first_name FROM students WHERE admission_no = 'ENC-1'")[0].values[0][0]).toBe('Zebulon')
    db.close()
  })

  it('generates recovery codes', () => {
    recoveryCodes = twoFactor.generateRecoveryCodes()
    expect(recoveryCodes).toHaveLength(10)
    expect(twoFactor.recoveryCodesRemaining()).toBe(10)
  })
})

describe('sign in with an authenticator code only', () => {
  it('signing out closes the data', async () => {
    await signOut()
    expect(isOpen()).toBe(false)
    expect(auth.getAuthState()).toMatchObject({ initialized: true, authenticated: false, stage: null })
  })

  it('rejects a wrong code and leaves the data closed', async () => {
    await expect(auth.login({ code: '000000' })).rejects.toThrow(/Invalid authentication code/)
    expect(auth.getAuthState().authenticated).toBe(false)
    expect(isOpen()).toBe(false)
    expect(readKeyfile().failedAttempts).toBe(1)
  })

  it('accepts the current code and resets the failure count', async () => {
    const res = await auth.login({ code: code() })
    expect(res.status).toBe('ok')
    expect(auth.getAuthState().authenticated).toBe(true)
    expect(readKeyfile().failedAttempts).toBe(0)
    // the data written before signing out is there
    expect(students.listStudents().some((s) => s.admissionNo === 'ENC-1')).toBe(true)
  })

  it('tolerates spaces in the code', async () => {
    await signOut()
    const c = code()
    await auth.login({ code: ` ${c.slice(0, 3)} ${c.slice(3)} ` })
    expect(auth.getAuthState().authenticated).toBe(true)
  })

  it('accepts a one-time recovery code, which then cannot be reused', async () => {
    await signOut()
    const rc = recoveryCodes[0]
    await auth.login({ code: rc })
    expect(auth.getAuthState().authenticated).toBe(true)
    expect(twoFactor.recoveryCodesRemaining()).toBe(9)
    await signOut()
    await expect(auth.login({ code: rc })).rejects.toThrow(/Invalid authentication code/)
    // recovery codes are accepted case-insensitively and without the dash
    await auth.login({ code: recoveryCodes[1].replace('-', '').toLowerCase() })
    expect(twoFactor.recoveryCodesRemaining()).toBe(8)
  })

  it('any enrolled authenticator signs in', async () => {
    const s2 = await twoFactor.beginEnroll('Tablet', auth.accountName())
    expect(decodeURIComponent(s2.otpauthUrl)).toContain('My Institute (Tablet)')
    twoFactor.confirmEnroll(s2.secret, 'Tablet', code(s2.secret))
    await signOut()
    await auth.login({ code: code(s2.secret) })
    expect(auth.getAuthState().authenticated).toBe(true)
    twoFactor.removeAuthenticator(twoFactor.listAuthenticators().find((a) => a.label === 'Tablet')!.id)
    await signOut()
    await expect(auth.login({ code: code(s2.secret) })).rejects.toThrow(/Invalid/)
    await auth.login({ code: code() })
  })

  it('the code is required: services refuse a signed-out session', async () => {
    await signOut()
    expect(() => auth.requireSession()).toThrow(/Not authorized/)
    expect(() => auth.verifyCode(code())).toThrow(/Not authorized/)
    await auth.login({ code: code() })
    expect(() => auth.requireSession()).not.toThrow()
  })

  it('a code from a stranger’s authenticator never signs in', async () => {
    await signOut()
    await expect(auth.login({ code: code(authenticator.generateSecret()) })).rejects.toThrow()
    await auth.login({ code: code() })
  })

  it('there is no trusted-device bypass: every sign-in needs a code', async () => {
    await signOut()
    await expect(auth.login({ code: '' })).rejects.toThrow()
    expect(auth.getAuthState().authenticated).toBe(false)
    await auth.login({ code: code() })
  })
})

describe('re-authentication gate', () => {
  it('verifyCode accepts the current code (or a recovery code) and rejects others', () => {
    expect(auth.verifyCode(code())).toBe(true)
    expect(auth.verifyCode('000000')).toBe(false)
    const before = twoFactor.recoveryCodesRemaining()
    expect(auth.verifyCode(recoveryCodes[5])).toBe(true)
    expect(twoFactor.recoveryCodesRemaining()).toBe(before - 1)
    expect(auth.verifyCode(recoveryCodes[5])).toBe(false)
  })
})

describe('authenticator management', () => {
  it('enforces the 3-authenticator limit and keeps at least one', async () => {
    for (const label of ['Tablet', 'Backup']) {
      const s = await twoFactor.beginEnroll(label, 'x')
      twoFactor.confirmEnroll(s.secret, label, code(s.secret))
    }
    expect(twoFactor.enrolledCount()).toBe(3)
    await expect(twoFactor.beginEnroll('Extra', 'x')).rejects.toThrow(/at most 3/)

    const list = twoFactor.listAuthenticators()
    twoFactor.removeAuthenticator(list[1].id)
    twoFactor.removeAuthenticator(list[2].id)
    expect(twoFactor.enrolledCount()).toBe(1)
    expect(() => twoFactor.removeAuthenticator(twoFactor.listAuthenticators()[0].id)).toThrow(/At least one/)
  })

  it('rejects adding the same authenticator twice', () => {
    expect(() => twoFactor.confirmEnroll(secret, 'Again', code())).toThrow(/already added/)
  })

  it('rejects a bad enrollment code', () => {
    expect(() => twoFactor.confirmEnroll(authenticator.generateSecret(), 'x', '000000')).toThrow(/not valid/)
  })

  it('status no longer reports trusted devices', () => {
    const st = twoFactor.status() as unknown as Record<string, unknown>
    expect(st).toMatchObject({ enrolledCount: 1 })
    expect(st.trustedDevices).toBeUndefined()
    expect(st.deviceTrusted).toBeUndefined()
  })
})

describe('wrong-key and wrong-version protection', () => {
  it('a keyfile that does not match the database (and no backup to verify against) is refused and counted', async () => {
    await signOut()
    const good = readKeyfile() as KeyfileV2
    writeKeyfile({ ...good, dataKey: Buffer.alloc(32, 7).toString('base64') })
    await expect(auth.login({ code: code() })).rejects.toThrow(/could not be opened/)
    // Counted, so the backup check can never be used to test codes past the lockout.
    expect(readKeyfile().failedAttempts).toBe(1)
    expect(isOpen()).toBe(false)
    writeKeyfile(good)
    await auth.login({ code: code() })
    expect(auth.getAuthState().authenticated).toBe(true)
  })

  it('a truncated data key is reported as a damaged keyfile', async () => {
    await signOut()
    const good = readKeyfile() as KeyfileV2
    writeKeyfile({ ...good, dataKey: 'AAAA' })
    await expect(auth.login({ code: code() })).rejects.toThrow(/damaged/)
    writeKeyfile(good)
    await auth.login({ code: code() })
  })

  it('unlockLegacy refuses data that is already on code-only sign-in', async () => {
    await signOut()
    await expect(auth.unlockLegacy({ password: 'whatever', code: code() })).rejects.toThrow(/already up to date/)
    await auth.login({ code: code() })
  })
})
