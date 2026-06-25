import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => process.cwd() }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from './auth'
import * as students from './student'
import * as fees from './fee'
import * as payments from './payment'
import { ensureDataDirs } from '../paths'

let dataDir: string
let studentId: number
let firstInstallmentId: number

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-pay-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'password123' })
  studentId = students.createStudent({ admissionNo: 'P-1', firstName: 'Pay', status: 'active', guardians: [] }).id
  const plan = fees.saveFeePlan(studentId, {
    name: 'Annual',
    totalAmount: 100000,
    discount: 0,
    installments: [
      { label: 'First', dueAmount: 50000, dueDate: '2026-04-10' },
      { label: 'Second', dueAmount: 50000, dueDate: '2026-08-10' }
    ]
  })
  firstInstallmentId = plan.installments[0].id
})

afterAll(async () => {
  const __db = await import("../db/database")
  if (__db.isOpen()) {
    await __db.flushCurrent()
    __db.closeDatabase()
  }
  delete process.env.CHISEL_DATA_DIR
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

describe('payments & receipts', () => {
  it('records a payment with an allocation and a sequential receipt number', () => {
    const p = payments.recordPayment({
      studentId,
      amount: 50000,
      paymentDate: '2026-06-15',
      mode: 'upi',
      referenceNo: 'UPI123',
      allocations: [{ installmentId: firstInstallmentId, amount: 50000 }]
    })
    expect(p.receiptNo).toBe('CHISEL/2026-27/0001')
    expect(p.amount).toBe(50000)
    expect(p.allocations).toHaveLength(1)

    const plan = fees.getFeePlan(studentId)
    expect(plan?.totals.paid).toBe(50000)
    expect(plan?.installments[0].status).toBe('paid')
    expect(plan?.totals.outstanding).toBe(50000)
  })

  it('increments the receipt number on the next payment', () => {
    const p = payments.recordPayment({ studentId, amount: 10000, paymentDate: '2026-06-16', mode: 'cash' })
    expect(p.receiptNo).toBe('CHISEL/2026-27/0002')
  })

  it('rejects an allocation that exceeds the installment outstanding', () => {
    const plan = fees.getFeePlan(studentId)
    const second = plan!.installments[1]
    expect(() =>
      payments.recordPayment({
        studentId,
        amount: 60000,
        paymentDate: '2026-06-17',
        mode: 'cash',
        allocations: [{ installmentId: second.id, amount: 60000 }] // outstanding is 50000
      })
    ).toThrow(/exceeds/)
  })

  it('cancelling a payment restores outstanding and excludes it from totals', () => {
    const before = fees.getFeePlan(studentId)!.totals.paid
    const p = payments.recordPayment({
      studentId,
      amount: 20000,
      paymentDate: '2026-06-18',
      mode: 'cash',
      allocations: [{ installmentId: fees.getFeePlan(studentId)!.installments[1].id, amount: 20000 }]
    })
    expect(fees.getFeePlan(studentId)!.totals.paid).toBe(before + 20000)
    payments.cancelPayment(p.id, 'mistake')
    expect(fees.getFeePlan(studentId)!.totals.paid).toBe(before)
    expect(() => payments.cancelPayment(p.id)).toThrow(/already cancelled/)
  })

  it('lists payments and excludes cancelled ones by default', () => {
    const active = payments.listPayments({ studentId })
    const all = payments.listPayments({ studentId, includeCancelled: true })
    expect(all.length).toBeGreaterThan(active.length)
    expect(active.every((p) => !p.isCancelled)).toBe(true)
  })

  it('builds receipt data with amount in words', () => {
    const list = payments.listPayments({ studentId })
    const data = payments.getReceiptData(list[list.length - 1].id)
    expect(data.amountInWords).toMatch(/Rupees/)
    expect(data.institute.name).toBeTruthy()
  })
})
