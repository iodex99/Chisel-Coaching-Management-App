import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { authenticator } from 'otplib'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() },
  shell: { openPath: async () => '' }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from './auth'
import * as twoFactor from './twoFactor'
import { setupTestAuth } from './testAuth'
import { ensureDataDirs } from '../paths'
import { isOpen, flushCurrent } from '../db/database'
import { readKeyfile, writeKeyfile } from '../db/keyfile'

let dataDir: string
let secret = ''
let recovery: string[] = []
const code = (): string => authenticator.generate(secret)

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-authedge-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  secret = await setupTestAuth()
  recovery = twoFactor.generateRecoveryCodes()
  await flushCurrent()
  auth.logout()
})

afterAll(async () => {
  if (isOpen()) {
    await flushCurrent()
    auth.logout()
  }
  delete process.env.CHISEL_DATA_DIR
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* best-effort temp cleanup */ }
})

describe('code sign-in lockout (brute-force protection)', () => {
  it('locks after 5 wrong codes, refusing even the right code and a recovery code', async () => {
    for (let i = 0; i < 4; i++) {
      await expect(auth.login({ code: '000000' })).rejects.toThrow(/Invalid authentication code/)
    }
    expect(auth.getAuthState().locked).toBe(false)
    // The 5th wrong code triggers the lock and says so.
    await expect(auth.login({ code: '000000' })).rejects.toThrow(/Too many failed attempts/)
    const st = auth.getAuthState()
    expect(st.locked).toBe(true)
    expect(Date.parse(st.lockedUntil as string)).toBeGreaterThan(Date.now())

    await expect(auth.login({ code: code() })).rejects.toThrow(/Too many failed attempts/)
    await expect(auth.login({ code: recovery[0] })).rejects.toThrow(/Too many failed attempts/)
    expect(auth.getAuthState().authenticated).toBe(false)
    expect(isOpen()).toBe(false)
  })

  it('the lock is stored on disk, so restarting the app does not reset it', () => {
    const kf = readKeyfile()
    expect(kf.failedAttempts).toBe(5)
    expect(Date.parse(kf.lockedUntil as string)).toBeGreaterThan(Date.now())
  })

  it('each further failure after the lock doubles the wait', async () => {
    const kf = readKeyfile()
    writeKeyfile({ ...kf, lockedUntil: new Date(Date.now() - 1000).toISOString() }) // lock expired
    const t0 = Date.now()
    await expect(auth.login({ code: '000000' })).rejects.toThrow(/Too many failed attempts/)
    const wait = Date.parse(readKeyfile().lockedUntil as string) - t0
    expect(wait).toBeGreaterThanOrEqual(59_000) // 30s × 2
    expect(wait).toBeLessThan(65_000)
  })

  it('the backoff is capped (no Invalid Date after many failures)', async () => {
    const kf = readKeyfile()
    writeKeyfile({ ...kf, failedAttempts: 5000, lockedUntil: null })
    await expect(auth.login({ code: '000000' })).rejects.toThrow(/Too many failed attempts/)
    const until = readKeyfile().lockedUntil as string
    expect(Number.isNaN(Date.parse(until))).toBe(false)
    expect(Date.parse(until) - Date.now()).toBeLessThanOrEqual(30_000 * 2 ** 10 + 1000)
  })

  it('once the lock expires the right code signs in and clears the counter', async () => {
    const kf = readKeyfile()
    writeKeyfile({ ...kf, lockedUntil: new Date(Date.now() - 1000).toISOString() })
    expect(auth.getAuthState().locked).toBe(false)
    await auth.login({ code: code() })
    expect(auth.getAuthState().authenticated).toBe(true)
    expect(readKeyfile()).toMatchObject({ failedAttempts: 0, lockedUntil: null })
  })

  it('a successful sign-in resets a partial failure count', async () => {
    await flushCurrent()
    auth.logout()
    for (let i = 0; i < 3; i++) await expect(auth.login({ code: '000000' })).rejects.toThrow(/Invalid/)
    await auth.login({ code: code() })
    expect(readKeyfile().failedAttempts).toBe(0)
    // ...so a later run of 4 wrong codes still does not lock
    await flushCurrent()
    auth.logout()
    for (let i = 0; i < 4; i++) await expect(auth.login({ code: '000000' })).rejects.toThrow(/Invalid/)
    expect(auth.getAuthState().locked).toBe(false)
    await auth.login({ code: code() })
  })

  it('input that is not a code at all is still just a wrong code', async () => {
    await flushCurrent()
    auth.logout()
    for (const junk of ['abcdef', '12345678901234567890', "' OR 1=1 --", '-----']) {
      await expect(auth.login({ code: junk })).rejects.toThrow(/Invalid/)
    }
    await auth.login({ code: code() })
    expect(auth.getAuthState().authenticated).toBe(true)
  })

  it('signing in from the not-set-up state is refused', async () => {
    const other = mkdtempSync(join(tmpdir(), 'chisel-authedge-empty-'))
    process.env.CHISEL_DATA_DIR = other
    try {
      await expect(auth.login({ code: code() })).rejects.toThrow(/not set up/)
      await expect(auth.unlockLegacy({ password: 'x' })).rejects.toThrow(/not set up/)
    } finally {
      process.env.CHISEL_DATA_DIR = dataDir
      rmSync(other, { recursive: true, force: true })
    }
  })
})
