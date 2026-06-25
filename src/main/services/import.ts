import { shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'
import { dataPath } from '../paths'
import { getDb } from '../db/database'
import { listBatches } from './batch'
import { createStudent } from './student'
import { saveFeePlan } from './fee'
import type { ImportResult, StudentStatus } from '@shared/types'

function exportsDir(): string {
  const dir = dataPath('exports')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Map of normalized header -> 1-based column index for row 1 of a sheet. */
function headerIndex(ws: ExcelJS.Worksheet): Record<string, number> {
  const map: Record<string, number> = {}
  ws.getRow(1).eachCell((cell, col) => {
    map[norm(String(cell.text ?? ''))] = col
  })
  return map
}

function findCol(headers: Record<string, number>, exact: string[], prefix?: string): number | null {
  for (const e of exact) if (headers[e]) return headers[e]
  if (prefix) {
    for (const [k, v] of Object.entries(headers)) if (k.startsWith(prefix)) return v
  }
  return null
}

const cellText = (row: ExcelJS.Row, col: number | null): string =>
  col ? String(row.getCell(col).text ?? '').trim() : ''

const cellNumber = (row: ExcelJS.Row, col: number | null): number => {
  const n = parseFloat(cellText(row, col).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const toPaise = (rupees: number): number => Math.round(rupees * 100)

// --- Templates ---

function buildStudentsTemplate(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Students')
  const lists = wb.addWorksheet('Lists')
  lists.state = 'veryHidden'

  const batches = listBatches().map((b) => b.name)
  batches.forEach((n, i) => (lists.getCell(`A${i + 1}`).value = n))
  ;['male', 'female', 'other'].forEach((g, i) => (lists.getCell(`B${i + 1}`).value = g))
  ;['active', 'inactive', 'dropped', 'completed'].forEach((s, i) => (lists.getCell(`C${i + 1}`).value = s))

  ws.columns = [
    { header: 'Admission No', width: 14 },
    { header: 'First Name', width: 16 },
    { header: 'Last Name', width: 16 },
    { header: 'Gender', width: 10 },
    { header: 'Phone', width: 14 },
    { header: 'Email', width: 22 },
    { header: 'Batch', width: 22 },
    { header: 'Status', width: 12 },
    { header: 'Admission Date (YYYY-MM-DD)', width: 26 }
  ]
  ws.getRow(1).font = { bold: true }

  const lastBatch = Math.max(batches.length, 1)
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`D${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['Lists!$B$1:$B$3'] }
    ws.getCell(`G${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$A$1:$A$${lastBatch}`] }
    ws.getCell(`H${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['Lists!$C$1:$C$4'] }
  }
  return wb
}

function buildFeesTemplate(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Fees')
  ws.columns = [
    { header: 'Admission No', width: 14 },
    { header: 'Plan Name', width: 18 },
    { header: 'Total Fee', width: 12 },
    { header: 'Discount', width: 12 },
    { header: 'Installments', width: 14 },
    { header: 'First Due Date (YYYY-MM-DD)', width: 26 }
  ]
  ws.getRow(1).font = { bold: true }
  return wb
}

export async function generateStudentTemplate(): Promise<string> {
  const file = join(exportsDir(), 'students-import-template.xlsx')
  await buildStudentsTemplate().xlsx.writeFile(file)
  await shell.openPath(file)
  return file
}

export async function generateFeeTemplate(): Promise<string> {
  const file = join(exportsDir(), 'fees-import-template.xlsx')
  await buildFeesTemplate().xlsx.writeFile(file)
  await shell.openPath(file)
  return file
}

// --- Imports ---

const STATUSES: StudentStatus[] = ['active', 'inactive', 'dropped', 'completed']

export async function importStudents(bytes: Buffer): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook()
  // exceljs's load() param type lags Node 22's generic Buffer; runtime is fine.
  await wb.xlsx.load(bytes as unknown as ArrayBuffer)
  const ws = wb.getWorksheet('Students') ?? wb.worksheets[0]
  if (!ws) throw new Error('The file has no worksheet')

  const h = headerIndex(ws)
  const c = {
    adm: findCol(h, ['admissionno', 'admissionnumber']),
    first: findCol(h, ['firstname', 'name']),
    last: findCol(h, ['lastname']),
    gender: findCol(h, ['gender']),
    phone: findCol(h, ['phone', 'mobile']),
    email: findCol(h, ['email']),
    batch: findCol(h, ['batch', 'class']),
    status: findCol(h, ['status']),
    admdate: findCol(h, ['admissiondate'], 'admissiondate')
  }
  if (!c.adm || !c.first) {
    throw new Error('Could not find the "Admission No" and "First Name" columns. Use the provided template.')
  }

  const batchByName = new Map(listBatches().map((b) => [b.name.toLowerCase(), b.id]))
  const result: ImportResult = { imported: 0, errors: [] }

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const adm = cellText(row, c.adm)
    const first = cellText(row, c.first)
    if (!adm && !first) continue // blank row

    if (!adm) {
      result.errors.push({ row: r, message: 'Admission No is required' })
      continue
    }
    if (!first) {
      result.errors.push({ row: r, message: 'First Name is required' })
      continue
    }

    let batchId: number | null = null
    const batchName = cellText(row, c.batch)
    if (batchName) {
      const id = batchByName.get(batchName.toLowerCase())
      if (!id) {
        result.errors.push({ row: r, message: `Unknown batch "${batchName}" — create it first or fix the spelling` })
        continue
      }
      batchId = id
    }

    const statusRaw = cellText(row, c.status).toLowerCase()
    const status = (STATUSES as string[]).includes(statusRaw) ? (statusRaw as StudentStatus) : 'active'

    try {
      createStudent({
        admissionNo: adm,
        firstName: first,
        lastName: cellText(row, c.last) || undefined,
        gender: cellText(row, c.gender) || undefined,
        phone: cellText(row, c.phone) || undefined,
        email: cellText(row, c.email) || undefined,
        batchId,
        status,
        admissionDate: cellText(row, c.admdate) || undefined,
        guardians: []
      })
      result.imported++
    } catch (e) {
      result.errors.push({ row: r, message: (e as Error).message })
    }
  }
  return result
}

export async function importFees(bytes: Buffer): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook()
  // exceljs's load() param type lags Node 22's generic Buffer; runtime is fine.
  await wb.xlsx.load(bytes as unknown as ArrayBuffer)
  const ws = wb.getWorksheet('Fees') ?? wb.worksheets[0]
  if (!ws) throw new Error('The file has no worksheet')

  const h = headerIndex(ws)
  const c = {
    adm: findCol(h, ['admissionno', 'admissionnumber']),
    plan: findCol(h, ['planname', 'plan']),
    total: findCol(h, ['totalfee', 'total', 'amount']),
    discount: findCol(h, ['discount']),
    installments: findCol(h, ['installments', 'noofinstallments']),
    firstDue: findCol(h, ['firstduedate'], 'firstdue')
  }
  if (!c.adm || !c.total) {
    throw new Error('Could not find the "Admission No" and "Total Fee" columns. Use the provided template.')
  }

  const result: ImportResult = { imported: 0, errors: [] }

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const adm = cellText(row, c.adm)
    if (!adm) continue

    const student = getDb().get<{ id: number }>('SELECT id FROM students WHERE admission_no = ?', [adm])
    if (!student) {
      result.errors.push({ row: r, message: `No student with admission no "${adm}"` })
      continue
    }

    const total = toPaise(cellNumber(row, c.total))
    const discount = toPaise(cellNumber(row, c.discount))
    const net = total - discount
    if (net <= 0) {
      result.errors.push({ row: r, message: 'Total fee must be greater than the discount' })
      continue
    }
    const count = Math.max(1, Math.min(60, Math.round(cellNumber(row, c.installments)) || 1))
    const firstDue = cellText(row, c.firstDue)

    const per = Math.floor(net / count)
    const installments = Array.from({ length: count }, (_, i) => ({
      label: `Installment ${i + 1}`,
      dueAmount: i === count - 1 ? net - per * (count - 1) : per,
      dueDate: addMonths(firstDue, i)
    }))

    try {
      saveFeePlan(student.id, {
        name: cellText(row, c.plan) || 'Course fee',
        totalAmount: total,
        discount,
        installments
      })
      result.imported++
    } catch (e) {
      result.errors.push({ row: r, message: (e as Error).message })
    }
  }
  return result
}

/** Add `months` to a YYYY-MM-DD date; returns undefined if the base is empty/invalid. */
function addMonths(dateISO: string, months: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return undefined
  const [y, m, d] = dateISO.split('-').map(Number)
  const base = new Date(y, m - 1 + months, d)
  return base.toISOString().slice(0, 10)
}
