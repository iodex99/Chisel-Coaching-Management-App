import { getDb } from '../db/database'
import type {
  FeePlanView,
  FeeInstallmentView,
  FeePlanInput,
  InstallmentStatus,
  StudentFeeSummary
} from '@shared/types'

import { todayISO } from './fy'

const now = (): string => new Date().toISOString()
const today = (): string => todayISO()
const rupees = (paise: number): string => `₹${(paise / 100).toLocaleString('en-IN')}`

function statusFor(due: number, paid: number, dueDate: string | null): InstallmentStatus {
  if (due - paid <= 0) return 'paid'
  if (paid > 0) return 'partial'
  if (dueDate && dueDate < today()) return 'overdue'
  return 'pending'
}

/** Installment rows for a plan with paid amount (from non-cancelled payments). */
function installmentViews(planId: number): FeeInstallmentView[] {
  return getDb()
    .all<{ id: number; seq_no: number; label: string | null; due_amount: number; due_date: string | null; paid: number }>(
      `SELECT i.id, i.seq_no, i.label, i.due_amount, i.due_date,
              COALESCE((SELECT SUM(a.amount) FROM payment_allocations a
                        JOIN payments p ON p.id = a.payment_id
                        WHERE a.installment_id = i.id AND p.is_cancelled = 0), 0) AS paid
       FROM fee_installments i WHERE i.fee_plan_id = ? ORDER BY i.seq_no`,
      [planId]
    )
    .map((r) => ({
      id: r.id,
      seqNo: r.seq_no,
      label: r.label,
      dueAmount: r.due_amount,
      dueDate: r.due_date,
      paid: r.paid,
      outstanding: Math.max(0, r.due_amount - r.paid),
      status: statusFor(r.due_amount, r.paid, r.due_date)
    }))
}

export function getFeePlan(studentId: number): FeePlanView | null {
  const plan = getDb().get<{
    id: number
    student_id: number
    name: string
    total_amount: number
    discount: number
    net_amount: number
    notes: string | null
  }>('SELECT * FROM fee_plans WHERE student_id = ?', [studentId])
  if (!plan) return null

  const installments = installmentViews(plan.id)
  const paid = installments.reduce((s, i) => s + i.paid, 0)
  return {
    id: plan.id,
    studentId,
    name: plan.name,
    totalAmount: plan.total_amount,
    discount: plan.discount,
    netAmount: plan.net_amount,
    notes: plan.notes,
    installments,
    totals: { net: plan.net_amount, paid, outstanding: Math.max(0, plan.net_amount - paid) }
  }
}

function hasAllocations(planId: number): boolean {
  const c =
    getDb().get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM payment_allocations a
       JOIN fee_installments i ON i.id = a.installment_id WHERE i.fee_plan_id = ?`,
      [planId]
    )?.c ?? 0
  return c > 0
}

export function saveFeePlan(studentId: number, input: FeePlanInput): FeePlanView {
  if (input.totalAmount <= 0) throw new Error('Total fee must be greater than zero')
  const net = input.totalAmount - input.discount
  if (net < 0) throw new Error('Discount cannot exceed the total fee')
  const sum = input.installments.reduce((s, i) => s + i.dueAmount, 0)
  if (sum !== net) {
    throw new Error(`Installments (${rupees(sum)}) must add up to the net fee (${rupees(net)})`)
  }

  const existing = getDb().get<{ id: number }>('SELECT id FROM fee_plans WHERE student_id = ?', [studentId])
  if (existing && hasAllocations(existing.id)) {
    throw new Error('Payments have been recorded against this plan, so its structure can no longer be changed.')
  }

  const ts = now()
  getDb().transaction((d) => {
    if (existing) d.run('DELETE FROM fee_plans WHERE id = ?', [existing.id]) // cascades installments
    const planId = d.run(
      'INSERT INTO fee_plans (student_id, name, total_amount, discount, net_amount, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [studentId, input.name, input.totalAmount, input.discount, net, input.notes ?? null, ts, ts]
    ).lastInsertRowid
    input.installments.forEach((inst, idx) => {
      d.run('INSERT INTO fee_installments (fee_plan_id, seq_no, label, due_amount, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
        planId,
        idx + 1,
        inst.label?.trim() || `Installment ${idx + 1}`,
        inst.dueAmount,
        inst.dueDate || null,
        ts
      ])
    })
  })
  return getFeePlan(studentId) as FeePlanView
}

export function deleteFeePlan(studentId: number): void {
  const existing = getDb().get<{ id: number }>('SELECT id FROM fee_plans WHERE student_id = ?', [studentId])
  if (!existing) return
  if (hasAllocations(existing.id)) {
    throw new Error('Payments have been recorded against this plan; it cannot be deleted.')
  }
  getDb().transaction((d) => d.run('DELETE FROM fee_plans WHERE id = ?', [existing.id]))
}

/** Per-student fee summary for the fees overview / reports. */
export function listFeeSummaries(): StudentFeeSummary[] {
  const plans = getDb().all<{
    id: number
    student_id: number
    admission_no: string
    first_name: string
    last_name: string | null
    batch_name: string | null
    net_amount: number
  }>(
    `SELECT fp.id, fp.student_id, fp.net_amount, s.admission_no, s.first_name, s.last_name, b.name AS batch_name
     FROM fee_plans fp JOIN students s ON s.id = fp.student_id LEFT JOIN batches b ON b.id = s.batch_id
     ORDER BY s.first_name, s.last_name`
  )

  return plans.map((p) => {
    const installments = installmentViews(p.id)
    const paid = installments.reduce((s, i) => s + i.paid, 0)
    const overdue = installments.filter((i) => i.status === 'overdue' || (i.status === 'partial' && i.dueDate && i.dueDate < today()))
    const nextDue = installments.find((i) => i.outstanding > 0 && i.dueDate)
    return {
      studentId: p.student_id,
      admissionNo: p.admission_no,
      firstName: p.first_name,
      lastName: p.last_name,
      batchName: p.batch_name,
      net: p.net_amount,
      paid,
      outstanding: Math.max(0, p.net_amount - paid),
      overdueCount: overdue.length,
      nextDueDate: nextDue?.dueDate ?? null
    }
  })
}
