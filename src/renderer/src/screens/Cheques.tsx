import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, Search, CheckCircle2, XCircle } from 'lucide-react'
import type { PdcInput, PdcStatus } from '@shared/types'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { DateField } from '../components/DateField'
import { SortableTh, toggleSort, sortRows, type Sort } from '../components/SortableTh'
import { fmtDate, fmtMoney, rupeesToPaise, todayIso } from '../lib/format'

const STATUS_BADGE: Record<PdcStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  deposited: 'bg-green-100 text-green-700',
  bounced: 'bg-accent-100 text-accent-700',
  cancelled: 'bg-slate-100 text-slate-500'
}

export default function Cheques(): JSX.Element {
  const [status, setStatus] = useState<PdcStatus | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'depositDate', dir: 'asc' })
  const onSort = (k: string): void => setSort((s) => toggleSort(s, k))

  const { data: cheques = [] } = useQuery({
    queryKey: ['pdc', status, search],
    queryFn: () => api.pdc.list({ status, search: search || undefined })
  })

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['pdc'] })
    void queryClient.invalidateQueries({ queryKey: ['pdc-due'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const today = todayIso()
  const rows = sortRows(cheques, sort, (c, key) =>
    key === 'student' ? c.studentName : key === 'amount' ? c.amount : key === 'bank' ? c.bank : key === 'status' ? c.status : c.depositDate
  )

  async function setStatusOf(id: number, s: PdcStatus): Promise<void> {
    setError('')
    try {
      await api.pdc.setStatus({ id, status: s })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }
  async function remove(id: number): Promise<void> {
    if (!window.confirm('Delete this cheque record?')) return
    try {
      await api.pdc.remove({ id })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Post-dated Cheques"
        subtitle="Cheques received now, to be deposited later — you'll be reminded when the date arrives."
        actions={
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Record cheque
          </button>
        }
      />
      {error && <p className="mb-3 text-sm text-accent-600">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Search by student, cheque no or bank" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={status} onChange={(e) => setStatus(e.target.value as PdcStatus | 'all')}>
          <option value="pending">Pending</option>
          <option value="deposited">Deposited</option>
          <option value="bounced">Bounced</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortableTh label="Deposit date" sortKey="depositDate" sort={sort} onSort={onSort} />
              <SortableTh label="Student" sortKey="student" sort={sort} onSort={onSort} />
              <th className="px-4 py-3">Cheque no</th>
              <SortableTh label="Bank" sortKey="bank" sort={sort} onSort={onSort} />
              <SortableTh label="Amount" sortKey="amount" sort={sort} onSort={onSort} align="right" />
              <SortableTh label="Status" sortKey="status" sort={sort} onSort={onSort} />
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={7}>
                  No cheques.
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const due = c.status === 'pending' && c.depositDate <= today
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className={`px-4 py-3 ${due ? 'font-medium text-accent-600' : 'text-slate-600'}`}>
                    {fmtDate(c.depositDate)}
                    {due && <span className="ml-2 rounded bg-accent-100 px-1.5 py-0.5 text-[10px] text-accent-700">deposit now</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{c.studentName || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.chequeNo || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{c.bank || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtMoney(c.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {c.status === 'pending' && (
                        <>
                          <button className="text-slate-400 hover:text-green-600" title="Mark deposited" onClick={() => void setStatusOf(c.id, 'deposited')}>
                            <CheckCircle2 size={16} />
                          </button>
                          <button className="text-slate-400 hover:text-accent-600" title="Mark bounced" onClick={() => void setStatusOf(c.id, 'bounced')}>
                            <XCircle size={16} />
                          </button>
                        </>
                      )}
                      <button className="text-slate-400 hover:text-accent-600" title="Delete" onClick={() => void remove(c.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Record post-dated cheque" width="max-w-lg">
        {adding && (
          <ChequeForm
            onSaved={() => {
              setAdding(false)
              refresh()
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </Modal>
    </div>
  )
}

function ChequeForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }): JSX.Element {
  const { data: students = [] } = useQuery({ queryKey: ['students', 'pdc-picker'], queryFn: () => api.students.list({ status: 'all' }) })
  const [studentId, setStudentId] = useState<number | ''>('')
  const [amount, setAmount] = useState('')
  const [chequeNo, setChequeNo] = useState('')
  const [bank, setBank] = useState('')
  const [depositDate, setDepositDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    const amt = rupeesToPaise(amount)
    if (amt <= 0) return setError('Enter an amount')
    if (!depositDate) return setError('Enter the deposit date')
    setBusy(true)
    const input: PdcInput = {
      studentId: studentId === '' ? null : studentId,
      amount: amt,
      chequeNo: chequeNo.trim() || undefined,
      bank: bank.trim() || undefined,
      depositDate,
      notes: notes.trim() || undefined
    }
    try {
      await api.pdc.create(input)
      onSaved()
    } catch (e2) {
      setError(errMessage(e2))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="label">Student</label>
        <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">— Not linked —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.admissionNo} — {s.firstName} {s.lastName ?? ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Amount (₹)</label>
        <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </div>
      <div>
        <label className="label">Deposit on</label>
        <DateField value={depositDate} onChange={setDepositDate} />
      </div>
      <div>
        <label className="label">Cheque no</label>
        <input className="input" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
      </div>
      <div>
        <label className="label">Bank</label>
        <input className="input" value={bank} onChange={(e) => setBank(e.target.value)} />
      </div>
      <div className="col-span-2">
        <label className="label">Notes</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {amount && <p className="col-span-2 text-xs text-slate-400">Recording {fmtMoney(rupeesToPaise(amount))} to deposit on the date above. It's a reminder only — record the payment when the cheque clears.</p>}
      {error && <p className="col-span-2 text-sm text-accent-600">{error}</p>}
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" className="btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save cheque'}
        </button>
      </div>
    </form>
  )
}
