import { shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import ExcelJS from 'exceljs'
import { getDb } from '../db/database'
import { listFeeSummaries } from './fee'
import { listOverdue } from './dashboard'
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
    case 'collection-by-account': {
      const rows = db.all<Row>(
        `SELECT COALESCE(a.name, 'No account') AS account, COUNT(*) AS count, SUM(p.amount) AS amount
         FROM payments p LEFT JOIN accounts a ON a.id = p.account_id
         WHERE p.is_cancelled = 0${rangeClause('p.payment_date', range, params)}
         GROUP BY p.account_id ORDER BY amount DESC`,
        params
      )
      return {
        type,
        title: 'Collection by account',
        columns: [
          { key: 'account', label: 'Account' },
          { key: 'count', label: 'Payments', type: 'number', align: 'right' },
          { key: 'amount', label: 'Credited', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['count', 'amount'])
      }
    }
    case 'collection-by-school': {
      const rows = db.all<Row>(
        `SELECT COALESCE(sc.name, 'No school') AS school, COUNT(*) AS count, SUM(p.amount) AS amount
         FROM payments p JOIN students s ON s.id = p.student_id LEFT JOIN schools sc ON sc.id = s.school_id
         WHERE p.is_cancelled = 0${rangeClause('p.payment_date', range, params)}
         GROUP BY s.school_id ORDER BY amount DESC`,
        params
      )
      return {
        type,
        title: 'Collection by school',
        columns: [
          { key: 'school', label: 'School' },
          { key: 'count', label: 'Payments', type: 'number', align: 'right' },
          { key: 'amount', label: 'Collected', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['count', 'amount'])
      }
    }
    case 'account-summary': {
      // Money in (payments) and out (expenses) per account, plus running balance.
      const pParams: (string | number)[] = []
      const pRange = rangeClause('p.payment_date', range, pParams)
      const eParams: (string | number)[] = []
      const eRange = rangeClause('e.expense_date', range, eParams)
      const rows = db
        .all<Row>(
          `SELECT a.name AS account, a.opening_balance AS opening,
                  COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.account_id = a.id AND p.is_cancelled = 0${pRange}), 0) AS credited,
                  COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.account_id = a.id${eRange}), 0) AS debited
           FROM accounts a ORDER BY a.name`,
          [...pParams, ...eParams]
        )
        .map((r) => ({ ...r, balance: Number(r.opening) + Number(r.credited) - Number(r.debited) }))
      return {
        type,
        title: 'Account summary (money in / out / balance)',
        columns: [
          { key: 'account', label: 'Account' },
          { key: 'opening', label: 'Opening', type: 'money', align: 'right' },
          { key: 'credited', label: 'Credited in', type: 'money', align: 'right' },
          { key: 'debited', label: 'Paid out', type: 'money', align: 'right' },
          { key: 'balance', label: 'Balance', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['opening', 'credited', 'debited', 'balance'])
      }
    }
    case 'outstanding-by-batch': {
      const agg = new Map<string, { net: number; paid: number; outstanding: number; students: number }>()
      for (const s of listFeeSummaries()) {
        const key = s.batchName ?? 'No batch'
        const a = agg.get(key) ?? { net: 0, paid: 0, outstanding: 0, students: 0 }
        a.net += s.net
        a.paid += s.paid
        a.outstanding += s.outstanding
        if (s.outstanding > 0) a.students += 1
        agg.set(key, a)
      }
      const rows: Row[] = [...agg.entries()]
        .map(([batch, a]) => ({ batch, students: a.students, net: a.net, paid: a.paid, outstanding: a.outstanding }))
        .sort((x, y) => Number(y.outstanding) - Number(x.outstanding))
      return {
        type,
        title: 'Outstanding by batch',
        columns: [
          { key: 'batch', label: 'Batch' },
          { key: 'students', label: 'Students with dues', type: 'number', align: 'right' },
          { key: 'net', label: 'Net', type: 'money', align: 'right' },
          { key: 'paid', label: 'Paid', type: 'money', align: 'right' },
          { key: 'outstanding', label: 'Outstanding', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['students', 'net', 'paid', 'outstanding'])
      }
    }
    case 'students-by-school': {
      const rows = db.all<Row>(
        `SELECT COALESCE(sc.name, 'No school') AS school, COUNT(*) AS count,
                SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) AS active
         FROM students s LEFT JOIN schools sc ON sc.id = s.school_id
         GROUP BY s.school_id ORDER BY count DESC`
      )
      return {
        type,
        title: 'Students by school',
        columns: [
          { key: 'school', label: 'School' },
          { key: 'count', label: 'Students', type: 'number', align: 'right' },
          { key: 'active', label: 'Active', type: 'number', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['count', 'active'])
      }
    }
    case 'discounts-by-student': {
      const rows = db.all<Row>(
        `SELECT s.admission_no AS admissionNo, (s.first_name || ' ' || COALESCE(s.last_name, '')) AS student,
                b.name AS batch, fp.total_amount AS total, fp.discount AS discount
         FROM fee_plans fp JOIN students s ON s.id = fp.student_id LEFT JOIN batches b ON b.id = s.batch_id
         WHERE fp.discount > 0 ORDER BY fp.discount DESC`
      )
      return {
        type,
        title: 'Discounts given',
        columns: [
          { key: 'admissionNo', label: 'Adm. No' },
          { key: 'student', label: 'Student' },
          { key: 'batch', label: 'Batch' },
          { key: 'total', label: 'Total fee', type: 'money', align: 'right' },
          { key: 'discount', label: 'Discount', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['total', 'discount'])
      }
    }
    case 'monthly-net': {
      const cParams: (string | number)[] = []
      const cRange = rangeClause('payment_date', range, cParams)
      const coll = db.all<{ ym: string; total: number }>(
        `SELECT substr(payment_date, 1, 7) AS ym, SUM(amount) AS total FROM payments WHERE is_cancelled = 0${cRange} GROUP BY ym`,
        cParams
      )
      const eParams: (string | number)[] = []
      const eRange = rangeClause('expense_date', range, eParams)
      const exp = db.all<{ ym: string; total: number }>(
        `SELECT substr(expense_date, 1, 7) AS ym, SUM(amount) AS total FROM expenses WHERE 1 = 1${eRange} GROUP BY ym`,
        eParams
      )
      const collMap = new Map(coll.map((r) => [r.ym, r.total]))
      const expMap = new Map(exp.map((r) => [r.ym, r.total]))
      const months = [...new Set([...collMap.keys(), ...expMap.keys()])].sort().reverse()
      const rows: Row[] = months.map((m) => {
        const c = collMap.get(m) ?? 0
        const e = expMap.get(m) ?? 0
        return { month: m, collected: c, spent: e, net: c - e }
      })
      return {
        type,
        title: 'Monthly collection vs expense (net)',
        columns: [
          { key: 'month', label: 'Month' },
          { key: 'collected', label: 'Collected', type: 'money', align: 'right' },
          { key: 'spent', label: 'Spent', type: 'money', align: 'right' },
          { key: 'net', label: 'Net', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['collected', 'spent', 'net'])
      }
    }
    case 'payment-register': {
      const rows = db
        .all<Row>(
          `SELECT p.payment_date AS date, p.receipt_no AS receipt,
                  (s.first_name || ' ' || COALESCE(s.last_name, '')) AS student,
                  b.name AS batch, p.mode AS mode, a.name AS account, p.amount AS amount
           FROM payments p JOIN students s ON s.id = p.student_id
             LEFT JOIN batches b ON b.id = s.batch_id LEFT JOIN accounts a ON a.id = p.account_id
           WHERE p.is_cancelled = 0${rangeClause('p.payment_date', range, params)}
           ORDER BY p.payment_date, p.id`,
          params
        )
        .map((r) => ({ ...r, mode: modeLabel(String(r.mode)) }))
      return {
        type,
        title: 'Payment register',
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'receipt', label: 'Receipt' },
          { key: 'student', label: 'Student' },
          { key: 'batch', label: 'Batch' },
          { key: 'mode', label: 'Mode' },
          { key: 'account', label: 'Account' },
          { key: 'amount', label: 'Amount', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['amount'])
      }
    }
    case 'expense-register': {
      const rows = db
        .all<Row>(
          `SELECT e.expense_date AS date, c.name AS category, COALESCE(v.name, e.payee) AS vendor,
                  e.mode AS mode, a.name AS account, e.reference_no AS reference, e.amount AS amount
           FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
             LEFT JOIN vendors v ON v.id = e.vendor_id LEFT JOIN accounts a ON a.id = e.account_id
           WHERE 1 = 1${rangeClause('e.expense_date', range, params)}
           ORDER BY e.expense_date, e.id`,
          params
        )
        .map((r) => ({ ...r, mode: modeLabel(String(r.mode)) }))
      return {
        type,
        title: 'Expense register',
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'category', label: 'Category' },
          { key: 'vendor', label: 'Vendor / Payee' },
          { key: 'mode', label: 'Mode' },
          { key: 'account', label: 'Account' },
          { key: 'reference', label: 'Reference' },
          { key: 'amount', label: 'Amount', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['amount'])
      }
    }
    case 'daybook': {
      const pParams: (string | number)[] = []
      const pRange = rangeClause('p.payment_date', range, pParams)
      const ins = db.all<{ date: string; particulars: string; amount: number }>(
        `SELECT p.payment_date AS date,
                ('Receipt ' || p.receipt_no || ' · ' || s.first_name || ' ' || COALESCE(s.last_name, '')) AS particulars,
                p.amount AS amount
         FROM payments p JOIN students s ON s.id = p.student_id
         WHERE p.is_cancelled = 0${pRange}`,
        pParams
      )
      const eParams: (string | number)[] = []
      const eRange = rangeClause('e.expense_date', range, eParams)
      const outs = db.all<{ date: string; particulars: string; amount: number }>(
        `SELECT e.expense_date AS date,
                (COALESCE(c.name, 'Expense') || COALESCE(' · ' || COALESCE(v.name, e.payee), '')) AS particulars,
                e.amount AS amount
         FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id LEFT JOIN vendors v ON v.id = e.vendor_id
         WHERE 1 = 1${eRange}`,
        eParams
      )
      const rows: Row[] = [
        ...ins.map((r) => ({ date: r.date, type: 'Payment', particulars: r.particulars, in: r.amount, out: 0 })),
        ...outs.map((r) => ({ date: r.date, type: 'Expense', particulars: r.particulars, in: 0, out: r.amount }))
      ].sort((a, b) => String(a.date).localeCompare(String(b.date)))
      return {
        type,
        title: 'Daybook (money in / out)',
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'type', label: 'Type' },
          { key: 'particulars', label: 'Particulars' },
          { key: 'in', label: 'In', type: 'money', align: 'right' },
          { key: 'out', label: 'Out', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['in', 'out'])
      }
    }
    case 'daily-collection-mode': {
      const rows = db.all<Row>(
        `SELECT payment_date AS date,
                SUM(CASE WHEN mode = 'cash' THEN amount ELSE 0 END) AS cash,
                SUM(CASE WHEN mode = 'upi' THEN amount ELSE 0 END) AS upi,
                SUM(CASE WHEN mode = 'bank_transfer' THEN amount ELSE 0 END) AS bank,
                SUM(CASE WHEN mode = 'cheque' THEN amount ELSE 0 END) AS cheque,
                SUM(CASE WHEN mode = 'other' THEN amount ELSE 0 END) AS other,
                SUM(amount) AS total
         FROM payments WHERE is_cancelled = 0${rangeClause('payment_date', range, params)}
         GROUP BY payment_date ORDER BY payment_date DESC`,
        params
      )
      return {
        type,
        title: 'Daily collection by mode',
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'cash', label: 'Cash', type: 'money', align: 'right' },
          { key: 'upi', label: 'UPI', type: 'money', align: 'right' },
          { key: 'bank', label: 'Bank', type: 'money', align: 'right' },
          { key: 'cheque', label: 'Cheque', type: 'money', align: 'right' },
          { key: 'other', label: 'Other', type: 'money', align: 'right' },
          { key: 'total', label: 'Total', type: 'money', align: 'right' }
        ],
        rows,
        totals: sumRows(rows, ['cash', 'upi', 'bank', 'cheque', 'other', 'total'])
      }
    }
    case 'batch-performance': {
      const agg = new Map<string, { students: number; net: number; paid: number; outstanding: number }>()
      for (const s of listFeeSummaries()) {
        const key = s.batchName ?? 'No batch'
        const a = agg.get(key) ?? { students: 0, net: 0, paid: 0, outstanding: 0 }
        a.students += 1
        a.net += s.net
        a.paid += s.paid
        a.outstanding += s.outstanding
        agg.set(key, a)
      }
      const pct = (paid: number, net: number): number => (net > 0 ? Math.round((paid / net) * 1000) / 10 : 0)
      const rows: Row[] = [...agg.entries()]
        .map(([batch, a]) => ({ batch, students: a.students, net: a.net, collected: a.paid, outstanding: a.outstanding, pct: pct(a.paid, a.net) }))
        .sort((x, y) => Number(y.net) - Number(x.net))
      const totals = sumRows(rows, ['students', 'net', 'collected', 'outstanding'])
      totals.pct = pct(Number(totals.collected), Number(totals.net))
      return {
        type,
        title: 'Batch performance',
        columns: [
          { key: 'batch', label: 'Batch' },
          { key: 'students', label: 'Students', type: 'number', align: 'right' },
          { key: 'net', label: 'Net fee', type: 'money', align: 'right' },
          { key: 'collected', label: 'Collected', type: 'money', align: 'right' },
          { key: 'outstanding', label: 'Outstanding', type: 'money', align: 'right' },
          { key: 'pct', label: 'Collected %', type: 'number', align: 'right' }
        ],
        rows,
        totals
      }
    }
    case 'financial-summary': {
      const pParams: (string | number)[] = []
      const pRange = rangeClause('payment_date', range, pParams)
      const coll = db.get<{ c: number; a: number }>(
        `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS a FROM payments WHERE is_cancelled = 0${pRange}`,
        pParams
      )
      const eParams: (string | number)[] = []
      const eRange = rangeClause('expense_date', range, eParams)
      const spent = db.get<{ a: number }>(`SELECT COALESCE(SUM(amount), 0) AS a FROM expenses WHERE 1 = 1${eRange}`, eParams)?.a ?? 0
      const collected = coll?.a ?? 0
      const pc = coll?.c ?? 0
      const summaries = listFeeSummaries()
      const outstanding = summaries.reduce((s, x) => s + x.outstanding, 0)
      const overdue = listOverdue().reduce((s, x) => s + x.outstanding, 0)
      const studentsAll = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM students')?.c ?? 0
      const activeStu = db.get<{ c: number }>("SELECT COUNT(*) AS c FROM students WHERE status = 'active'")?.c ?? 0
      const rows: Row[] = [
        { metric: 'Collected', value: money(collected) },
        { metric: 'Expenses', value: money(spent) },
        { metric: 'Net (collection − expense)', value: money(collected - spent) },
        { metric: 'Payments recorded', value: String(pc) },
        { metric: 'Average payment', value: money(pc ? Math.round(collected / pc) : 0) },
        { metric: 'Total outstanding (all-time)', value: money(outstanding) },
        { metric: 'Overdue (all-time)', value: money(overdue) },
        { metric: 'Students (total / active)', value: `${studentsAll} / ${activeStu}` }
      ]
      return {
        type,
        title: 'Financial summary',
        columns: [
          { key: 'metric', label: 'Metric' },
          { key: 'value', label: 'Value', align: 'right' }
        ],
        rows
      }
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
  return d ? `${d}-${m}-${y}` : iso
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
  if (col.type === 'date') return fmtD(String(value))
  return String(value)
}
