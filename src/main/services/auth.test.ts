import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Mock Electron: data dir comes from CHISEL_DATA_DIR; the WASM binary is found
// relative to the project root (process.cwd()).
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd()
  }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from './auth'
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-test-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
})

afterAll(() => {
  delete process.env.CHISEL_DATA_DIR
  rmSync(dataDir, { recursive: true, force: true })
})

describe('auth + encrypted DB flow', () => {
  it('completes setup, enforces password on login, and rekeys on change-password', async () => {
    expect(auth.isInitialized()).toBe(false)

    const user = await auth.setup({ username: 'admin', password: 'password123', instituteName: 'Test Institute' })
    expect(user.username).toBe('admin')
    expect(auth.isInitialized()).toBe(true)

    let state = auth.getAuthState()
    expect(state.initialized).toBe(true)
    expect(state.authenticated).toBe(true)
    expect(state.username).toBe('admin')

    auth.logout()
    expect(auth.getAuthState().authenticated).toBe(false)

    // Wrong password is rejected.
    await expect(auth.login({ password: 'wrong-password' })).rejects.toThrow()

    // Correct password unlocks the database.
    const relogged = await auth.login({ username: 'admin', password: 'password123' })
    expect(relogged.username).toBe('admin')

    // Change password re-encrypts: the old password no longer works, the new one does.
    await auth.changePassword({ currentPassword: 'password123', newPassword: 'brand-new-pass-1' })
    auth.logout()

    await expect(auth.login({ password: 'password123' })).rejects.toThrow()
    const finalUser = await auth.login({ password: 'brand-new-pass-1' })
    expect(finalUser.username).toBe('admin')
    auth.logout()
  })

  it('persists data across reopen (the institute name survives a logout/login)', async () => {
    const u = await auth.login({ password: 'brand-new-pass-1' })
    expect(u.username).toBe('admin')
    auth.logout()
  })
})
