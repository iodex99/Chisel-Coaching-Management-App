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
import * as accounts from './account'
import * as batch from './batch'
import * as school from './school'
import * as students from './student'
import * as fees from './fee'
import * as payments from './payment'
import * as expense from './expense'
import * as pdc from './pdc'
import * as report from './report'
import { getReceiptData } from './payment'
import { renderReceiptHtml } from './receipt'
import { todayISO } from './fy'
import { ensureDataDirs } from '../paths'

let dataDir: string
const today = todayISO()
function dayOffset(n: number): string {
  const d = new Date(today + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-newfeat-'))
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
    /* best-effort */
  }
})

describe('school master', () => {
  it('creates, counts students, and guards deletion', () => {
    const s = school.createSchool({ name: 'St. Xavier', area: 'Downtown', isActive: true })
    expect(school.listSchools().find((x) => x.id === s.id)?.studentCount).toBe(0)

    const stu = students.createStudent({ admissionNo: 'SCH-1', firstName: 'A', lastName: 'B', gender: 'male', status: 'active', schoolId: s.id, guardians: [] })
    expect(school.listSchools().find((x) => x.id === s.id)?.studentCount).toBe(1)
    expect(students.getStudent(stu.id)?.schoolName).toBe('St. Xavier')
    // Students can be filtered by school.
    expect(students.listStudents({ schoolId: s.id, status: 'all' }).map((x) => x.admissionNo)).toEqual(['SCH-1'])

    expect(() => school.deleteSchool(s.id)).toThrow(/still has students/)
    students.deleteStudent(stu.id)
    school.deleteSchool(s.id)
    expect(school.listSchools().some((x) => x.id === s.id)).toBe(false)
  })
})

describe('post-dated cheques', () => {
  it('records, reminds when due, and updates status', () => {
    const s = students.createStudent({ admissionNo: 'PDC-S1', firstName: 'Cheque', lastName: 'Payer', gender: 'male', status: 'active', guardians: [] })
    const overdue = pdc.createPdc({ studentId: s.id, amount: 20000, chequeNo: '111', bank: 'HDFC', depositDate: dayOffset(-1) })
    pdc.createPdc({ studentId: s.id, amount: 30000, chequeNo: '222', bank: 'SBI', depositDate: dayOffset(3) }) // within 7d window
    pdc.createPdc({ studentId: s.id, amount: 40000, chequeNo: '333', bank: 'ICICI', depositDate: dayOffset(60) }) // far off

    expect(overdue.studentName).toBe('Cheque Payer') // snapshot
    // Due summary counts only those whose date has arrived (<= today).
    const summary = pdc.pdcDueSummary()
    expect(summary.count).toBe(1)
    expect(summary.amount).toBe(20000)
    // The reminder window (7 days) includes overdue + soon, not the far-off one.
    expect(pdc.listPdcDue(7).length).toBe(2)

    pdc.setPdcStatus(overdue.id, 'deposited')
    expect(pdc.pdcDueSummary().count).toBe(0) // deposited no longer due
    expect(pdc.listPdcs({ status: 'deposited' }).length).toBe(1)
    expect(pdc.listPdcs({ status: 'pending' }).length).toBe(2)
  })

  it('rejects a non-positive amount', () => {
    expect(() => pdc.createPdc({ amount: 0, depositDate: dayOffset(1) })).toThrow(/greater than zero/)
  })
})

describe('receipt layout', () => {
  it('shows a hyphen for cash mode and never shows "Received in"', () => {
    const s = students.createStudent({ admissionNo: 'RC-1', firstName: 'Reci', lastName: 'Pt', gender: 'male', status: 'active', guardians: [] })
    const cashAcct = accounts.createAccount({ name: 'Cash', type: 'cash', openingBalance: 0, isActive: true })
    const cash = payments.recordPayment({ studentId: s.id, amount: 5000, paymentDate: today, mode: 'cash', accountId: cashAcct.id })
    const html = renderReceiptHtml(getReceiptData(cash.id))
    expect(html).not.toContain('Received in')
    expect(html).toContain('<span>Mode</span>—')

    const upi = payments.recordPayment({ studentId: s.id, amount: 7000, paymentDate: today, mode: 'upi', referenceNo: 'TXN99', accountId: cashAcct.id })
    const html2 = renderReceiptHtml(getReceiptData(upi.id))
    expect(html2).toContain('UPI (TXN99)')
    expect(html2).not.toContain('Received in')
  })
})

describe('new reports', () => {
  it('produces account, school and net reports with sensible totals', () => {
    const bnk = accounts.createAccount({ name: 'RepBank', type: 'bank', openingBalance: 100000, isActive: true })
    const sch = school.createSchool({ name: 'RepSchool', isActive: true })
    const b = batch.createBatch({ name: 'RepBatch', defaultFee: 0, status: 'active' })
    const s = students.createStudent({ admissionNo: 'REP-1', firstName: 'R', lastName: 'S', gender: 'male', status: 'active', batchId: b.id, schoolId: sch.id, guardians: [] })
    const plan = fees.saveFeePlan(s.id, { name: 'P', totalAmount: 100000, discount: 20000, installments: [{ dueAmount: 80000, dueDate: dayOffset(-5) }] })
    payments.recordPayment({ studentId: s.id, amount: 50000, paymentDate: today, mode: 'bank_transfer', accountId: bnk.id, allocations: [{ installmentId: plan.installments[0].id, amount: 50000 }] })
    const cat = expense.listCategories()[0] ?? expense.createCategory('Misc')
    expense.createExpense({ expenseDate: today, categoryId: cat.id, amount: 12000, mode: 'bank_transfer', accountId: bnk.id })

    const byAccount = report.getReport('collection-by-account')
    expect(Number(byAccount.rows.find((r) => r.account === 'RepBank')?.amount)).toBe(50000)

    const summary = report.getReport('account-summary')
    const row = summary.rows.find((r) => r.account === 'RepBank')!
    expect(row.balance).toBe(100000 + 50000 - 12000)

    const bySchool = report.getReport('collection-by-school')
    expect(Number(bySchool.rows.find((r) => r.school === 'RepSchool')?.amount)).toBe(50000)

    const studentsBySchool = report.getReport('students-by-school')
    expect(Number(studentsBySchool.rows.find((r) => r.school === 'RepSchool')?.count)).toBe(1)

    const discounts = report.getReport('discounts-by-student')
    expect(Number(discounts.rows.find((r) => r.admissionNo === 'REP-1')?.discount)).toBe(20000)

    const outstandingByBatch = report.getReport('outstanding-by-batch')
    expect(Number(outstandingByBatch.rows.find((r) => r.batch === 'RepBatch')?.outstanding)).toBe(30000) // 80000 due - 50000 paid

    const net = report.getReport('monthly-net')
    const ym = today.slice(0, 7)
    const mrow = net.rows.find((r) => r.month === ym)!
    expect(mrow.net).toBe(Number(mrow.collected) - Number(mrow.spent))
  })
})
