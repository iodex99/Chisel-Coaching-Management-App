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
import * as batch from './batch'
import * as students from './student'
import * as fees from './fee'
import * as importer from './import'
import { ensureDataDirs } from '../paths'

let dataDir: string

const STU_HEADER = [
  'Admission No *',
  'Admission Date (DD-MM-YYYY) *',
  'First Name *',
  'Last Name *',
  'Gender *',
  'Phone',
  'Email',
  'Batch',
  'Status',
  'Guardian Name',
  'Guardian Relation',
  'Guardian Phone'
]
const FEE_HEADER = [
  'Admission No',
  'Course / Batch',
  'Total Fee (optional)',
  'Discount',
  'Installments (equal split)',
  'First Due Date (DD-MM-YYYY)',
  'Installment 1 Label',
  'Installment 1 Amount',
  'Installment 1 Date (DD-MM-YYYY)',
  'Installment 2 Label',
  'Installment 2 Amount',
  'Installment 2 Date (DD-MM-YYYY)',
  'Installment 3 Label',
  'Installment 3 Amount',
  'Installment 3 Date (DD-MM-YYYY)'
]

async function sheet(name: string, header: string[], rows: (string | number | Date | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(name)
  ws.addRow(header)
  rows.forEach((r) => ws.addRow(r))
  return Buffer.from(await wb.xlsx.writeBuffer())
}
const stuSheet = (rows: (string | number | Date | null)[][]): Promise<Buffer> => sheet('Students', STU_HEADER, rows)
const feeSheet = (rows: (string | number | Date | null)[][]): Promise<Buffer> => sheet('Fees', FEE_HEADER, rows)

/** Create a student directly (fee import needs an existing student). */
function mkStudent(adm: string): number {
  return students.createStudent({ admissionNo: adm, firstName: 'F', lastName: 'L', gender: 'male', status: 'active', guardians: [] }).id
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-importx-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'password123' })
  batch.createBatch({ name: 'NEET-A', courseName: 'NEET', defaultFee: 12000000, status: 'active' }) // ₹1,20,000
  batch.createBatch({ name: 'JEE-B', courseName: 'JEE', defaultFee: 15000000, status: 'active' })
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

describe('students import — edge cases', () => {
  it('trims whitespace, matches batch case-insensitively, and defaults an unknown status to active', async () => {
    const res = await importer.importStudents(
      await stuSheet([['  W-1  ', '01-04-2026', '  Asha ', ' Verma ', 'female', '', '', 'neet-a', 'weird-status']])
    )
    expect(res.imported).toBe(1)
    const s = students.listStudents({ search: 'W-1' })[0]
    const d = students.getStudent(s.id)!
    expect(d.admissionNo).toBe('W-1') // trimmed
    expect(d.firstName).toBe('Asha')
    expect(d.batchName).toBe('NEET-A') // case-insensitive batch match
    expect(d.status).toBe('active') // unknown status -> active
  })

  it('accepts a real Excel Date cell for the admission date', async () => {
    const res = await importer.importStudents(await stuSheet([['W-2', new Date(Date.UTC(2026, 3, 15)), 'Bob', 'Khan', 'male']]))
    expect(res.imported).toBe(1)
    expect(students.getStudent(students.listStudents({ search: 'W-2' })[0].id)?.admissionDate).toBe('2026-04-15')
  })

  it('maps columns by header even when the column order is shuffled and extra columns exist', async () => {
    const header = ['Gender *', 'Extra Notes', 'First Name *', 'Last Name *', 'Admission No *', 'Admission Date (DD-MM-YYYY) *']
    const res = await importer.importStudents(await sheet('Students', header, [['male', 'ignore me', 'Carl', 'Rao', 'W-3', '02-04-2026']]))
    expect(res.imported).toBe(1)
    expect(students.getStudent(students.listStudents({ search: 'W-3' })[0].id)?.firstName).toBe('Carl')
  })

  it('rejects a duplicate admission number (second occurrence errors)', async () => {
    const res = await importer.importStudents(
      await stuSheet([
        ['W-4', '01-04-2026', 'One', 'X', 'male'],
        ['W-4', '01-04-2026', 'Two', 'Y', 'female']
      ])
    )
    expect(res.imported).toBe(1)
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0].message).toMatch(/already exists/i)
  })

  it('ignores guardian relation/phone when the guardian name is blank', async () => {
    const res = await importer.importStudents(await stuSheet([['W-5', '01-04-2026', 'No', 'Guard', 'male', '', '', '', '', '', 'Father', '999']]))
    expect(res.imported).toBe(1)
    expect(students.getStudent(students.listStudents({ search: 'W-5' })[0].id)?.guardians).toHaveLength(0)
  })

  it('normalises a capitalised gender and rejects an invalid one', async () => {
    const ok = await importer.importStudents(await stuSheet([['W-6', '01-04-2026', 'Cap', 'Gender', 'Female']]))
    expect(ok.imported).toBe(1)
    expect(students.getStudent(students.listStudents({ search: 'W-6' })[0].id)?.gender).toBe('female')

    const bad = await importer.importStudents(await stuSheet([['W-7', '01-04-2026', 'Bad', 'Gender', 'M']]))
    expect(bad.imported).toBe(0)
    expect(bad.errors[0].message).toMatch(/Gender must be/)
  })

  it('distinguishes an invalid admission date from a missing one', async () => {
    const invalid = await importer.importStudents(await stuSheet([['W-8', '31-02-2026', 'A', 'B', 'male']]))
    expect(invalid.imported).toBe(0)
    expect(invalid.errors[0].message).toMatch(/not a valid date/i)

    const miss = await importer.importStudents(await stuSheet([['W-9', '', 'A', 'B', 'male']]))
    expect(miss.errors[0].message).toMatch(/Missing required.*Admission Date/i)
  })
})

describe('fees import — equal split', () => {
  it('splits the net into equal monthly installments with the remainder on the last', async () => {
    mkStudent('F-1')
    const res = await importer.importFees(await feeSheet([['F-1', '', 1000, 0, 3, '01-01-2026']]))
    expect(res.imported).toBe(1)
    const plan = fees.getFeePlan(students.listStudents({ search: 'F-1' })[0].id)!
    expect(plan.installments.map((i) => i.dueAmount)).toEqual([33333, 33333, 33334]) // ₹1000 = 100000 paise / 3
    expect(plan.installments.map((i) => i.dueDate)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it('pulls the base fee from the batch when total is blank', async () => {
    mkStudent('F-2')
    const res = await importer.importFees(await feeSheet([['F-2', 'NEET-A', '', 0, 2, '01-04-2026']]))
    expect(res.imported).toBe(1)
    expect(fees.getFeePlan(students.listStudents({ search: 'F-2' })[0].id)?.totalAmount).toBe(12000000)
  })

  it('errors when there is no total, no batch and no installments', async () => {
    mkStudent('F-3')
    const res = await importer.importFees(await feeSheet([['F-3', '', '', 0, 2, '01-04-2026']]))
    expect(res.imported).toBe(0)
    expect(res.errors[0].message).toMatch(/Total Fee|Course|installment/i)
  })
})

describe('fees import — custom installments (new)', () => {
  it('uses explicit installments with labels + dates, deriving the total from them', async () => {
    mkStudent('C-1')
    // blank total; two custom installments -> total derived = 30000 + 20000
    const res = await importer.importFees(
      await feeSheet([['C-1', '', '', 0, '', '', 'Admission', 30000, '05-04-2026', 'Term 2', 20000, '05-07-2026']])
    )
    expect(res.imported).toBe(1)
    const plan = fees.getFeePlan(students.listStudents({ search: 'C-1' })[0].id)!
    expect(plan.totalAmount).toBe(5000000)
    expect(plan.installments.map((i) => [i.label, i.dueAmount, i.dueDate])).toEqual([
      ['Admission', 3000000, '2026-04-05'],
      ['Term 2', 2000000, '2026-07-05']
    ])
  })

  it('honours Total Fee + Discount with custom installments (must add up to the net)', async () => {
    mkStudent('C-2')
    const res = await importer.importFees(
      await feeSheet([['C-2', '', 100000, 10000, '', '', '', 50000, '01-04-2026', '', 40000, '01-07-2026']])
    )
    expect(res.imported).toBe(1)
    const plan = fees.getFeePlan(students.listStudents({ search: 'C-2' })[0].id)!
    expect(plan.totalAmount).toBe(10000000)
    expect(plan.netAmount).toBe(9000000)
    expect(plan.installments.map((i) => i.label)).toEqual(['Installment 1', 'Installment 2']) // blank labels default
  })

  it('errors when custom installment amounts do not add up to the net', async () => {
    mkStudent('C-3')
    const res = await importer.importFees(await feeSheet([['C-3', '', 100000, 0, '', '', '', 40000, '01-04-2026', '', 40000, '01-07-2026']]))
    expect(res.imported).toBe(0)
    expect(res.errors[0].message).toMatch(/add up/i)
  })

  it('errors on an invalid custom installment date', async () => {
    mkStudent('C-4')
    const res = await importer.importFees(await feeSheet([['C-4', '', '', 0, '', '', '', 50000, 'not-a-date']]))
    expect(res.imported).toBe(0)
    expect(res.errors[0].message).toMatch(/installment date/i)
  })

  it('custom installments win over the equal-split count/first-due when both are present', async () => {
    mkStudent('C-5')
    const res = await importer.importFees(
      await feeSheet([['C-5', '', 100000, 0, 5, '01-01-2030', '', 60000, '01-04-2026', '', 40000, '01-07-2026']])
    )
    expect(res.imported).toBe(1)
    const plan = fees.getFeePlan(students.listStudents({ search: 'C-5' })[0].id)!
    expect(plan.installments).toHaveLength(2) // the 2 custom rows, not 5
    expect(plan.installments[0].dueDate).toBe('2026-04-01')
  })

  it('skips blank/zero installment rows (Installment 2 blank, 1 and 3 filled)', async () => {
    mkStudent('C-6')
    const res = await importer.importFees(
      await feeSheet([['C-6', '', 100000, 0, '', '', '', 60000, '01-04-2026', '', '', '', '', 40000, '01-07-2026']])
    )
    expect(res.imported).toBe(1)
    const plan = fees.getFeePlan(students.listStudents({ search: 'C-6' })[0].id)!
    expect(plan.installments.map((i) => i.dueAmount)).toEqual([6000000, 4000000])
  })

  it('allows custom installments with no dates (unscheduled)', async () => {
    mkStudent('C-7')
    const res = await importer.importFees(await feeSheet([['C-7', '', 90000, 0, '', '', '', 45000, '', '', 45000, '']]))
    expect(res.imported).toBe(1)
    const plan = fees.getFeePlan(students.listStudents({ search: 'C-7' })[0].id)!
    expect(plan.installments.map((i) => i.dueDate)).toEqual([null, null])
  })
})
