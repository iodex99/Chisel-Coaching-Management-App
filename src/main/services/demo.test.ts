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
import * as demo from './demo'
import * as students from './student'
import * as fees from './fee'
import * as dashboard from './dashboard'
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-demo-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'password123' })
})

afterAll(async () => {
  const db = await import('../db/database')
  if (db.isOpen()) {
    await db.flushCurrent()
    db.closeDatabase()
  }
  delete process.env.CHISEL_DATA_DIR
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    /* best-effort temp cleanup */
  }
})

describe('demo data seeding', () => {
  it('seeds a full, varied dataset and refuses to double-seed', async () => {
    const r1 = await demo.seedDemoData()
    expect(r1.added).toBe(true)

    expect(students.listStudents({ status: 'all' })).toHaveLength(14)
    expect(students.listStudents({ status: 'active' }).length).toBeGreaterThan(8)
    // A mix of statuses exists.
    expect(students.listStudents({ status: 'inactive' }).length).toBeGreaterThan(0)
    expect(students.listStudents({ status: 'completed' }).length).toBeGreaterThan(0)

    // Fee plans exist for most students (two are intentionally left without one).
    expect(fees.listFeeSummaries().length).toBeGreaterThanOrEqual(10)

    const dash = dashboard.getDashboard()
    expect(dash.totalOutstanding).toBeGreaterThan(0)
    expect(dash.monthCollection).toBeGreaterThan(0) // an advance payment is dated today
    expect(dash.overdueStudents).toBeGreaterThan(0)
    expect(dash.recentPayments.length).toBeGreaterThan(0)

    // Second run is a no-op.
    const r2 = await demo.seedDemoData()
    expect(r2.added).toBe(false)
    expect(students.listStudents({ status: 'all' })).toHaveLength(14)
  })
})
