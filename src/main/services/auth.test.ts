import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { authenticator } from 'otplib'

let userDataDir: string

// Mock Electron: data dir via CHISEL_DATA_DIR; userData (device identity) and
// the WASM path resolve to temp / the project root respectively.
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
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-test-'))
  userDataDir = mkdtempSync(join(tmpdir(), 'chisel-userdata-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
})

afterAll(() => {
  delete process.env.CHISEL_DATA_DIR
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(userDataDir, { recursive: true, force: true })
})

// Shared across the ordered flow below.
let secret = ''
let recoveryCodes: string[] = []

describe('auth + 2FA flow', () => {
  it('setup requires 2FA enrollment next', async () => {
    expect(auth.isInitialized()).toBe(false)
    const res = await auth.setup({ username: 'admin', password: 'password123', instituteName: 'Test' })
    expect(res.status).toBe('enroll_required')
    expect(auth.getAuthState().stage).toBe('pending-enroll')
    expect(auth.getAuthState().authenticated).toBe(false)
  })

  it('enrolls an authenticator and becomes authenticated', async () => {
    const start = await twoFactor.beginEnroll(undefined, 'admin')
    secret = start.secret
    expect(start.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    twoFactor.confirmEnroll(secret, 'My Phone', authenticator.generate(secret))
    auth.noteEnrollment()
    expect(auth.getAuthState().authenticated).toBe(true)
    expect(twoFactor.enrolledCount()).toBe(1)
  })

  it('rejects a bad enrollment code', () => {
    expect(() => twoFactor.confirmEnroll(authenticator.generateSecret(), 'x', '000000')).toThrow()
  })

  it('generates recovery codes', () => {
    recoveryCodes = twoFactor.generateRecoveryCodes()
    expect(recoveryCodes).toHaveLength(10)
    expect(twoFactor.recoveryCodesRemaining()).toBe(10)
  })

  it('requires 2FA on login from an untrusted device', async () => {
    auth.logout()
    const res = await auth.login({ username: 'admin', password: 'password123' })
    expect(res.status).toBe('2fa_required')
    expect(auth.getAuthState().authenticated).toBe(false)
  })

  it('rejects a wrong TOTP code and accepts a correct one', () => {
    expect(() => auth.verifyTwoFactor({ code: '000000' })).toThrow()
    const user = auth.verifyTwoFactor({ code: authenticator.generate(secret) })
    expect(user.username).toBe('admin')
    expect(auth.getAuthState().authenticated).toBe(true)
  })

  it('accepts a one-time recovery code, which then cannot be reused', async () => {
    auth.logout()
    await auth.login({ password: 'password123' })
    const code = recoveryCodes[0]
    const user = auth.verifyTwoFactor({ code })
    expect(user.username).toBe('admin')
    expect(twoFactor.recoveryCodesRemaining()).toBe(9)
    // reuse fails
    auth.logout()
    await auth.login({ password: 'password123' })
    expect(() => auth.verifyTwoFactor({ code })).toThrow()
    auth.verifyTwoFactor({ code: authenticator.generate(secret) }) // recover the session
  })

  it('trusting a device lets the next login skip 2FA', async () => {
    auth.logout()
    await auth.login({ password: 'password123' })
    auth.verifyTwoFactor({ code: authenticator.generate(secret), trustDevice: true })
    expect(twoFactor.status().deviceTrusted).toBe(true)

    auth.logout()
    const res = await auth.login({ password: 'password123' })
    expect(res.status).toBe('ok')
    expect(auth.getAuthState().authenticated).toBe(true)
  })

  it('a different machine (new device identity) is NOT trusted', async () => {
    // Simulate copying the data folder to another PC: the per-machine device
    // secret is gone, so a fresh identity is generated and trust does not apply.
    const deviceFile = join(userDataDir, 'device.json')
    if (existsSync(deviceFile)) unlinkSync(deviceFile)
    expect(twoFactor.isCurrentDeviceTrusted()).toBe(false)

    auth.logout()
    const res = await auth.login({ password: 'password123' })
    expect(res.status).toBe('2fa_required')
    auth.verifyTwoFactor({ code: authenticator.generate(secret) })
  })

  it('enforces the 3-authenticator limit and keeps at least one', async () => {
    // currently 1 enrolled; add two more to reach the cap
    for (const label of ['Tablet', 'Backup']) {
      const s = await twoFactor.beginEnroll(label, 'admin')
      twoFactor.confirmEnroll(s.secret, label, authenticator.generate(s.secret))
    }
    expect(twoFactor.enrolledCount()).toBe(3)
    await expect(twoFactor.beginEnroll('Extra', 'admin')).rejects.toThrow()

    // remove down toward one; removing the last must fail
    const list = twoFactor.listAuthenticators()
    twoFactor.removeAuthenticator(list[1].id)
    twoFactor.removeAuthenticator(list[2].id)
    expect(twoFactor.enrolledCount()).toBe(1)
    expect(() => twoFactor.removeAuthenticator(twoFactor.listAuthenticators()[0].id)).toThrow()
  })

  it('change-password re-encrypts and old password stops working', async () => {
    await auth.changePassword({ currentPassword: 'password123', newPassword: 'brand-new-pass-1' })
    auth.logout()
    await expect(auth.login({ password: 'password123' })).rejects.toThrow()
    const res = await auth.login({ password: 'brand-new-pass-1' })
    // device still trusted from earlier
    expect(['ok', '2fa_required']).toContain(res.status)
    auth.logout()
  })
})
