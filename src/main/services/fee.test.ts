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
import * as students from './student'
import * as fees from './fee'
import { ensureDataDirs } from '../paths'

let dataDir: string
let studentId: number

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-fee-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'password123' })
  studentId = students.createStudent({ admissionNo: 'F-1', firstName: 'Fee', status: 'active', guardians: [] }).id
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

describe('fee plans', () => {
  it('rejects installments that do not sum to the net fee', () => {
    expect(() =>
      fees.saveFeePlan(studentId, {
        name: 'Annual',
        totalAmount: 100000,
        discount: 0,
        installments: [{ dueAmount: 40000 }]
      })
    ).toThrow(/must add up/)
  })

  it('saves a plan and reports outstanding = net when nothing is paid', () => {
    const plan = fees.saveFeePlan(studentId, {
      name: 'Annual',
      totalAmount: 100000, // ₹1000
      discount: 20000, // ₹200
      installments: [
        { label: 'First', dueAmount: 40000, dueDate: '2020-01-01' }, // past → overdue
        { label: 'Second', dueAmount: 40000, dueDate: '2999-01-01' } // future → pending
      ]
    })
    expect(plan.netAmount).toBe(80000)
    expect(plan.totals.outstanding).toBe(80000)
    expect(plan.totals.paid).toBe(0)
    expect(plan.installments[0].status).toBe('overdue')
    expect(plan.installments[1].status).toBe('pending')
  })

  it('lists fee summaries with overdue counts', () => {
    const summaries = fees.listFeeSummaries()
    const mine = summaries.find((s) => s.studentId === studentId)
    expect(mine).toBeDefined()
    expect(mine?.net).toBe(80000)
    expect(mine?.outstanding).toBe(80000)
    expect(mine?.overdueCount).toBe(1)
  })

  it('replaces the plan when re-saved (no payments yet)', () => {
    const plan = fees.saveFeePlan(studentId, {
      name: 'Revised',
      totalAmount: 50000,
      discount: 0,
      installments: [{ dueAmount: 50000, dueDate: '2999-01-01' }]
    })
    expect(plan.name).toBe('Revised')
    expect(plan.installments).toHaveLength(1)
    expect(fees.getFeePlan(studentId)?.netAmount).toBe(50000)
  })
})
