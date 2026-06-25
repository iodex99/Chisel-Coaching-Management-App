import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { authenticator } from 'otplib'

let userDataDir: string

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd())
  },
  shell: { openPath: async () => '' }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from './auth'
import * as twoFactor from './twoFactor'
import { ensureDataDirs } from '../paths'

let dataDir: string
let secret = ''

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-2fa-'))
  userDataDir = mkdtempSync(join(tmpdir(), 'chisel-2fa-ud-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'password123' })
  const start = await twoFactor.beginEnroll(undefined, 'admin')
  secret = start.secret
  twoFactor.confirmEnroll(secret, 'Test', authenticator.generate(secret))
  auth.noteEnrollment()
})

afterAll(() => {
  delete process.env.CHISEL_DATA_DIR
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

describe('2FA gate attempt limiting', () => {
  it('drops the session after 5 wrong codes, then a correct login still works', async () => {
    auth.logout()
    const res = await auth.login({ password: 'password123' })
    expect(res.status).toBe('2fa_required')

    for (let i = 0; i < 4; i++) {
      expect(() => auth.verifyTwoFactor({ code: '000000' })).toThrow(/Invalid authentication code/)
    }
    // 5th wrong code drops the session entirely.
    expect(() => auth.verifyTwoFactor({ code: '000000' })).toThrow(/sign in again/i)
    expect(auth.getAuthState().authenticated).toBe(false)
    expect(auth.getAuthState().stage).toBe(null)

    // A fresh login with the right code still succeeds.
    await auth.login({ password: 'password123' })
    const user = auth.verifyTwoFactor({ code: authenticator.generate(secret) })
    expect(user.username).toBe('admin')
    expect(auth.getAuthState().authenticated).toBe(true)
  })
})
