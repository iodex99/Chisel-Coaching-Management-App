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
import * as payments from './payment'
import * as expense from './expense'
import * as report from './report'
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-report-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'password123' })
  const s = students.createStudent({ admissionNo: 'R-1', firstName: 'Ravi', status: 'active', guardians: [] })
  const plan = fees.saveFeePlan(s.id, { name: 'Fee', totalAmount: 100000, discount: 0, installments: [{ dueAmount: 100000, dueDate: '2026-05-01' }] })
  payments.recordPayment({
    studentId: s.id,
    amount: 60000,
    paymentDate: '2026-06-10',
    mode: 'cash',
    allocations: [{ installmentId: plan.installments[0].id, amount: 60000 }]
  })
  const cat = expense.listCategories()[0]
  expense.createExpense({ expenseDate: '2026-06-12', categoryId: cat.id, amount: 25000, mode: 'cash' })
})

afterAll(() => {
  delete process.env.CHISEL_DATA_DIR
  rmSync(dataDir, { recursive: true, force: true })
})

describe('reports', () => {
  it('collection-by-student totals match', () => {
    const r = report.getReport('collection-by-student')
    expect(r.rows).toHaveLength(1)
    expect(r.totals?.amount).toBe(60000)
  })

  it('outstanding shows the unpaid balance', () => {
    const r = report.getReport('outstanding')
    expect(r.totals?.outstanding).toBe(40000)
  })

  it('collection-by-mode groups by mode', () => {
    const r = report.getReport('collection-by-mode')
    expect(r.rows[0].mode).toBe('Cash')
    expect(r.totals?.amount).toBe(60000)
  })

  it('expense-by-category totals match', () => {
    const r = report.getReport('expense-by-category')
    expect(r.totals?.amount).toBe(25000)
  })

  it('respects a date range that excludes the data', () => {
    const r = report.getReport('collection-by-date', { from: '2020-01-01', to: '2020-12-31' })
    expect(r.rows).toHaveLength(0)
  })
})
