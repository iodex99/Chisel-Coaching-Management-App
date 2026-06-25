import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() },
  shell: { openPath: async () => '' }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from './auth'
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-authedge-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'password123' })
})

afterAll(async () => {
  const __db = await import("../db/database")
  if (__db.isOpen()) {
    await __db.flushCurrent()
    __db.closeDatabase()
  }
  delete process.env.CHISEL_DATA_DIR
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

describe('login lockout', () => {
  it('locks the account after 5 wrong passwords, refusing even the right one', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(auth.login({ password: 'wrong' })).rejects.toThrow(/Incorrect/)
    }
    expect(auth.getAuthState().locked).toBe(true)
    await expect(auth.login({ password: 'password123' })).rejects.toThrow(/failed attempts/i)
  })
})
