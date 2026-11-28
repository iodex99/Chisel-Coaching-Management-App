import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Editing a fee plan after payments have been recorded (students rarely pay the
// exact installment). The plan is edited in place so every recorded payment stays
// attached to its installment and the receipts are untouched.
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import { setupTestAuth } from './testAuth'
import * as students from './student'
import * as fees from './fee'
import * as payments from './payment'
import * as dashboard from './dashboard'
import { getDb } from '../db/database'
import { ensureDataDirs } from '../paths'
import type { FeePlanInput, FeePlanView } from '@shared/types'

let dataDir: string
let n = 0

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-feeedit-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await setupTestAuth()
})

afterAll(async () => {
  const __db = await import('../db/database')
  if (__db.isOpen()) {
    await __db.flushCurrent()
    __db.closeDatabase()
  }
  delete process.env.CHISEL_DATA_DIR
  try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* best-effort temp cleanup */ }
})

/** The screenshot's plan: ₹1,43,000 net = ₹10,000 + 4 × ₹33,250 (amounts in paise). */
function newStudentWithPlan(): { studentId: number; plan: FeePlanView } {
  const studentId = students.createStudent({ admissionNo: `E-${++n}`, firstName: 'Edit', status: 'active', guardians: [] }).id
  const plan = fees.saveFeePlan(studentId, {
    name: 'X ICSE B1 2027-28 fee',
    totalAmount: 14_300_000,
    discount: 0,
    installments: [
      { label: 'Installment 1', dueAmount: 1_000_000, dueDate: '2026-10-11' },
      { label: 'Installment 2', dueAmount: 3_325_000, dueDate: '2027-04-05' },
      { label: 'Installment 3', dueAmount: 3_325_000, dueDate: '2027-05-05' },
      { label: 'Installment 4', dueAmount: 3_325_000, dueDate: '2027-06-05' },
      { label: 'Installment 5', dueAmount: 3_325_000, dueDate: '2027-07-05' }
    ]
  })
  return { studentId, plan }
}

/** The editor's payload: the plan as-is (with ids), optionally changed. */
function asInput(plan: FeePlanView, change: (rows: FeePlanInput['installments']) => FeePlanInput['installments'] = (r) => r): FeePlanInput {
  return {
    name: plan.name,
    totalAmount: plan.totalAmount,
    discount: plan.discount,
    notes: plan.notes ?? undefined,
    installments: change(plan.installments.map((i) => ({ id: i.id, label: i.label ?? undefined, dueAmount: i.dueAmount, dueDate: i.dueDate ?? undefined })))
  }
}

function pay(studentId: number, installmentId: number, amount: number): number {
  return payments.recordPayment({ studentId, amount, paymentDate: '2026-11-26', mode: 'cash', allocations: [{ installmentId, amount }] }).id
}

const allocationsOf = (paymentId: number): { installment_id: number; amount: number }[] =>
  getDb().all('SELECT installment_id, amount FROM payment_allocations WHERE payment_id = ? ORDER BY id', [paymentId])

describe('editing a fee plan after payments', () => {
  it('a part-payment can be absorbed: lower the installment to what was paid and move the rest to the next one', () => {
    const { studentId, plan } = newStudentWithPlan()
    const [i1, i2, i3] = plan.installments
    pay(studentId, i1.id, 1_000_000)
    const p2 = pay(studentId, i2.id, 3_000_000) // paid ₹30,000 of ₹33,250
    const receiptBefore = payments.getPayment(p2)

    const saved = fees.saveFeePlan(
      studentId,
      asInput(fees.getFeePlan(studentId)!, (rows) => {
        rows[1].dueAmount = 3_000_000
        rows[2].dueAmount = 3_325_000 + 325_000
        return rows
      })
    )

    // Same installments (ids kept), payments still attached, statuses right.
    expect(saved.installments.map((i) => i.id)).toEqual(plan.installments.map((i) => i.id))
    expect(saved.installments[1]).toMatchObject({ id: i2.id, dueAmount: 3_000_000, paid: 3_000_000, outstanding: 0, status: 'paid' })
    expect(saved.installments[2]).toMatchObject({ id: i3.id, dueAmount: 3_650_000, paid: 0 })
    expect(saved.totals).toEqual({ net: 14_300_000, paid: 4_000_000, outstanding: 10_300_000 })
    expect(allocationsOf(p2)).toEqual([{ installment_id: i2.id, amount: 3_000_000 }])
    // The receipt is unchanged.
    expect(payments.getPayment(p2)).toEqual(receiptBefore)
    // The change is audited.
    expect(getDb().get<{ c: number }>("SELECT COUNT(*) AS c FROM audit_log WHERE action = 'fee-plan-edit'")?.c).toBeGreaterThan(0)
  })

  it('installments can be raised, re-dated, renamed, added, and unpaid ones removed', () => {
    const { studentId, plan } = newStudentWithPlan()
    pay(studentId, plan.installments[0].id, 1_000_000)
    const saved = fees.saveFeePlan(studentId, {
      ...asInput(fees.getFeePlan(studentId)!),
      totalAmount: 15_000_000, // fee raised by ₹7,000
      installments: [
        { id: plan.installments[0].id, label: 'Admission', dueAmount: 1_000_000, dueDate: '2026-10-11' },
        { id: plan.installments[1].id, label: 'Term 1', dueAmount: 7_000_000, dueDate: '2027-04-15' },
        // installments 3–5 removed (nothing paid on them)
        { label: 'Term 2', dueAmount: 7_000_000, dueDate: '2027-09-15' }
      ]
    })
    expect(saved.installments.map((i) => [i.seqNo, i.label, i.dueAmount, i.dueDate])).toEqual([
      [1, 'Admission', 1_000_000, '2026-10-11'],
      [2, 'Term 1', 7_000_000, '2027-04-15'],
      [3, 'Term 2', 7_000_000, '2027-09-15']
    ])
    expect(saved.installments[0]).toMatchObject({ id: plan.installments[0].id, paid: 1_000_000, status: 'paid' })
    expect(saved.totals).toEqual({ net: 15_000_000, paid: 1_000_000, outstanding: 14_000_000 })
  })

  it('an installment cannot be set below what has been paid on it', () => {
    const { studentId, plan } = newStudentWithPlan()
    pay(studentId, plan.installments[1].id, 3_000_000)
    expect(() =>
      fees.saveFeePlan(
        studentId,
        asInput(fees.getFeePlan(studentId)!, (rows) => {
          rows[1].dueAmount = 2_000_000
          rows[2].dueAmount += 1_325_000
          return rows
        })
      )
    ).toThrow(/₹30,000 has already been paid on it/)
    expect(fees.getFeePlan(studentId)!.installments[1].dueAmount).toBe(3_325_000) // unchanged
  })

  it('an installment with payments (even only cancelled ones) cannot be removed', () => {
    const { studentId, plan } = newStudentWithPlan()
    const p = pay(studentId, plan.installments[4].id, 100_000)
    const withoutLast = (rows: FeePlanInput['installments']): FeePlanInput['installments'] => {
      const kept = rows.slice(0, 4)
      kept[3].dueAmount += 3_325_000
      return kept
    }
    expect(() => fees.saveFeePlan(studentId, asInput(fees.getFeePlan(studentId)!, withoutLast))).toThrow(/can’t be removed/)
    payments.cancelPayment(p, 'typo')
    expect(fees.getFeePlan(studentId)!.installments[4]).toMatchObject({ paid: 0, hasPayments: true })
    expect(() => fees.saveFeePlan(studentId, asInput(fees.getFeePlan(studentId)!, withoutLast))).toThrow(/can’t be removed/)
    expect(allocationsOf(p)).toHaveLength(1) // the cancelled receipt keeps its record
  })

  it('a cancelled payment no longer counts toward the minimum', () => {
    const { studentId, plan } = newStudentWithPlan()
    const p = pay(studentId, plan.installments[1].id, 3_325_000)
    payments.cancelPayment(p, 'bounced')
    const saved = fees.saveFeePlan(
      studentId,
      asInput(fees.getFeePlan(studentId)!, (rows) => {
        rows[1].dueAmount = 1_000_000
        rows[2].dueAmount += 2_325_000
        return rows
      })
    )
    expect(saved.installments[1]).toMatchObject({ dueAmount: 1_000_000, paid: 0 })
  })

  it('the totals must still match, and stale / foreign installment ids are refused', () => {
    const { studentId, plan } = newStudentWithPlan()
    pay(studentId, plan.installments[0].id, 1_000_000)
    expect(() =>
      fees.saveFeePlan(studentId, asInput(fees.getFeePlan(studentId)!, (rows) => { rows[1].dueAmount = 1; return rows }))
    ).toThrow(/must add up/)
    const other = newStudentWithPlan()
    expect(() =>
      fees.saveFeePlan(studentId, asInput(fees.getFeePlan(studentId)!, (rows) => { rows[1].id = other.plan.installments[1].id; return rows }))
    ).toThrow(/changed in the meantime/)
    expect(() =>
      fees.saveFeePlan(studentId, asInput(fees.getFeePlan(studentId)!, (rows) => { rows[2].id = rows[1].id; return rows }))
    ).toThrow(/changed in the meantime/)
    // nothing was changed by the refused saves
    expect(fees.getFeePlan(studentId)!.installments.map((i) => i.dueAmount)).toEqual(plan.installments.map((i) => i.dueAmount))
    expect(fees.getFeePlan(other.studentId)!.installments.map((i) => i.id)).toEqual(other.plan.installments.map((i) => i.id))
  })

  it('after the edit, new payments allocate against the new amounts and dues follow them', () => {
    const { studentId, plan } = newStudentWithPlan()
    pay(studentId, plan.installments[1].id, 3_000_000)
    fees.saveFeePlan(
      studentId,
      asInput(fees.getFeePlan(studentId)!, (rows) => {
        rows[1].dueAmount = 3_000_000
        rows[2].dueAmount += 325_000
        return rows
      })
    )
    // installment 2 is fully paid now: nothing more can be allocated to it
    expect(() => pay(studentId, plan.installments[1].id, 1)).toThrow(/exceeds/)
    pay(studentId, plan.installments[2].id, 3_650_000)
    expect(fees.getFeePlan(studentId)!.installments[2]).toMatchObject({ paid: 3_650_000, status: 'paid' })
    const summary = fees.listFeeSummaries().find((s) => s.studentId === studentId)!
    expect(summary).toMatchObject({ net: 14_300_000, paid: 6_650_000 + 0, outstanding: 14_300_000 - 6_650_000 })
    expect(() => dashboard.getDashboard()).not.toThrow()
  })

  it('plans without payments behave as before (a save without ids replaces the schedule)', () => {
    const { studentId } = newStudentWithPlan()
    const saved = fees.saveFeePlan(studentId, {
      name: 'Re-done',
      totalAmount: 14_300_000,
      discount: 300_000,
      installments: [{ dueAmount: 7_000_000 }, { dueAmount: 7_000_000 }]
    })
    expect(saved.installments.map((i) => [i.seqNo, i.label, i.dueAmount])).toEqual([
      [1, 'Installment 1', 7_000_000],
      [2, 'Installment 2', 7_000_000]
    ])
    expect(saved).toMatchObject({ name: 'Re-done', netAmount: 14_000_000 })
  })
})
