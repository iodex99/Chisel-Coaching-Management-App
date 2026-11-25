import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
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
import { setupTestAuth, testLogin } from './testAuth'
import * as accounts from './account'
import * as batch from './batch'
import * as students from './student'
import * as fees from './fee'
import * as payments from './payment'
import * as expense from './expense'
import * as dashboard from './dashboard'
import * as report from './report'
import * as backup from './backup'
import * as importer from './import'
import { todayISO, financialYear } from './fy'
import { ensureDataDirs } from '../paths'

let dataDir: string
const today = todayISO()
const fy = financialYear(today)

// A date in the past / future for overdue / upcoming tests.
function offsetDays(days: number): string {
  const d = new Date(today + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-intg-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await setupTestAuth('Chisel')
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

async function studentsXlsx(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Students')
  ws.addRow([
    'Admission No', 'Admission Date (DD-MM-YYYY)', 'First Name', 'Last Name', 'Gender',
    'Phone', 'Email', 'Batch', 'Status', 'Guardian Name', 'Guardian Relation', 'Guardian Phone'
  ])
  rows.forEach((r) => ws.addRow(r))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe('full dummy-data scenario', () => {
  it('runs admissions → fees → payments → expenses and reconciles everywhere', async () => {
    // --- Accounts (one capped per vendor for this FY) ---
    const cash = accounts.createAccount({ name: 'Cash', type: 'cash', openingBalance: 0, isActive: true })
    const hdfc = accounts.createAccount({
      name: 'HDFC', type: 'bank', openingBalance: 0, isActive: true,
      vendorFyLimit: 0, vendorFyLimits: [{ fy, limit: 5000000 }] // ₹50,000 this FY
    })

    // --- Batches ---
    const neet = batch.createBatch({ name: 'NEET', defaultFee: 0, status: 'active' })
    batch.createBatch({ name: 'JEE', defaultFee: 0, status: 'active' })

    // --- Bulk upload students (mimic a real .xlsx import) ---
    const imp = await importer.importStudents(
      await studentsXlsx([
        ['A-1', '01-04-2026', 'Asha', 'Verma', 'female', '9000000001', '', 'NEET', 'active', 'Ramesh', 'Father', '9'],
        ['A-2', '01-04-2026', 'Bilal', 'Khan', 'male', '9000000002', '', 'JEE', 'active', '', '', ''],
        ['A-3', '01-04-2026', 'Chitra', 'Rao', 'female', '', '', 'NEET', 'active', 'Sita', 'Mother', '8'],
        ['A-4', '01-04-2026', 'Bad', '', 'male', '', '', 'NEET', 'active', '', '', ''] // missing last name → skipped
      ])
    )
    expect(imp.imported).toBe(3)
    expect(imp.errors).toHaveLength(1)
    const all = students.listStudents({ status: 'all' })
    expect(all).toHaveLength(3)
    const asha = all.find((s) => s.admissionNo === 'A-1')!
    expect(students.getStudent(asha.id)?.guardians).toHaveLength(1)
    expect(neet.id).toBeGreaterThan(0)

    // --- Fee plans: one manual, one via import ---
    fees.saveFeePlan(asha.id, {
      name: 'Annual', totalAmount: 10000000, discount: 0, // ₹1,00,000
      installments: [
        { label: 'I1', dueAmount: 5000000, dueDate: offsetDays(-10) }, // overdue
        { label: 'I2', dueAmount: 5000000, dueDate: offsetDays(20) } // upcoming
      ]
    })
    const feeWb = new ExcelJS.Workbook()
    const fws = feeWb.addWorksheet('Fees')
    fws.addRow(['Admission No', 'Plan Name', 'Total Fee', 'Discount', 'Installments', 'First Due Date (DD-MM-YYYY)'])
    fws.addRow(['A-2', 'Annual', 60000, 0, 2, '01-04-2026'])
    const feeImp = await importer.importFees(Buffer.from(await feeWb.xlsx.writeBuffer()))
    expect(feeImp.imported).toBe(1)

    // --- Payments (dated today so they count this month) ---
    const plan = fees.getFeePlan(asha.id)!
    const p1 = payments.recordPayment({
      studentId: asha.id, amount: 3000000, paymentDate: today, mode: 'upi',
      allocations: [{ installmentId: plan.installments[0].id, amount: 3000000 }]
    })
    expect(p1.receiptNo).toContain(fy)
    payments.recordPayment({ studentId: asha.id, amount: 1000000, paymentDate: today, mode: 'cash' }) // advance/unallocated
    const cancelled = payments.recordPayment({ studentId: asha.id, amount: 500000, paymentDate: today, mode: 'cash' })
    payments.cancelPayment(cancelled.id, 'test')

    // Receipt numbers are sequential.
    expect(payments.listPayments({ studentId: asha.id }).length).toBe(2) // cancelled excluded

    // --- Expenses (incl. a capped vendor) ---
    const cat = expense.listCategories()[0] ?? expense.createCategory('Rent')
    const vendor = expense.createVendor({ name: 'Landlord' })
    expense.createExpense({ expenseDate: today, categoryId: cat.id, amount: 2000000, mode: 'bank_transfer', accountId: hdfc.id, vendorId: vendor.id })
    expect(() =>
      expense.createExpense({ expenseDate: today, categoryId: cat.id, amount: 4000000, mode: 'bank_transfer', accountId: hdfc.id, vendorId: vendor.id })
    ).toThrow(/exceeds/) // ₹20,000 + ₹40,000 > ₹50,000 limit
    expense.createExpense({ expenseDate: today, categoryId: cat.id, amount: 500000, mode: 'cash', accountId: cash.id })

    // --- Reconcile: fee summaries ---
    const summaries = fees.listFeeSummaries()
    const ashaSummary = summaries.find((s) => s.studentId === asha.id)!
    expect(ashaSummary.net).toBe(10000000)
    expect(ashaSummary.paid).toBe(3000000) // only the allocated payment counts toward installments
    expect(ashaSummary.outstanding).toBe(7000000)
    expect(ashaSummary.overdueCount).toBe(1)

    // --- Dashboard ---
    const dash = dashboard.getDashboard()
    expect(dash.todayCollection).toBe(4000000) // 30k + 10k (cancelled 5k excluded)
    expect(dash.monthCollection).toBe(4000000)
    expect(dash.monthExpenses).toBe(2500000) // 20k + 5k
    expect(dash.monthNet).toBe(1500000)
    expect(dash.recentPayments.length).toBe(2)
    expect(dash.overdueStudents).toBeGreaterThanOrEqual(1)

    // --- Due lists ---
    expect(dashboard.listOverdue().some((d) => d.studentId === asha.id)).toBe(true)
    expect(dashboard.listUpcoming(30).some((d) => d.studentId === asha.id)).toBe(true)

    // --- Reports ---
    const byStudent = report.getReport('collection-by-student')
    expect(byStudent.totals?.amount).toBe(4000000)
    const outstanding = report.getReport('outstanding')
    expect(Number(outstanding.totals?.outstanding)).toBeGreaterThan(0)
    const byCat = report.getReport('expense-by-category')
    expect(byCat.totals?.amount).toBe(2500000)
    const byMode = report.getReport('collection-by-mode')
    expect(byMode.totals?.amount).toBe(4000000)

    // --- Excel export produces a real file ---
    const xlsxPath = await report.exportReportExcel('collection-by-student')
    expect(existsSync(xlsxPath)).toBe(true)
  })

  it('backup → restore round-trips the whole dataset', async () => {
    const before = students.listStudents({ status: 'all' }).length
    const snap = await backup.createBackup('manual')

    // Mutate after the snapshot.
    students.createStudent({ admissionNo: 'Z-9', firstName: 'Temp', lastName: 'X', gender: 'other', status: 'active', guardians: [] })
    expect(students.listStudents({ status: 'all' }).length).toBe(before + 1)

    await backup.restoreBackup(snap.name)
    expect(auth.getAuthState().authenticated).toBe(false)
    await testLogin()
    expect(students.listStudents({ status: 'all' }).length).toBe(before) // Z-9 rolled back
  })
})
