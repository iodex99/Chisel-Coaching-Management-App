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
import * as batch from './batch'
import * as students from './student'
import * as fees from './fee'
import * as importer from './import'
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-import-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'password123' })
  batch.createBatch({ name: 'Alpha', defaultFee: 0, status: 'active' })
})

afterAll(() => {
  delete process.env.CHISEL_DATA_DIR
  rmSync(dataDir, { recursive: true, force: true })
})

async function studentsXlsx(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Students')
  ws.addRow([
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
  ])
  rows.forEach((r) => ws.addRow(r))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe('bulk import', () => {
  it('generates a students template file', async () => {
    const path = await importer.generateStudentTemplate()
    expect(existsSync(path)).toBe(true)
  })

  it('imports valid rows, parses dd-mm-yyyy dates and a guardian, and reports errors', async () => {
    const buf = await studentsXlsx([
      ['S-1', '01-06-2026', 'Asha', 'Verma', 'female', '', '', 'Alpha', 'active', 'Ramesh Verma', 'Father', '9000000000'],
      ['S-2', '01-06-2026', 'Bob', 'Singh', 'male', '', '', 'Ghost'], // unknown batch
      [''], // blank row
      ['S-3', '01-06-2026', 'NoLast', '', 'female'], // missing last name
      ['S-1', '02-06-2026', 'Dup', 'Verma', 'male'] // duplicate admission no
    ])
    const res = await importer.importStudents(buf)
    expect(res.imported).toBe(1)
    expect(res.errors).toHaveLength(3)

    const item = students.listStudents({ search: 'Asha' })[0]
    const detail = students.getStudent(item.id)
    expect(detail?.admissionDate).toBe('2026-06-01') // dd-mm-yyyy parsed to ISO
    expect(detail?.lastName).toBe('Verma')
    expect(detail?.gender).toBe('female')
    expect(detail?.guardians).toHaveLength(1)
    expect(detail?.guardians[0].name).toBe('Ramesh Verma')
  })

  it('imports fee plans with a dd-mm-yyyy first due date', async () => {
    const s = students.createStudent({ admissionNo: 'F-9', firstName: 'Fay', lastName: 'K', gender: 'female', status: 'active', guardians: [] })
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Fees')
    ws.addRow(['Admission No', 'Plan Name', 'Total Fee', 'Discount', 'Installments', 'First Due Date (DD-MM-YYYY)'])
    ws.addRow(['F-9', 'Annual', 1000, 0, 2, '01-04-2026'])
    ws.addRow(['NOPE', 'Annual', 1000, 0, 1, '01-04-2026'])
    const res = await importer.importFees(Buffer.from(await wb.xlsx.writeBuffer()))

    expect(res.imported).toBe(1)
    expect(res.errors).toHaveLength(1)
    const plan = fees.getFeePlan(s.id)
    expect(plan?.installments).toHaveLength(2)
    expect(plan?.installments[0].dueDate).toBe('2026-04-01')
  })
})
