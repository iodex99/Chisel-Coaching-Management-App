import { getDb, type Db } from '../db/database'
import { getInstituteProfile } from './settings'
import { rupeesInWords } from './money'
import { financialYear } from './fy'
import type {
  PaymentInput,
  PaymentRecord,
  PaymentListItem,
  PaymentFilter,
  PaymentAllocationView,
  ReceiptData
} from '@shared/types'

const now = (): string => new Date().toISOString()

/** Allocate the next receipt number atomically inside a transaction. */
function nextReceiptNo(d: Db, dateISO: string): string {
  const fy = financialYear(dateISO)
  const seqKey = `receipt.seq.${fy}`
  const current = parseInt(d.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [seqKey])?.value ?? '0', 10)
  const next = current + 1
  d.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [seqKey, String(next), now()]
  )
  const prefix = d.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['receipt.prefix'])?.value ?? 'CHISEL'
  return `${prefix}/${fy}/${String(next).padStart(4, '0')}`
}

function installmentOutstanding(installmentId: number): { studentId: number; outstanding: number } | null {
  const row = getDb().get<{ due_amount: number; student_id: number; paid: number }>(
    `SELECT i.due_amount, fp.student_id,
            COALESCE((SELECT SUM(x.amount) FROM payment_allocations x JOIN payments p ON p.id = x.payment_id
                      WHERE x.installment_id = i.id AND p.is_cancelled = 0), 0) AS paid
     FROM fee_installments i JOIN fee_plans fp ON fp.id = i.fee_plan_id WHERE i.id = ?`,
    [installmentId]
  )
  if (!row) return null
  return { studentId: row.student_id, outstanding: row.due_amount - row.paid }
}

export function recordPayment(input: PaymentInput, userId = 1): PaymentRecord {
  if (input.amount <= 0) throw new Error('Amount must be greater than zero')
  const allocations = (input.allocations ?? []).filter((a) => a.amount > 0)
  const allocSum = allocations.reduce((s, a) => s + a.amount, 0)
  if (allocSum > input.amount) throw new Error('Allocated amounts exceed the payment amount')

  for (const a of allocations) {
    const info = installmentOutstanding(a.installmentId)
    if (!info || info.studentId !== input.studentId) throw new Error('Invalid installment for this student')
    if (a.amount > info.outstanding) throw new Error('An allocation exceeds the installment’s outstanding amount')
  }

  const ts = now()
  const id = getDb().transaction((d) => {
    const receiptNo = nextReceiptNo(d, input.paymentDate)
    const paymentId = d.run(
      `INSERT INTO payments (receipt_no, student_id, payment_date, amount, mode, account_id, reference_no, remarks, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        receiptNo,
        input.studentId,
        input.paymentDate,
        input.amount,
        input.mode,
        input.accountId ?? null,
        input.referenceNo ?? null,
        input.remarks ?? null,
        userId,
        ts
      ]
    ).lastInsertRowid
    for (const a of allocations) {
      d.run('INSERT INTO payment_allocations (payment_id, installment_id, amount) VALUES (?, ?, ?)', [
        paymentId,
        a.installmentId,
        a.amount
      ])
    }
    d.run('INSERT INTO audit_log (user_id, action, entity, entity_id, created_at) VALUES (?, ?, ?, ?, ?)', [
      userId,
      'payment',
      'payment',
      paymentId,
      ts
    ])
    return paymentId
  })
  return getPayment(id) as PaymentRecord
}

export function getPayment(id: number): PaymentRecord | undefined {
  const r = getDb().get<{
    id: number
    receipt_no: string
    student_id: number
    student_name: string
    admission_no: string
    payment_date: string
    amount: number
    mode: PaymentRecord['mode']
    account_id: number | null
    account_name: string | null
    reference_no: string | null
    remarks: string | null
    is_cancelled: number
    cancel_reason: string | null
    created_at: string
  }>(
    `SELECT p.*, (s.first_name || ' ' || COALESCE(s.last_name, '')) AS student_name, s.admission_no, a.name AS account_name
     FROM payments p JOIN students s ON s.id = p.student_id LEFT JOIN accounts a ON a.id = p.account_id
     WHERE p.id = ?`,
    [id]
  )
  if (!r) return undefined
  const allocations: PaymentAllocationView[] = getDb()
    .all<{ installment_id: number | null; amount: number; label: string | null }>(
      `SELECT al.installment_id, al.amount, i.label FROM payment_allocations al
       LEFT JOIN fee_installments i ON i.id = al.installment_id WHERE al.payment_id = ? ORDER BY al.id`,
      [id]
    )
    .map((x) => ({ installmentId: x.installment_id, label: x.label, amount: x.amount }))
  return {
    id: r.id,
    receiptNo: r.receipt_no,
    studentId: r.student_id,
    studentName: r.student_name.trim(),
    admissionNo: r.admission_no,
    paymentDate: r.payment_date,
    amount: r.amount,
    mode: r.mode,
    accountId: r.account_id,
    accountName: r.account_name,
    referenceNo: r.reference_no,
    remarks: r.remarks,
    isCancelled: !!r.is_cancelled,
    cancelReason: r.cancel_reason,
    createdAt: r.created_at,
    allocations
  }
}

export function listPayments(filter: PaymentFilter = {}): PaymentListItem[] {
  const where: string[] = []
  const params: (string | number)[] = []
  if (!filter.includeCancelled) where.push('p.is_cancelled = 0')
  if (filter.studentId) {
    where.push('p.student_id = ?')
    params.push(filter.studentId)
  }
  if (filter.dateFrom) {
    where.push('p.payment_date >= ?')
    params.push(filter.dateFrom)
  }
  if (filter.dateTo) {
    where.push('p.payment_date <= ?')
    params.push(filter.dateTo)
  }
  if (filter.mode && filter.mode !== 'all') {
    where.push('p.mode = ?')
    params.push(filter.mode)
  }
  if (filter.search) {
    where.push('(p.receipt_no LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?)')
    const q = `%${filter.search}%`
    params.push(q, q, q)
  }
  let sql = `
    SELECT p.id, p.receipt_no, p.student_id, (s.first_name || ' ' || COALESCE(s.last_name, '')) AS student_name,
           p.payment_date, p.amount, p.mode, a.name AS account_name, p.is_cancelled
    FROM payments p JOIN students s ON s.id = p.student_id LEFT JOIN accounts a ON a.id = p.account_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.payment_date DESC, p.id DESC`
  if (filter.limit) {
    sql += ' LIMIT ? OFFSET ?'
    params.push(Math.min(filter.limit, 500), filter.offset ?? 0)
  }
  return getDb()
    .all<{
      id: number
      receipt_no: string
      student_id: number
      student_name: string
      payment_date: string
      amount: number
      mode: PaymentListItem['mode']
      account_name: string | null
      is_cancelled: number
    }>(sql, params)
    .map((r) => ({
      id: r.id,
      receiptNo: r.receipt_no,
      studentId: r.student_id,
      studentName: r.student_name.trim(),
      paymentDate: r.payment_date,
      amount: r.amount,
      mode: r.mode,
      accountName: r.account_name,
      isCancelled: !!r.is_cancelled
    }))
}

export function cancelPayment(id: number, reason?: string): void {
  const p = getDb().get<{ is_cancelled: number }>('SELECT is_cancelled FROM payments WHERE id = ?', [id])
  if (!p) throw new Error('Payment not found')
  if (p.is_cancelled) throw new Error('Payment is already cancelled')
  getDb().transaction((d) => {
    d.run('UPDATE payments SET is_cancelled = 1, cancel_reason = ? WHERE id = ?', [reason ?? null, id])
    d.run('INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (1, ?, ?, ?, ?, ?)', [
      'cancel-payment',
      'payment',
      id,
      reason ?? null,
      now()
    ])
  })
}

export function getReceiptData(paymentId: number): ReceiptData {
  const payment = getPayment(paymentId)
  if (!payment) throw new Error('Payment not found')
  return {
    institute: getInstituteProfile(),
    payment,
    amountInWords: rupeesInWords(payment.amount)
  }
}
