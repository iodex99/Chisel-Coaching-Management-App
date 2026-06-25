import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ExcelJS from 'exceljs'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() },
  shell: { openPath: async () => '' }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from './auth'
import * as students from './student'
import * as fees from './fee'
import * as payments from './payment'
import * as expense from './expense'
import * as accounts from './account'
import * as batch from './batch'
import * as importer from './import'
import { financialYear, financialYearRange } from './fy'
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-edge-'))
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
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* best-effort temp cleanup */ }
})

describe('financial year boundaries', () => {
  it('treats Mar 31 and Apr 1 as different years', () => {
    expect(financialYear('2026-03-31')).toBe('2025-26')
    expect(financialYear('2026-04-01')).toBe('2026-27')
    expect(financialYear('2026-12-31')).toBe('2026-27')
    expect(financialYear('2027-01-01')).toBe('2026-27')
  })
  it('returns Apr 1 .. Mar 31 ranges', () => {
    expect(financialYearRange('2026-06-15')).toEqual({ start: '2026-04-01', end: '2027-03-31' })
    expect(financialYearRange('2026-02-15')).toEqual({ start: '2025-04-01', end: '2026-03-31' })
  })
})

describe('fee plan validation & partial payment', () => {
  it('rejects a discount larger than the total', () => {
    const s = students.createStudent({ admissionNo: 'E-1', firstName: 'A', lastName: 'B', gender: 'male', status: 'active', guardians: [] })
    expect(() => fees.saveFeePlan(s.id, { name: 'P', totalAmount: 1000, discount: 2000, installments: [{ dueAmount: -1000 }] })).toThrow(/Discount/)
  })
  it('rejects installments that do not sum to the net', () => {
    const s = students.createStudent({ admissionNo: 'E-2', firstName: 'A', lastName: 'B', gender: 'male', status: 'active', guardians: [] })
    expect(() => fees.saveFeePlan(s.id, { name: 'P', totalAmount: 1000, discount: 0, installments: [{ dueAmount: 400 }] })).toThrow(/add up/)
  })
  it('marks an installment partial after a partial allocation', () => {
    const s = students.createStudent({ admissionNo: 'E-3', firstName: 'A', lastName: 'B', gender: 'male', status: 'active', guardians: [] })
    const plan = fees.saveFeePlan(s.id, { name: 'P', totalAmount: 100000, discount: 0, installments: [{ dueAmount: 100000, dueDate: '2999-01-01' }] })
    payments.recordPayment({ studentId: s.id, amount: 40000, paymentDate: '2026-06-01', mode: 'cash', allocations: [{ installmentId: plan.installments[0].id, amount: 40000 }] })
    const after = fees.getFeePlan(s.id)!
    expect(after.installments[0].status).toBe('partial')
    expect(after.totals.outstanding).toBe(60000)
  })
})

describe('payments edge cases', () => {
  it('rejects allocations greater than the payment amount', () => {
    const s = students.createStudent({ admissionNo: 'E-4', firstName: 'A', lastName: 'B', gender: 'male', status: 'active', guardians: [] })
    const plan = fees.saveFeePlan(s.id, { name: 'P', totalAmount: 100000, discount: 0, installments: [{ dueAmount: 100000, dueDate: '2999-01-01' }] })
    expect(() =>
      payments.recordPayment({ studentId: s.id, amount: 10000, paymentDate: '2026-06-01', mode: 'cash', allocations: [{ installmentId: plan.installments[0].id, amount: 50000 }] })
    ).toThrow(/exceed/)
  })
  it('allows an advance (unallocated) payment', () => {
    const s = students.createStudent({ admissionNo: 'E-5', firstName: 'A', lastName: 'B', gender: 'male', status: 'active', guardians: [] })
    const p = payments.recordPayment({ studentId: s.id, amount: 25000, paymentDate: '2026-06-01', mode: 'cash' })
    expect(p.amount).toBe(25000)
    expect(p.allocations).toHaveLength(0)
  })
  it('resets the receipt sequence per financial year', () => {
    const s = students.createStudent({ admissionNo: 'E-6', firstName: 'A', lastName: 'B', gender: 'male', status: 'active', guardians: [] })
    const a = payments.recordPayment({ studentId: s.id, amount: 100, paymentDate: '2030-06-01', mode: 'cash' })
    const b = payments.recordPayment({ studentId: s.id, amount: 100, paymentDate: '2031-06-01', mode: 'cash' })
    expect(a.receiptNo).toBe('CHISEL/2030-31/0001')
    expect(b.receiptNo).toBe('CHISEL/2031-32/0001')
  })
})

describe('account per-vendor limit boundary', () => {
  it('allows exactly the limit but blocks one paise more', () => {
    const acct = accounts.createAccount({
      name: 'Capped2', type: 'bank', openingBalance: 0, isActive: true,
      vendorFyLimits: [{ fy: '2029-30', limit: 100000 }]
    })
    const v = expense.createVendor({ name: 'V2' })
    const cat = expense.listCategories()[0] ?? expense.createCategory('Misc')
    expense.createExpense({ expenseDate: '2029-06-01', categoryId: cat.id, vendorId: v.id, accountId: acct.id, amount: 100000, mode: 'cash' })
    expect(() =>
      expense.createExpense({ expenseDate: '2029-06-01', categoryId: cat.id, vendorId: v.id, accountId: acct.id, amount: 1, mode: 'cash' })
    ).toThrow(/exceeds/)
  })
})

describe('import robustness', () => {
  async function sheet(name: string, header: string[], rows: string[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(name)
    ws.addRow(header)
    rows.forEach((r) => ws.addRow(r))
    return Buffer.from(await wb.xlsx.writeBuffer())
  }
  const stuHeader = ['Admission No', 'Admission Date (DD-MM-YYYY)', 'First Name', 'Last Name', 'Gender', 'Phone', 'Email', 'Batch', 'Status', 'Guardian Name', 'Guardian Relation', 'Guardian Phone']

  it('imports nothing from a header-only sheet', async () => {
    const res = await importer.importStudents(await sheet('Students', stuHeader, []))
    expect(res.imported).toBe(0)
    expect(res.errors).toHaveLength(0)
  })
  it('throws when the required columns are absent', async () => {
    await expect(importer.importStudents(await sheet('Students', ['Nope', 'Other'], [['x', 'y']]))).rejects.toThrow(/columns/)
  })
  it('reports a row whose date is unparseable', async () => {
    const res = await importer.importStudents(await sheet('Students', stuHeader, [['I-1', 'not-a-date', 'N', 'L', 'male']]))
    expect(res.imported).toBe(0)
    expect(res.errors[0].message).toMatch(/Admission Date/)
  })
  it('accepts dd/mm/yyyy as well as dd-mm-yyyy', async () => {
    const res = await importer.importStudents(await sheet('Students', stuHeader, [['I-2', '15/08/2026', 'N', 'L', 'male']]))
    expect(res.imported).toBe(1)
    expect(students.getStudent(students.listStudents({ search: 'I-2' })[0]?.id ?? 0)?.admissionDate).toBe('2026-08-15')
  })
  it('rejects an impossible calendar date (Feb 31)', async () => {
    const res = await importer.importStudents(await sheet('Students', stuHeader, [['I-3', '31-02-2026', 'N', 'L', 'male']]))
    expect(res.imported).toBe(0)
    expect(res.errors[0].message).toMatch(/Admission Date/)
  })

  async function feeSheet(rows: (string | number)[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Fees')
    ws.addRow(['Admission No', 'Plan Name', 'Total Fee', 'Discount', 'Installments', 'First Due Date (DD-MM-YYYY)'])
    rows.forEach((r) => ws.addRow(r))
    return Buffer.from(await wb.xlsx.writeBuffer())
  }

  it('clamps month-end installment due dates (Jan 31 → Feb 28)', async () => {
    const s = students.createStudent({ admissionNo: 'FD-1', firstName: 'M', lastName: 'E', gender: 'male', status: 'active', guardians: [] })
    const res = await importer.importFees(await feeSheet([['FD-1', 'Annual', 1000, 0, 2, '31-01-2026']]))
    expect(res.imported).toBe(1)
    const plan = fees.getFeePlan(s.id)!
    expect(plan.installments[0].dueDate).toBe('2026-01-31')
    expect(plan.installments[1].dueDate).toBe('2026-02-28') // not 2026-03-03
  })
  it('rejects a negative discount and a present-but-invalid first due date in fee import', async () => {
    students.createStudent({ admissionNo: 'FD-2', firstName: 'M', lastName: 'E', gender: 'male', status: 'active', guardians: [] })
    const negative = await importer.importFees(await feeSheet([['FD-2', 'P', 1000, -50, 1, '01-04-2026']]))
    expect(negative.imported).toBe(0)
    expect(negative.errors[0].message).toMatch(/Discount/)
    const badDate = await importer.importFees(await feeSheet([['FD-2', 'P', 1000, 0, 1, 'garbage']]))
    expect(badDate.errors[0].message).toMatch(/First Due Date/)
  })
  it('pulls the base fee from the course/batch when Total Fee is blank', async () => {
    const b = batch.createBatch({ name: 'NEET-FD', courseName: 'NEET', defaultFee: 5000000, status: 'active' })
    const s = students.createStudent({ admissionNo: 'FD-3', firstName: 'M', lastName: 'E', gender: 'male', status: 'active', batchId: b.id, guardians: [] })
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Fees')
    ws.addRow(['Admission No', 'Course / Batch', 'Total Fee (optional)', 'Discount', 'Installments', 'First Due Date (DD-MM-YYYY)'])
    ws.addRow(['FD-3', 'NEET-FD', '', 1000, 1, '01-04-2026']) // blank total → use batch base fee ₹50,000
    const res = await importer.importFees(Buffer.from(await wb.xlsx.writeBuffer()))
    expect(res.imported).toBe(1)
    const plan = fees.getFeePlan(s.id)!
    expect(plan.totalAmount).toBe(5000000)
    expect(plan.netAmount).toBe(4900000) // 50,000 base − 1,000 discount
  })
})

describe('service guards', () => {
  it('rejects a fee plan with a non-positive total', () => {
    const s = students.createStudent({ admissionNo: 'G-1', firstName: 'A', lastName: 'B', gender: 'male', status: 'active', guardians: [] })
    expect(() => fees.saveFeePlan(s.id, { name: 'P', totalAmount: 0, discount: 0, installments: [{ dueAmount: 0 }] })).toThrow(/greater than zero/)
  })
  it('refuses to update an expense to a non-positive amount', () => {
    const cat = expense.listCategories()[0] ?? expense.createCategory('Sundry')
    const e = expense.createExpense({ expenseDate: '2026-06-01', categoryId: cat.id, amount: 5000, mode: 'cash' })
    expect(() => expense.updateExpense(e.id, { expenseDate: '2026-06-01', categoryId: cat.id, amount: 0, mode: 'cash' })).toThrow(/greater than zero/)
  })
  it('blocks deleting an account that has a linked expense', () => {
    const acct = accounts.createAccount({ name: 'Linked', type: 'bank', openingBalance: 0, isActive: true })
    const cat = expense.listCategories()[0] ?? expense.createCategory('Sundry')
    expense.createExpense({ expenseDate: '2026-06-01', categoryId: cat.id, amount: 1000, mode: 'bank_transfer', accountId: acct.id })
    expect(() => accounts.deleteAccount(acct.id)).toThrow(/linked/)
  })
})
