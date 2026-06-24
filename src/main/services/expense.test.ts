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
import * as expense from './expense'
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-exp-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'password123' })
})

afterAll(() => {
  delete process.env.CHISEL_DATA_DIR
  rmSync(dataDir, { recursive: true, force: true })
})

describe('expenses', () => {
  it('ships starter categories and supports adding/removing', () => {
    expect(expense.listCategories().length).toBeGreaterThanOrEqual(6)
    const c = expense.createCategory('Books')
    expect(c.name).toBe('Books')
    expect(() => expense.createCategory('Books')).toThrow(/already exists/)
    expense.deleteCategory(c.id)
    expect(expense.listCategories().some((x) => x.name === 'Books')).toBe(false)
  })

  it('records, filters and summarises expenses, and guards category deletion', () => {
    const cat = expense.listCategories()[0]
    const vendor = expense.createVendor({ name: 'Acme Supplies', contact: '99999' })

    expense.createExpense({ expenseDate: '2026-06-01', categoryId: cat.id, vendorId: vendor.id, amount: 30000, mode: 'cash' })
    expense.createExpense({ expenseDate: '2026-06-05', categoryId: cat.id, payee: 'Local shop', amount: 20000, mode: 'upi' })

    expect(expense.listExpenses().length).toBe(2)
    expect(expense.listExpenses({ search: 'Acme' }).length).toBe(1)
    expect(expense.listExpenses({ categoryId: cat.id }).length).toBe(2)

    const summary = expense.getExpenseSummary()
    expect(summary.allTimeTotal).toBe(50000)
    expect(summary.byCategory[0].total).toBe(50000)
    expect(summary.trend).toHaveLength(6)

    expect(() => expense.deleteCategory(cat.id)).toThrow(/used by expenses/)
    expect(() => expense.deleteVendor(vendor.id)).toThrow(/used by expenses/)
  })

  it('updates and deletes an expense', () => {
    const e = expense.listExpenses()[0]
    const updated = expense.updateExpense(e.id, { expenseDate: e.expenseDate, amount: 35000, mode: 'cash' })
    expect(updated.amount).toBe(35000)
    expense.deleteExpense(e.id)
    expect(expense.listExpenses().length).toBe(1)
  })
})
