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
import * as students from './student'
import * as backup from './backup'
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-rekey-'))
  userDataDir = mkdtempSync(join(tmpdir(), 'chisel-rekey-ud-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'oldpass123' })
  // 2FA is mandatory — enroll an authenticator to reach an authenticated session.
  const start = await twoFactor.beginEnroll(undefined, 'admin')
  twoFactor.confirmEnroll(start.secret, 'Test', authenticator.generate(start.secret))
  auth.noteEnrollment()
})

afterAll(async () => {
  const __db = await import("../db/database")
  if (__db.isOpen()) {
    await __db.flushCurrent()
    __db.closeDatabase()
  }
  delete process.env.CHISEL_DATA_DIR
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

describe('backup carries its own key (survives a password change)', () => {
  it('a backup taken before a password change opens only with the OLD password', async () => {
    expect(auth.getAuthState().authenticated).toBe(true)
    students.createStudent({ admissionNo: 'B-1', firstName: 'Before', lastName: 'Change', gender: 'male', status: 'active', guardians: [] })
    const snap = await backup.createBackup('manual')

    await auth.changePassword({ currentPassword: 'oldpass123', newPassword: 'newpass456' })
    students.createStudent({ admissionNo: 'B-2', firstName: 'After', lastName: 'Change', gender: 'female', status: 'active', guardians: [] })
    expect(students.listStudents({ status: 'all' })).toHaveLength(2)

    await backup.restoreBackup(snap.name)
    // The restored keyfile is the OLD one → the new password must fail, the old must work.
    await expect(auth.login({ password: 'newpass456' })).rejects.toThrow(/Incorrect/)
    await auth.login({ password: 'oldpass123' })
    expect(students.listStudents({ status: 'all' })).toHaveLength(1)
  })
})
