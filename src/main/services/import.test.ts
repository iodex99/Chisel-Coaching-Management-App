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
  ws.addRow(['Admission No', 'First Name', 'Last Name', 'Gender', 'Phone', 'Email', 'Batch', 'Status', 'Admission Date (YYYY-MM-DD)'])
  rows.forEach((r) => ws.addRow(r))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe('bulk import', () => {
  it('generates a students template file', async () => {
    const path = await importer.generateStudentTemplate()
    expect(existsSync(path)).toBe(true)
  })

  it('imports valid student rows and reports row-level errors', async () => {
    const buf = await studentsXlsx([
      ['S-1', 'Asha', '', '', '', '', 'Alpha', 'active', ''], // valid
      ['S-2', 'Bob', '', '', '', '', 'Ghost', '', ''], // unknown batch
      ['', '', '', '', '', '', '', '', ''], // blank → skipped
      ['S-1', 'Dup', '', '', '', '', '', '', ''] // duplicate admission no
    ])
    const res = await importer.importStudents(buf)
    expect(res.imported).toBe(1)
    expect(res.errors).toHaveLength(2)
    expect(res.errors[0].message).toMatch(/Unknown batch/)
    expect(res.errors[1].message).toMatch(/already exists/)
    expect(students.listStudents({ search: 'Asha' })).toHaveLength(1)
  })

  it('imports fee plans split into installments', async () => {
    const s = students.createStudent({ admissionNo: 'F-9', firstName: 'Fay', status: 'active', guardians: [] })
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Fees')
    ws.addRow(['Admission No', 'Plan Name', 'Total Fee', 'Discount', 'Installments', 'First Due Date (YYYY-MM-DD)'])
    ws.addRow(['F-9', 'Annual', 1000, 0, 2, '2026-04-01'])
    ws.addRow(['NOPE', 'Annual', 1000, 0, 1, '2026-04-01']) // unknown student
    const res = await importer.importFees(Buffer.from(await wb.xlsx.writeBuffer()))

    expect(res.imported).toBe(1)
    expect(res.errors).toHaveLength(1)
    const plan = fees.getFeePlan(s.id)
    expect(plan?.netAmount).toBe(100000)
    expect(plan?.installments).toHaveLength(2)
  })
})
