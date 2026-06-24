import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Wand2 } from 'lucide-react'
import type { FeePlanView, FeePlanInput, InstallmentStatus } from '@shared/types'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtDate, fmtMoney, rupeesToPaise, paiseToRupees } from '../lib/format'
import { Modal } from '../components/Modal'

const STATUS_BADGE: Record<InstallmentStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-accent-100 text-accent-700'
}

export function FeePlanPanel({ studentId }: { studentId: number }): JSX.Element {
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
  label: string
  amount: string // rupees
  dueDate: string
}

function FeePlanEditor({
  studentId,
  plan,
  onSaved,
  onCancel
}: {
  studentId: number
  plan: FeePlanView | null
  onSaved: () => void
  onCancel: () => void
}): JSX.Element {
  const [name, setName] = useState(plan?.name ?? 'Course fee')
  const [total, setTotal] = useState(paiseToRupees(plan?.totalAmount ?? 0))
  const [discount, setDiscount] = useState(paiseToRupees(plan?.discount ?? 0))
  const [notes, setNotes] = useState(plan?.notes ?? '')
  const [rows, setRows] = useState<Row[]>(
    plan
      ? plan.installments.map((i) => ({ label: i.label ?? '', amount: paiseToRupees(i.dueAmount), dueDate: i.dueDate ?? '' }))
      : [{ label: 'Installment 1', amount: '', dueDate: new Date().toISOString().slice(0, 10) }]
  )
  const [splitCount, setSplitCount] = useState('3')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const netPaise = rupeesToPaise(total) - rupeesToPaise(discount)
  const sumPaise = rows.reduce((s, r) => s + rupeesToPaise(r.amount), 0)
  const matches = sumPaise === netPaise

  function setRow(i: number, key: keyof Row, value: string): void {
    setRows((rs) => {
      const next = rs.slice()
      next[i] = { ...next[i], [key]: value }
      return next
    })
  }

  function splitEqually(): void {
    const n = Math.max(1, Math.min(60, parseInt(splitCount, 10) || 1))
    const per = Math.floor(netPaise / n)
    const remainder = netPaise - per * n
    const start = new Date()
    const next: Row[] = []
    for (let i = 0; i < n; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, start.getDate())
      next.push({
        label: `Installment ${i + 1}`,
        amount: paiseToRupees(per + (i === n - 1 ? remainder : 0)),
        dueDate: d.toISOString().slice(0, 10)
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
            <span className="text-slate-400">Split into</span>
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
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input className="input col-span-4" placeholder="Label" value={r.label} onChange={(e) => setRow(i, 'label', e.target.value)} />
              <input className="input col-span-3" type="number" min="0" step="0.01" placeholder="Amount" value={r.amount} onChange={(e) => setRow(i, 'amount', e.target.value)} />
              <input className="input col-span-4" type="date" value={r.dueDate} onChange={(e) => setRow(i, 'dueDate', e.target.value)} />
              <button type="button" className="col-span-1 text-slate-400 hover:text-accent-600" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost mt-2" onClick={() => setRows((rs) => [...rs, { label: `Installment ${rs.length + 1}`, amount: '', dueDate: '' }])}>
          <Plus size={14} /> Add installment
        </button>
        <p className={`mt-2 text-sm ${matches ? 'text-green-600' : 'text-accent-600'}`}>
          Installments total {fmtMoney(sumPaise)} / Net {fmtMoney(netPaise)} {matches ? '✓' : '— must match'}
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
        <button type="submit" className="btn-primary" disabled={busy || !matches}>
          {busy ? 'Saving…' : 'Save fee plan'}
        </button>
      </div>
    </form>
  )
}
