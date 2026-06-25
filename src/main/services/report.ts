import { shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'
import { getDb } from '../db/database'
import { listFeeSummaries } from './fee'
import { getInstituteProfile } from './settings'
import { htmlToPdf } from './pdf'
import { dataPath } from '../paths'
import type { ReportType, ReportRange, ReportResult, ReportColumn, PaymentMode } from '@shared/types'
import { PAYMENT_MODES } from '@shared/constants'

const modeLabel = (m: string): string => PAYMENT_MODES.find((x) => x.value === (m as PaymentMode))?.label ?? m

function rangeClause(col: string, range: ReportRange, params: (string | number)[]): string {
  const parts: string[] = []
  if (range.from) {
    parts.push(`${col} >= ?`)
    params.push(range.from)
  }
  if (range.to) {
    parts.push(`${col} <= ?`)
    params.push(range.to)
  }
  return parts.length ? ' AND ' + parts.join(' AND ') : ''
}

type Row = Record<string, string | number | null>

function sumRows(rows: Row[], keys: string[]): Row {
  const totals: Row = {}
  for (const k of keys) totals[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)
  return totals
}

export function getReport(type: ReportType, range: ReportRange = {}): ReportResult {
  const db = getDb()
  const params: (string | number)[] = []

  switch (type) {
    case 'collection-by-student': {
      const rows = db.all<Row>(
        `SELECT s.admission_no AS admissionNo, (s.first_name || ' ' || COALESCE(s.last_name, '')) AS student,
                b.name AS batch, COUNT(*) AS count, SUM(p.amount) AS amount
         FROM payments p JOIN students s ON s.id = p.student_id LEFT JOIN batches b ON b.id = s.batch_id
         WHERE p.is_cancelled = 0${rangeClause('p.payment_date', range, params)}
         GROUP BY p.student_id ORDER BY amount DESC`,
        params
      )
      return {
        type,
        title: 'Collection by student',
        columns: [
          { key: 'admissionNo', label: 'Adm. No' },
          { key: 'student', label: 'Student' },
          { key: 'batch', label: 'Batch' },
          { key: 'count', label: 'Payments', type: 'number', align: 'right' },
          { key: 'amount', label: 'Collected', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['count', 'amount'])
      }
    }
    case 'outstanding': {
      const rows: Row[] = listFeeSummaries()
        .filter((s) => s.outstanding > 0)
        .map((s) => ({
          admissionNo: s.admissionNo,
          student: `${s.firstName} ${s.lastName ?? ''}`.trim(),
          batch: s.batchName,
          net: s.net,
          paid: s.paid,
          outstanding: s.outstanding
        }))
      return {
        type,
        title: 'Outstanding fees',
        columns: [
          { key: 'admissionNo', label: 'Adm. No' },
          { key: 'student', label: 'Student' },
          { key: 'batch', label: 'Batch' },
          { key: 'net', label: 'Net', type: 'money', align: 'right' },
          { key: 'paid', label: 'Paid', type: 'money', align: 'right' },
          { key: 'outstanding', label: 'Outstanding', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['net', 'paid', 'outstanding'])
      }
    }
    case 'collection-by-date': {
      const rows = db.all<Row>(
        `SELECT payment_date AS date, COUNT(*) AS count, SUM(amount) AS amount
         FROM payments WHERE is_cancelled = 0${rangeClause('payment_date', range, params)}
         GROUP BY payment_date ORDER BY payment_date DESC`,
        params
      )
      return {
        type,
        title: 'Collection by date',
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'count', label: 'Payments', type: 'number', align: 'right' },
          { key: 'amount', label: 'Collected', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['count', 'amount'])
      }
    }
    case 'collection-by-mode': {
      const rows = db
        .all<Row>(
          `SELECT mode, COUNT(*) AS count, SUM(amount) AS amount
           FROM payments WHERE is_cancelled = 0${rangeClause('payment_date', range, params)}
           GROUP BY mode ORDER BY amount DESC`,
          params
        )
        .map((r) => ({ ...r, mode: modeLabel(String(r.mode)) }))
      return {
        type,
        title: 'Collection by payment mode',
        columns: [
          { key: 'mode', label: 'Mode' },
          { key: 'count', label: 'Payments', type: 'number', align: 'right' },
          { key: 'amount', label: 'Collected', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['count', 'amount'])
      }
    }
    case 'collection-by-batch': {
      const rows = db.all<Row>(
        `SELECT COALESCE(b.name, 'No batch') AS batch, COUNT(*) AS count, SUM(p.amount) AS amount
         FROM payments p JOIN students s ON s.id = p.student_id LEFT JOIN batches b ON b.id = s.batch_id
         WHERE p.is_cancelled = 0${rangeClause('p.payment_date', range, params)}
         GROUP BY b.id ORDER BY amount DESC`,
        params
      )
      return {
        type,
        title: 'Collection summary by batch',
        columns: [
          { key: 'batch', label: 'Batch' },
          { key: 'count', label: 'Payments', type: 'number', align: 'right' },
          { key: 'amount', label: 'Collected', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['count', 'amount'])
      }
    }
    case 'expense-by-date': {
      const rows = db.all<Row>(
        `SELECT expense_date AS date, COUNT(*) AS count, SUM(amount) AS amount
         FROM expenses WHERE 1 = 1${rangeClause('expense_date', range, params)}
         GROUP BY expense_date ORDER BY expense_date DESC`,
        params
      )
      return expenseResult(type, 'Expenses by date', [{ key: 'date', label: 'Date', type: 'date' }], rows)
    }
    case 'expense-by-category': {
      const rows = db.all<Row>(
        `SELECT COALESCE(c.name, 'Uncategorised') AS category, COUNT(*) AS count, SUM(e.amount) AS amount
         FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
         WHERE 1 = 1${rangeClause('e.expense_date', range, params)}
         GROUP BY e.category_id ORDER BY amount DESC`,
        params
      )
      return expenseResult(type, 'Expenses by category', [{ key: 'category', label: 'Category' }], rows)
    }
    case 'expense-by-vendor': {
      const rows = db.all<Row>(
        `SELECT COALESCE(v.name, e.payee, 'Unknown') AS vendor, COUNT(*) AS count, SUM(e.amount) AS amount
         FROM expenses e LEFT JOIN vendors v ON v.id = e.vendor_id
         WHERE 1 = 1${rangeClause('e.expense_date', range, params)}
         GROUP BY COALESCE(v.name, e.payee, 'Unknown') ORDER BY amount DESC`,
        params
      )
      return expenseResult(type, 'Expenses by vendor / payee', [{ key: 'vendor', label: 'Vendor / Payee' }], rows)
    }
    case 'expense-by-account': {
      const rows = db.all<Row>(
        `SELECT COALESCE(a.name, 'None') AS account, COUNT(*) AS count, SUM(e.amount) AS amount
         FROM expenses e LEFT JOIN accounts a ON a.id = e.account_id
         WHERE 1 = 1${rangeClause('e.expense_date', range, params)}
         GROUP BY e.account_id ORDER BY amount DESC`,
        params
      )
      return expenseResult(type, 'Expenses by account', [{ key: 'account', label: 'Account' }], rows)
    }
    case 'expense-by-month': {
      const rows = db.all<Row>(
        `SELECT substr(expense_date, 1, 7) AS month, COUNT(*) AS count, SUM(amount) AS amount
         FROM expenses WHERE 1 = 1${rangeClause('expense_date', range, params)}
         GROUP BY month ORDER BY month DESC`,
        params
      )
      return expenseResult(type, 'Expenses by month', [{ key: 'month', label: 'Month' }], rows)
    }
    default:
      throw new Error('Unknown report type')
  }
}

function expenseResult(type: ReportType, title: string, firstCols: ReportColumn[], rows: Row[]): ReportResult {
  return {
    type,
    title,
    columns: [
      ...firstCols,
      { key: 'count', label: 'Entries', type: 'number', align: 'right' },
      { key: 'amount', label: 'Amount', type: 'money', align: 'right' }
    ],
    rows,
    totals: sumRows(rows, ['count', 'amount'])
  }
}

// --- PDF export ---

const money = (paise: number): string => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtD = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  return d ? `${d}/${m}/${y}` : iso
}
const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)

function cell(value: string | number | null, col: ReportColumn): string {
  if (value === null || value === undefined) return '—'
  if (col.type === 'money') return money(Number(value))
  if (col.type === 'date') return fmtD(String(value))
  return esc(String(value))
}

function renderReportHtml(result: ReportResult, range: ReportRange): string {
  const inst = getInstituteProfile()
  const head = result.columns.map((c) => `<th class="${c.align === 'right' ? 'r' : ''}">${esc(c.label)}</th>`).join('')
  const body = result.rows
    .map(
      (row) =>
        `<tr>${result.columns.map((c) => `<td class="${c.align === 'right' ? 'r' : ''}">${cell(row[c.key], c)}</td>`).join('')}</tr>`
    )
    .join('')
  const totals = result.totals
    ? `<tr class="tot">${result.columns
        .map((c, i) => `<td class="${c.align === 'right' ? 'r' : ''}">${i === 0 ? 'Total' : result.totals![c.key] != null ? cell(result.totals![c.key], c) : ''}</td>`)
        .join('')}</tr>`
    : ''
  const period = [range.from && `from ${fmtD(range.from)}`, range.to && `to ${fmtD(range.to)}`].filter(Boolean).join(' ') || 'all dates'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;margin:0;padding:28px;font-size:12px}
    h1{color:#1e1b8c;font-size:18px;margin:0}
    .sub{color:#6b7280;font-size:11px;margin:2px 0 16px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:6px 8px;border-bottom:1px solid #eef2f7;text-align:left}
    thead th{background:#1e1b8c;color:#fff;font-size:11px;text-transform:uppercase}
    .r{text-align:right}
    .tot{font-weight:700;background:#f3f4f6}
  </style></head><body>
    <h1>${esc(inst.name)}</h1>
    <div class="sub">${esc(result.title)} · ${esc(period)}</div>
    <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${result.columns.length}">No data</td></tr>`}${totals}</tbody></table>
  </body></html>`
}

export async function exportReportPdf(type: ReportType, range: ReportRange = {}): Promise<string> {
  const result = getReport(type, range)
  const file = dataPath('receipts', `report-${type}-${Date.now()}.pdf`)
  await htmlToPdf(renderReportHtml(result, range), file)
  await shell.openPath(file)
  return file
}

function exportsDir(): string {
  const dir = dataPath('exports')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Export a report as a real .xlsx (opens in Excel) and open it. */
export async function exportReportExcel(type: ReportType, range: ReportRange = {}): Promise<string> {
  const result = getReport(type, range)
  const inst = getInstituteProfile()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Report')

  ws.addRow([inst.name])
  ws.getRow(1).font = { bold: true, size: 14 }
  const period = [range.from && `from ${fmtD(range.from)}`, range.to && `to ${fmtD(range.to)}`].filter(Boolean).join(' ') || 'all dates'
  ws.addRow([`${result.title} · ${period}`])
  ws.addRow([])

  const headerRow = ws.addRow(result.columns.map((c) => c.label))
  headerRow.font = { bold: true }

  for (const row of result.rows) {
    ws.addRow(result.columns.map((c) => excelValue(row[c.key], c)))
  }
  if (result.totals && result.rows.length > 0) {
    const totalRow = ws.addRow(result.columns.map((c, i) => (i === 0 ? 'Total' : excelValue(result.totals![c.key], c))))
    totalRow.font = { bold: true }
  }

  // Column widths + money formatting.
  result.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1)
    col.width = Math.max(12, c.label.length + 2)
    if (c.type === 'money') col.numFmt = '#,##0.00'
  })

  const file = join(exportsDir(), `report-${type}-${Date.now()}.xlsx`)
  await wb.xlsx.writeFile(file)
  await shell.openPath(file)
  return file
}

/** Coerce a report cell into the value type Excel should store. */
function excelValue(value: string | number | null, col: ReportColumn): string | number | null {
  if (value === null || value === undefined) return null
  if (col.type === 'money') return Number(value) / 100
  if (col.type === 'number') return Number(value)
  return String(value)
}
