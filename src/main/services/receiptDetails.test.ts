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

import { setupTestAuth } from './testAuth'
import * as batch from './batch'
import * as school from './school'
import * as students from './student'
import * as payments from './payment'
import { renderReceiptHtml } from './receipt'
import { ensureDataDirs } from '../paths'
import type { StudentInput } from '@shared/types'

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-rcpt-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await setupTestAuth()
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

const receipt = (paymentId: number): string => renderReceiptHtml(payments.getReceiptData(paymentId))

function student(admissionNo: string, batchId: number | null, schoolId: number | null): StudentInput {
  return { admissionNo, firstName: 'Riya', lastName: 'Shah', status: 'active', batchId, schoolId, guardians: [] }
}

describe('receipt batch / course / school', () => {
  it('shows batch with academic year in brackets, course and school', () => {
    const b = batch.createBatch({ name: 'IX-A Morning', courseName: 'IX ICSE', academicYear: '2026-27', defaultFee: 0, status: 'active' })
    const sc = school.createSchool({ name: 'Campion School', isActive: true })
    const s = students.createStudent(student('RD-1', b.id, sc.id))
    const p = payments.recordPayment({ studentId: s.id, amount: 150000, paymentDate: '2026-07-01', mode: 'cash' })

    expect(p.batchName).toBe('IX-A Morning')
    expect(p.academicYear).toBe('2026-27')
    expect(p.courseName).toBe('IX ICSE')
    expect(p.schoolName).toBe('Campion School')

    const html = receipt(p.id)
    expect(html).toContain('<span>Batch</span>IX-A Morning (2026-27)')
    expect(html).toContain('<span>Course</span>IX ICSE')
    expect(html).toContain('<span>School</span>Campion School')
    // Existing fields are unchanged.
    expect(html).toContain('<span>Student</span>Riya Shah')
    expect(html).toContain('<span>Admission No</span>RD-1')
    expect(html).toContain('<span>Mode</span>—')
  })

  it('omits the brackets when the batch has no academic year', () => {
    const b = batch.createBatch({ name: 'X Crash', courseName: 'X CBSE', defaultFee: 0, status: 'active' })
    const s = students.createStudent(student('RD-2', b.id, null))
    const p = payments.recordPayment({ studentId: s.id, amount: 1000, paymentDate: '2026-07-01', mode: 'cash' })
    const html = receipt(p.id)
    expect(html).toContain('<span>Batch</span>X Crash</div>')
    expect(html).not.toContain('X Crash (')
    expect(html).toContain('<span>Course</span>X CBSE')
    expect(html).toContain('<span>School</span>—')
  })

  it('shows a dash for each detail the student does not have', () => {
    const s = students.createStudent(student('RD-3', null, null))
    const p = payments.recordPayment({ studentId: s.id, amount: 1000, paymentDate: '2026-07-01', mode: 'cash' })
    expect(p.batchName).toBeNull()
    expect(p.courseName).toBeNull()
    expect(p.schoolName).toBeNull()
    const html = receipt(p.id)
    expect(html).toContain('<span>Batch</span>—')
    expect(html).toContain('<span>Course</span>—')
    expect(html).toContain('<span>School</span>—')
  })

  it('shows a dash for a batch with no course set', () => {
    const b = batch.createBatch({ name: 'Weekend', academicYear: '2026-27', defaultFee: 0, status: 'active' })
    const s = students.createStudent(student('RD-4', b.id, null))
    const p = payments.recordPayment({ studentId: s.id, amount: 1000, paymentDate: '2026-07-01', mode: 'cash' })
    const html = receipt(p.id)
    expect(html).toContain('<span>Batch</span>Weekend (2026-27)')
    expect(html).toContain('<span>Course</span>—')
  })

  it('keeps the details as of payment after the student is promoted and masters are edited', () => {
    const ix = batch.createBatch({ name: 'IX-B', courseName: 'IX ICSE', academicYear: '2025-26', defaultFee: 0, status: 'active' })
    const x = batch.createBatch({ name: 'X-B', courseName: 'X ICSE', academicYear: '2026-27', defaultFee: 0, status: 'active' })
    const oldSchool = school.createSchool({ name: 'Old School', isActive: true })
    const newSchool = school.createSchool({ name: 'New School', isActive: true })
    const s = students.createStudent(student('RD-5', ix.id, oldSchool.id))
    const lastYear = payments.recordPayment({ studentId: s.id, amount: 5000, paymentDate: '2026-03-15', mode: 'cash' })

    // Promote the student, change school, and rename the old batch + school in the masters.
    students.updateStudent(s.id, student('RD-5', x.id, newSchool.id))
    batch.updateBatch(ix.id, { name: 'IX-B (renamed)', courseName: 'IX ICSE', academicYear: '2025-26', defaultFee: 0, status: 'inactive' })
    school.updateSchool(oldSchool.id, { name: 'Old School (renamed)', isActive: false })
    const thisYear = payments.recordPayment({ studentId: s.id, amount: 5000, paymentDate: '2026-07-15', mode: 'cash' })

    const oldHtml = receipt(lastYear.id)
    expect(oldHtml).toContain('<span>Batch</span>IX-B (2025-26)')
    expect(oldHtml).toContain('<span>Course</span>IX ICSE')
    expect(oldHtml).toContain('<span>School</span>Old School<')

    const newHtml = receipt(thisYear.id)
    expect(newHtml).toContain('<span>Batch</span>X-B (2026-27)')
    expect(newHtml).toContain('<span>Course</span>X ICSE')
    expect(newHtml).toContain('<span>School</span>New School')
  })

  it('keeps the details after the batch and school are deleted', () => {
    const b = batch.createBatch({ name: 'Temp Batch', courseName: 'XI Sci', academicYear: '2026-27', defaultFee: 0, status: 'active' })
    const sc = school.createSchool({ name: 'Temp School', isActive: true })
    const s = students.createStudent(student('RD-6', b.id, sc.id))
    const p = payments.recordPayment({ studentId: s.id, amount: 1000, paymentDate: '2026-07-01', mode: 'cash' })
    students.updateStudent(s.id, student('RD-6', null, null))
    batch.deleteBatch(b.id)
    school.deleteSchool(sc.id)
    const html = receipt(p.id)
    expect(html).toContain('<span>Batch</span>Temp Batch (2026-27)')
    expect(html).toContain('<span>Course</span>XI Sci')
    expect(html).toContain('<span>School</span>Temp School')
  })

  it('still shows the details on a cancelled receipt', () => {
    const b = batch.createBatch({ name: 'C-Batch', courseName: 'X CBSE', academicYear: '2026-27', defaultFee: 0, status: 'active' })
    const s = students.createStudent(student('RD-7', b.id, null))
    const p = payments.recordPayment({ studentId: s.id, amount: 1000, paymentDate: '2026-07-01', mode: 'cash' })
    payments.cancelPayment(p.id, 'duplicate')
    const html = receipt(p.id)
    expect(html).toContain('CANCELLED')
    expect(html).toContain('<span>Batch</span>C-Batch (2026-27)')
  })

  it('escapes HTML in master values', () => {
    const b = batch.createBatch({ name: 'A&B <Batch>', courseName: 'IX "ICSE"', academicYear: '2026-27', defaultFee: 0, status: 'active' })
    const sc = school.createSchool({ name: "St. Mary's & <Co>", isActive: true })
    const s = students.createStudent(student('RD-8', b.id, sc.id))
    const p = payments.recordPayment({ studentId: s.id, amount: 1000, paymentDate: '2026-07-01', mode: 'cash' })
    const html = receipt(p.id)
    expect(html).toContain('A&amp;B &lt;Batch&gt; (2026-27)')
    expect(html).toContain('IX &quot;ICSE&quot;')
    expect(html).toContain("St. Mary's &amp; &lt;Co&gt;")
    expect(html).not.toContain('<Batch>')
    expect(html).not.toContain('<Co>')
  })

  it('does not change receipt numbering or amounts', () => {
    const s = students.createStudent(student('RD-9', null, null))
    const a = payments.recordPayment({ studentId: s.id, amount: 1234, paymentDate: '2027-05-01', mode: 'upi', referenceNo: 'U1' })
    const b = payments.recordPayment({ studentId: s.id, amount: 5678, paymentDate: '2027-05-02', mode: 'cash' })
    expect(a.receiptNo).toMatch(/\/2027-28\/0001$/)
    expect(b.receiptNo).toMatch(/\/2027-28\/0002$/)
    expect(payments.getPayment(a.id)?.amount).toBe(1234)
    expect(receipt(a.id)).toContain('UPI (U1)')
  })
})
