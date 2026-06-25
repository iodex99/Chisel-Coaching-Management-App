import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Wand2 } from 'lucide-react'
import type { PaymentMode, PaymentRecord } from '@shared/types'
import { PAYMENT_MODES } from '@shared/constants'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtMoney, rupeesToPaise, todayIso } from '../lib/format'
import { ReceiptActions } from '../components/ReceiptActions'
import { DateField } from '../components/DateField'

const todayStr = (): string => todayIso()

export function PaymentForm({
  studentId: fixedStudentId,
  onDone
}: {
  studentId?: number
  onDone: () => void
}): JSX.Element {
  const [studentId, setStudentId] = useState<number | ''>(fixedStudentId ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [reference, setReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [alloc, setAlloc] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<PaymentRecord | null>(null)

  const { data: studentOptions = [] } = useQuery({
    queryKey: ['students', '', '', 'active'],
    queryFn: () => api.students.list({ status: 'active' }),
    enabled: !fixedStudentId
  })
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() })
  const { data: plan } = useQuery({
    queryKey: ['fee-plan', studentId],
    queryFn: () => api.fees.getPlan({ studentId: studentId as number }),
    enabled: studentId !== ''
  })

  const allocSum = useMemo(
    () => Object.values(alloc).reduce((s, v) => s + rupeesToPaise(v || '0'), 0),
    [alloc]
  )
  const amountPaise = rupeesToPaise(amount || '0')

  function autoAllocate(): void {
    if (!plan) return
    let remaining = amountPaise
    const next: Record<number, string> = {}
    for (const i of plan.installments) {
      if (remaining <= 0) break
      if (i.outstanding <= 0) continue
      const take = Math.min(remaining, i.outstanding)
      next[i.id] = (take / 100).toString()
      remaining -= take
    }
    setAlloc(next)
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (studentId === '') return setError('Select a student')
    if (amountPaise <= 0) return setError('Enter an amount')
    if (allocSum > amountPaise) return setError('Allocated amount exceeds the payment amount')
    setBusy(true)
    try {
      const allocations = Object.entries(alloc)
        .map(([id, v]) => ({ installmentId: Number(id), amount: rupeesToPaise(v || '0') }))
        .filter((a) => a.amount > 0)
      const payment = await api.payments.record({
        studentId: studentId as number,
        amount: amountPaise,
        paymentDate: date,
        mode,
        accountId: accountId === '' ? null : accountId,
        referenceNo: reference.trim() || undefined,
        remarks: remarks.trim() || undefined,
        allocations
      })
      void queryClient.invalidateQueries({ queryKey: ['fee-plan', studentId] })
      void queryClient.invalidateQueries({ queryKey: ['fee-summaries'] })
      void queryClient.invalidateQueries({ queryKey: ['payments'] })
      setCreated(payment)
    } catch (e2) {
      setError(errMessage(e2))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto mb-2 text-green-500" size={40} />
        <h3 className="text-lg font-semibold text-slate-800">Payment recorded</h3>
        <p className="mt-1 text-sm text-slate-500">
          Receipt <span className="font-mono">{created.receiptNo}</span> · {fmtMoney(created.amount)}
        </p>
        <div className="mt-4 flex justify-center">
          <ReceiptActions paymentId={created.id} />
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <button
            className="btn-outline"
            onClick={() => {
              setCreated(null)
              setAmount('')
              setReference('')
              setRemarks('')
              setAlloc({})
            }}
          >
            Record another
          </button>
          <button className="btn-primary" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {!fixedStudentId && (
        <div>
          <label className="label">Student</label>
          <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">— Select student —</option>
            {studentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.admissionNo} · {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount (₹)</label>
          <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Date</label>
          <DateField value={date} onChange={setDate} />
        </div>
        <div>
          <label className="label">Mode</label>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Received in account</label>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">— None —</option>
            {accounts.filter((a) => a.isActive).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Reference (UPI / cheque no)</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div>
          <label className="label">Remarks</label>
          <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </div>

      {plan && plan.installments.some((i) => i.outstanding > 0) && (
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Allocate to installments</span>
            <button type="button" className="btn-ghost py-1 text-xs" onClick={autoAllocate}>
              <Wand2 size={14} /> Auto-allocate
            </button>
          </div>
          <div className="space-y-2">
            {plan.installments.map((i) => (
              <div key={i.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1 text-slate-600">
                  {i.label} <span className="text-slate-400">· due {fmtMoney(i.outstanding)}</span>
                </span>
                <input
                  className="input w-32 py-1"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  disabled={i.outstanding <= 0}
                  value={alloc[i.id] ?? ''}
                  onChange={(e) => setAlloc((a) => ({ ...a, [i.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <p className={`mt-2 text-xs ${allocSum > amountPaise ? 'text-accent-600' : 'text-slate-400'}`}>
            Allocated {fmtMoney(allocSum)} of {fmtMoney(amountPaise)}
            {amountPaise > allocSum ? ` · ${fmtMoney(amountPaise - allocSum)} unallocated (advance)` : ''}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-accent-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Record payment'}
        </button>
      </div>
    </form>
  )
}
