import { getDb } from '../db/database'
import { listFeeSummaries } from './fee'
import type { DueItem, DashboardData, PaymentListItem } from '@shared/types'

const today = (): string => new Date().toISOString().slice(0, 10)

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface DueRow {
  installment_id: number
  label: string | null
  due_date: string
  due_amount: number
  paid: number
  student_id: number
  first_name: string
  last_name: string | null
  admission_no: string
  batch_name: string | null
}

function dueRows(): DueRow[] {
  return getDb().all<DueRow>(
    `SELECT i.id AS installment_id, i.label, i.due_date, i.due_amount,
            COALESCE((SELECT SUM(a.amount) FROM payment_allocations a JOIN payments p ON p.id = a.payment_id
                      WHERE a.installment_id = i.id AND p.is_cancelled = 0), 0) AS paid,
            fp.student_id, s.first_name, s.last_name, s.admission_no, b.name AS batch_name
     FROM fee_installments i
     JOIN fee_plans fp ON fp.id = i.fee_plan_id
     JOIN students s ON s.id = fp.student_id
     LEFT JOIN batches b ON b.id = s.batch_id
     WHERE i.due_date IS NOT NULL`
  )
}

function toItem(r: DueRow): DueItem {
  return {
    studentId: r.student_id,
    studentName: `${r.first_name} ${r.last_name ?? ''}`.trim(),
    admissionNo: r.admission_no,
    batchName: r.batch_name,
    installmentId: r.installment_id,
    label: r.label,
    dueDate: r.due_date,
    dueAmount: r.due_amount,
    paid: r.paid,
    outstanding: r.due_amount - r.paid
  }
}

export function listOverdue(): DueItem[] {
  const t = today()
  return dueRows()
    .filter((r) => r.due_amount - r.paid > 0 && r.due_date < t)
    .map(toItem)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export function listUpcoming(days = 14): DueItem[] {
  const t = today()
  const until = addDays(t, days)
  return dueRows()
    .filter((r) => r.due_amount - r.paid > 0 && r.due_date >= t && r.due_date <= until)
    .map(toItem)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

function collectionBetween(from: string, to: string): number {
  return (
    getDb().get<{ total: number }>(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE is_cancelled = 0 AND payment_date >= ? AND payment_date <= ?',
      [from, to]
    )?.total ?? 0
  )
}

function collectionTrend(): { month: string; label: string; amount: number }[] {
  const now = new Date()
  const months: { month: string; label: string; amount: number }[] = []
  const rows = getDb().all<{ ym: string; total: number }>(
    `SELECT substr(payment_date, 1, 7) AS ym, SUM(amount) AS total
     FROM payments WHERE is_cancelled = 0 GROUP BY ym`
  )
  const byMonth = new Map(rows.map((r) => [r.ym, r.total]))
  const fmt = new Intl.DateTimeFormat('en-IN', { month: 'short' })
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    months.push({ month: ym, label: fmt.format(d), amount: byMonth.get(ym) ?? 0 })
  }
  return months
}

export function getDashboard(): DashboardData {
  const t = today()
  const monthStart = `${t.slice(0, 7)}-01`
  const summaries = listFeeSummaries()
  const totalOutstanding = summaries.reduce((s, x) => s + x.outstanding, 0)
  const overdueStudents = summaries.filter((x) => x.overdueCount > 0).length
  const overdue = listOverdue()
  const overdueAmount = overdue.reduce((s, x) => s + x.outstanding, 0)

  const recent = getDb().all<{
    id: number
    receipt_no: string
    student_id: number
    student_name: string
    payment_date: string
    amount: number
    mode: PaymentListItem['mode']
    account_name: string | null
    is_cancelled: number
  }>(
    `SELECT p.id, p.receipt_no, p.student_id, (s.first_name || ' ' || COALESCE(s.last_name, '')) AS student_name,
            p.payment_date, p.amount, p.mode, a.name AS account_name, p.is_cancelled
     FROM payments p JOIN students s ON s.id = p.student_id LEFT JOIN accounts a ON a.id = p.account_id
     WHERE p.is_cancelled = 0 ORDER BY p.created_at DESC LIMIT 6`
  )

  const monthCollection = collectionBetween(monthStart, t)
  const monthExpenses =
    getDb().get<{ t: number }>('SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE expense_date >= ?', [monthStart])
      ?.t ?? 0

  return {
    todayCollection: collectionBetween(t, t),
    monthCollection,
    monthExpenses,
    monthNet: monthCollection - monthExpenses,
    totalOutstanding,
    overdueStudents,
    overdueAmount,
    upcomingCount: listUpcoming(14).length,
    collectionTrend: collectionTrend(),
    recentPayments: recent.map((r) => ({
      id: r.id,
      receiptNo: r.receipt_no,
      studentId: r.student_id,
      studentName: r.student_name.trim(),
      paymentDate: r.payment_date,
      amount: r.amount,
      mode: r.mode,
      accountName: r.account_name,
      isCancelled: false
    }))
  }
}
