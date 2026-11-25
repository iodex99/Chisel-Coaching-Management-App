import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from './auth'
import { setupTestAuth, testLogin } from './testAuth'
import * as students from './student'
import * as backup from './backup'
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-backup-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await setupTestAuth()
})

afterAll(async () => {
  const __db = await import("../db/database")
  if (__db.isOpen()) {
    await __db.flushCurrent()
    __db.closeDatabase()
  }
  delete process.env.CHISEL_DATA_DIR
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* best-effort temp cleanup */ }
})

describe('backup & restore', () => {
  it('creates a backup, then restore rolls back to that snapshot', async () => {
    students.createStudent({ admissionNo: 'B-1', firstName: 'Before', status: 'active', guardians: [] })
    const snapshot = await backup.createBackup('manual')
    expect(backup.listBackups().some((b) => b.name === snapshot.name)).toBe(true)

    // Change data after the snapshot.
    students.createStudent({ admissionNo: 'B-2', firstName: 'After', status: 'active', guardians: [] })
    expect(students.listStudents().length).toBe(2)

    // Restore drops the live session; re-login to read the restored DB.
    await backup.restoreBackup(snapshot.name)
    expect(auth.getAuthState().authenticated).toBe(false)

    await testLogin()
    const list = students.listStudents()
    expect(list.length).toBe(1)
    expect(list[0].admissionNo).toBe('B-1')
  })

  it('toggles auto-backup and deletes a backup', () => {
    expect(backup.getAutoBackup()).toBe(true)
    backup.setAutoBackup(false)
    expect(backup.getAutoBackup()).toBe(false)
    backup.setAutoBackup(true)

    const all = backup.listBackups()
    const target = all[0]
    backup.deleteBackup(target.name)
    expect(backup.listBackups().some((b) => b.name === target.name)).toBe(false)
  })
})
