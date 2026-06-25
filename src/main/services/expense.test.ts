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
import * as accounts from './account'
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
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
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

  it('enforces the per-vendor FY limit on the paying account', () => {
    const acct = accounts.createAccount({ name: 'Capped', type: 'bank', openingBalance: 0, isActive: true, vendorFyLimit: 100000 })
    const v = expense.createVendor({ name: 'LimitVendor' })
    const cat = expense.listCategories()[0]
    const base = { categoryId: cat.id, vendorId: v.id, accountId: acct.id, mode: 'bank_transfer' as const }

    expense.createExpense({ ...base, expenseDate: '2026-05-01', amount: 60000 })
    const info = expense.vendorLimitInfo(acct.id, v.id, '2026-06-01')
    expect(info.limit).toBe(100000)
    expect(info.spent).toBe(60000)
    expect(info.remaining).toBe(40000)

    // Exceeding the remaining ₹400 is blocked.
    expect(() => expense.createExpense({ ...base, expenseDate: '2026-06-01', amount: 50000 })).toThrow(/exceeds the per-vendor limit/)

    // Exactly filling the remaining is allowed.
    expense.createExpense({ ...base, expenseDate: '2026-06-01', amount: 40000 })
    expect(expense.vendorLimitInfo(acct.id, v.id, '2026-06-01').remaining).toBe(0)

    // The next financial year starts fresh.
    expect(expense.vendorLimitInfo(acct.id, v.id, '2027-05-01').spent).toBe(0)

    // An account with no limit (0) is never capped.
    const free = accounts.createAccount({ name: 'Free', type: 'cash', openingBalance: 0, isActive: true, vendorFyLimit: 0 })
    expect(() =>
      expense.createExpense({ categoryId: cat.id, vendorId: v.id, accountId: free.id, mode: 'cash', expenseDate: '2026-06-01', amount: 9_999_999 })
    ).not.toThrow()
  })

  it('uses a per-financial-year override when configured, else the default', () => {
    const acct = accounts.createAccount({
      name: 'Yearly',
      type: 'bank',
      openingBalance: 0,
      isActive: true,
      vendorFyLimit: 100000, // default ₹1000
      vendorFyLimits: [{ fy: '2026-27', limit: 50000 }] // FY 2026-27 capped at ₹500
    })
    const v = expense.createVendor({ name: 'YearVendor' })
    const cat = expense.listCategories()[0]
    const base = { categoryId: cat.id, vendorId: v.id, accountId: acct.id, mode: 'cash' as const }

    expect(expense.vendorLimitInfo(acct.id, v.id, '2026-06-01').limit).toBe(50000)
    expect(() => expense.createExpense({ ...base, expenseDate: '2026-05-01', amount: 60000 })).toThrow(/exceeds/)
    expense.createExpense({ ...base, expenseDate: '2026-05-01', amount: 50000 })

    // The next FY has no override → falls back to the ₹1000 default.
    expect(expense.vendorLimitInfo(acct.id, v.id, '2027-05-01').limit).toBe(100000)
    expect(() => expense.createExpense({ ...base, expenseDate: '2027-05-01', amount: 90000 })).not.toThrow()
  })
})
