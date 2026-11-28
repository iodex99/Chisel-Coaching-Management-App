import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Wand2 } from 'lucide-react'
import type { FeePlanView, FeePlanInput, InstallmentStatus } from '@shared/types'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtDate, fmtMoney, rupeesToPaise, paiseToRupees, todayIso } from '../lib/format'
import { Modal } from '../components/Modal'
import { DateField } from '../components/DateField'

const STATUS_BADGE: Record<InstallmentStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-accent-100 text-accent-700'
}

export function FeePlanPanel({ studentId, defaultBatchId }: { studentId: number; defaultBatchId?: number | null }): JSX.Element {
  const { data: plan, isLoading } = useQuery({
    queryKey: ['fee-plan', studentId],
    queryFn: () => api.fees.getPlan({ studentId })
  })
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['fee-plan', studentId] })
    void queryClient.invalidateQueries({ queryKey: ['fee-summaries'] })
  }

  async function removePlan(): Promise<void> {
    if (!window.confirm('Delete this fee plan?')) return
    setError('')
    try {
      await api.fees.deletePlan({ studentId })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  if (isLoading) return <p className="text-sm text-slate-400">Loading fee plan…</p>

  return (
    <div>
      {error && <p className="mb-2 text-sm text-accent-600">{error}</p>}
      {!plan ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">No fee plan defined yet.</p>
          <button className="btn-primary" onClick={() => setEditing(true)}>
            <Plus size={16} /> Create fee plan
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-700">{plan.name}</div>
              <div className="text-xs text-slate-400">
                Net {fmtMoney(plan.totals.net)} · Paid {fmtMoney(plan.totals.paid)} · Outstanding{' '}
                <span className="font-medium text-accent-600">{fmtMoney(plan.totals.outstanding)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-outline" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button className="btn-outline text-accent-600" onClick={() => void removePlan()}>
                Delete
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2">#</th>
                <th className="py-2">Installment</th>
                <th className="py-2">Due date</th>
                <th className="py-2 text-right">Due</th>
                <th className="py-2 text-right">Paid</th>
                <th className="py-2 text-right">Outstanding</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plan.installments.map((i) => (
                <tr key={i.id}>
                  <td className="py-2 text-slate-400">{i.seqNo}</td>
                  <td className="py-2 text-slate-700">{i.label}</td>
                  <td className="py-2 text-slate-500">{i.dueDate ? fmtDate(i.dueDate) : '—'}</td>
                  <td className="py-2 text-right">{fmtMoney(i.dueAmount)}</td>
                  <td className="py-2 text-right">{fmtMoney(i.paid)}</td>
                  <td className="py-2 text-right">{fmtMoney(i.outstanding)}</td>
                  <td className="py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[i.status]}`}>{i.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title={plan ? 'Edit fee plan' : 'Create fee plan'} width="max-w-2xl">
        {editing && (
          <FeePlanEditor
            studentId={studentId}
            plan={plan ?? null}
            defaultBatchId={defaultBatchId}
            onSaved={() => {
              setEditing(false)
              refresh()
            }}
            onCancel={() => setEditing(false)}
          />
        )}
      </Modal>
    </div>
  )
}

interface Row {
  /** Existing installment id (kept so recorded payments stay attached). */
  id?: number
  label: string
  amount: string // rupees
  dueDate: string
  /** Paid on it so far (paise, active payments) — the amount can't go below this. */
  paid: number
  /** Any payment (even cancelled) is linked to it — it can't be removed. */
  locked: boolean
}

const isoPlusMonths = (start: Date, months: number): string => {
  const d = new Date(start.getFullYear(), start.getMonth() + months, start.getDate())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function FeePlanEditor({
  studentId,
  plan,
  defaultBatchId,
  onSaved,
  onCancel
}: {
  studentId: number
  plan: FeePlanView | null
  defaultBatchId?: number | null
  onSaved: () => void
  onCancel: () => void
}): JSX.Element {
  const { data: batches = [] } = useQuery({ queryKey: ['batches'], queryFn: () => api.batches.list() })
  const [name, setName] = useState(plan?.name ?? 'Course fee')
  const [batchId, setBatchId] = useState<number | null>(plan ? null : defaultBatchId ?? null)
  const [total, setTotal] = useState(paiseToRupees(plan?.totalAmount ?? 0))
  const [discount, setDiscount] = useState(paiseToRupees(plan?.discount ?? 0))
  const prefilled = useRef(false)

  // For a NEW plan with a preselected batch (the student's batch), fill the base
  // fee once the batch list has loaded.
  useEffect(() => {
    if (plan || prefilled.current || batchId == null || batches.length === 0) return
    const b = batches.find((x) => x.id === batchId)
    if (b) {
      prefilled.current = true
      setTotal(paiseToRupees(b.defaultFee))
      if (b.name) setName(`${b.courseName ? b.courseName + ' — ' : ''}${b.name} fee`)
    }
  }, [batches, batchId, plan])

  function onBatchChange(id: number | null): void {
    setBatchId(id)
    const b = batches.find((x) => x.id === id)
    if (b) {
      setTotal(paiseToRupees(b.defaultFee))
      setName(`${b.courseName ? b.courseName + ' — ' : ''}${b.name} fee`)
    }
  }
  const [notes, setNotes] = useState(plan?.notes ?? '')
  const [rows, setRows] = useState<Row[]>(
    plan
      ? plan.installments.map((i) => ({
          id: i.id,
          label: i.label ?? '',
          amount: paiseToRupees(i.dueAmount),
          dueDate: i.dueDate ?? '',
          paid: i.paid,
          locked: i.hasPayments
        }))
      : [{ label: 'Installment 1', amount: '', dueDate: todayIso(), paid: 0, locked: false }]
  )
  const [splitCount, setSplitCount] = useState('3')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const netPaise = rupeesToPaise(total) - rupeesToPaise(discount)
  const sumPaise = rows.reduce((s, r) => s + rupeesToPaise(r.amount), 0)
  const matches = sumPaise === netPaise
  const belowPaid = rows.filter((r) => rupeesToPaise(r.amount) < r.paid)
  const lockedRows = rows.filter((r) => r.locked)
  const lockedPaise = lockedRows.reduce((s, r) => s + rupeesToPaise(r.amount), 0)

  function setRow(i: number, key: keyof Row, value: string): void {
    setRows((rs) => {
      const next = rs.slice()
      next[i] = { ...next[i], [key]: value }
      return next
    })
  }

  /** Split the net fee equally into N installments. Installments that already
   *  have payments are kept as they are; only the rest of the fee is split. */
  function splitEqually(): void {
    const n = Math.max(1, Math.min(60, parseInt(splitCount, 10) || 1))
    const toSplit = netPaise - lockedPaise
    if (toSplit < 0) return setError('The installments that already have payments add up to more than the net fee')
    setError('')
    const per = Math.floor(toSplit / n)
    const remainder = toSplit - per * n
    const start = new Date()
    const next: Row[] = lockedRows.slice()
    for (let i = 0; i < n; i++) {
      next.push({
        label: `Installment ${next.length + 1}`,
        amount: paiseToRupees(per + (i === n - 1 ? remainder : 0)),
        dueDate: isoPlusMonths(start, i),
        paid: 0,
        locked: false
      })
    }
    setRows(next)
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setBusy(true)
    const input: FeePlanInput = {
      name: name.trim(),
      totalAmount: rupeesToPaise(total),
      discount: rupeesToPaise(discount),
      notes: notes.trim() || undefined,
      installments: rows.map((r) => ({
        id: r.id,
        label: r.label.trim() || undefined,
        dueAmount: rupeesToPaise(r.amount),
        dueDate: r.dueDate || undefined
      }))
    }
    try {
      await api.fees.savePlan({ studentId, input })
      onSaved()
    } catch (e2) {
      setError(errMessage(e2))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3">
          <label className="label">Course / Batch (fills the base fee)</label>
          <select className="input" value={batchId ?? ''} onChange={(e) => onBatchChange(Number(e.target.value) || null)}>
            <option value="">— Select a course / batch —</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.courseName ? `${b.courseName} — ` : ''}
                {b.name} ({fmtMoney(b.defaultFee)})
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          <label className="label">Plan name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Total fee (₹)</label>
          <input className="input" type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <div>
          <label className="label">Discount (₹)</label>
          <input className="input" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div>
          <label className="label">Net payable</label>
          <div className="input bg-slate-50 font-medium">{fmtMoney(netPaise)}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">Installments</span>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">{lockedRows.length > 0 ? 'Split the rest into' : 'Split into'}</span>
            <input
              className="input w-16 py-1"
              value={splitCount}
              onChange={(e) => setSplitCount(e.target.value.replace(/\D/g, ''))}
            />
            <button type="button" className="btn-outline py-1" onClick={splitEqually}>
              <Wand2 size={14} /> Generate
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => {
            const low = rupeesToPaise(r.amount) < r.paid
            return (
              <div key={r.id ?? `new-${i}`}>
                <div className="grid grid-cols-12 gap-2">
                  <input className="input col-span-4" placeholder="Label" value={r.label} onChange={(e) => setRow(i, 'label', e.target.value)} />
                  <input
                    className={`input col-span-3 ${low ? 'border-accent-500' : ''}`}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount"
                    aria-label={`Amount ${i + 1}`}
                    value={r.amount}
                    onChange={(e) => setRow(i, 'amount', e.target.value)}
                  />
                  <div className="col-span-4">
                    <DateField value={r.dueDate} onChange={(v) => setRow(i, 'dueDate', v)} />
                  </div>
                  <button
                    type="button"
                    className="col-span-1 text-slate-400 hover:text-accent-600 disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={r.locked}
                    title={r.locked ? 'Payments are recorded against this installment — change its amount instead' : 'Remove'}
                    onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {r.paid > 0 && (
                  <p className={`mt-0.5 pl-1 text-xs ${low ? 'text-accent-600' : 'text-slate-400'}`}>
                    {fmtMoney(r.paid)} already paid on this installment
                    {low ? ' — the amount can’t be less than that' : ''}
                    {!low && rupeesToPaise(r.amount) !== r.paid && (
                      <button type="button" className="ml-2 text-brand-600 hover:underline" onClick={() => setRow(i, 'amount', paiseToRupees(r.paid))}>
                        Set to amount paid
                      </button>
                    )}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="btn-ghost mt-2"
          onClick={() => setRows((rs) => [...rs, { label: `Installment ${rs.length + 1}`, amount: '', dueDate: '', paid: 0, locked: false }])}
        >
          <Plus size={14} /> Add installment
        </button>
        <p className={`mt-2 text-sm ${matches ? 'text-green-600' : 'text-accent-600'}`}>
          Installments total {fmtMoney(sumPaise)} / Net {fmtMoney(netPaise)}{' '}
          {matches ? '✓' : `— must match (${sumPaise < netPaise ? 'add' : 'remove'} ${fmtMoney(Math.abs(netPaise - sumPaise))})`}
        </p>
      </div>

      <div>
        <label className="label">Notes</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-sm text-accent-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy || !matches || belowPaid.length > 0}>
          {busy ? 'Saving…' : 'Save fee plan'}
        </button>
      </div>
    </form>
  )
}
