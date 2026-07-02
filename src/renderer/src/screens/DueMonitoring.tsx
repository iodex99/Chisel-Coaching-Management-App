import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, CheckCircle2 } from 'lucide-react'
import type { DueItem } from '@shared/types'
import { api } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { PageHeader } from '../components/PageHeader'
import { SortableTh, toggleSort, sortRows, type Sort } from '../components/SortableTh'
import { fmtDate, fmtMoney, todayIso } from '../lib/format'

export default function DueMonitoring(): JSX.Element {
  const nav = useNavigate()
  const [days, setDays] = useState(30)
  const [search, setSearch] = useState('')
  const [batchName, setBatchName] = useState('')
  const { data: overdue = [] } = useQuery({ queryKey: ['dues-overdue'], queryFn: () => api.dues.overdue() })
  const { data: upcoming = [] } = useQuery({ queryKey: ['dues-upcoming', days], queryFn: () => api.dues.upcoming({ days }) })
  const { data: pdcDue = [] } = useQuery({ queryKey: ['pdc-due'], queryFn: () => api.pdc.due({ days: 14 }) })

  async function markDeposited(id: number): Promise<void> {
    await api.pdc.setStatus({ id, status: 'deposited' })
    void queryClient.invalidateQueries({ queryKey: ['pdc-due'] })
    void queryClient.invalidateQueries({ queryKey: ['pdc'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const q = search.trim().toLowerCase()
  const matches = (r: DueItem): boolean =>
    (!batchName || r.batchName === batchName) &&
    (!q || r.studentName.toLowerCase().includes(q) || r.admissionNo.toLowerCase().includes(q))
  const batchNames = Array.from(new Set([...overdue, ...upcoming].map((r) => r.batchName).filter(Boolean))) as string[]

  return (
    <div className="p-8">
      <PageHeader title="Due Monitoring" subtitle="Overdue and upcoming fee installments." />

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Search by student or admission no" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-48" value={batchName} onChange={(e) => setBatchName(e.target.value)}>
          <option value="">All batches</option>
          {batchNames.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {pdcDue.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-amber-600">
              Cheques to deposit ({pdcDue.length})
            </h2>
            <button className="text-sm text-brand-600 hover:underline" onClick={() => nav('/cheques')}>
              Manage cheques →
            </button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Deposit date</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Cheque no</th>
                  <th className="px-4 py-3">Bank</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pdcDue.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className={`px-4 py-3 ${c.depositDate <= todayIso() ? 'font-medium text-accent-600' : 'text-slate-600'}`}>
                      {fmtDate(c.depositDate)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.studentName || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.chequeNo || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{c.bank || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmtMoney(c.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="inline-flex items-center gap-1 text-xs text-green-600 hover:underline" onClick={() => void markDeposited(c.id)}>
                        <CheckCircle2 size={14} /> Deposited
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-accent-600">
          Overdue ({overdue.filter(matches).length})
        </h2>
        <DueTable rows={overdue.filter(matches)} emptyText="Nothing overdue. 🎉" highlight />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-700">
            Upcoming ({upcoming.filter(matches).length})
          </h2>
          <select className="input w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
            <option value={60}>Next 60 days</option>
          </select>
        </div>
        <DueTable rows={upcoming.filter(matches)} emptyText="No upcoming dues in this window." />
      </section>
    </div>
  )
}

function DueTable({ rows, emptyText, highlight }: { rows: DueItem[]; emptyText: string; highlight?: boolean }): JSX.Element {
  const nav = useNavigate()
  const [sort, setSort] = useState<Sort>({ key: 'dueDate', dir: 'asc' })
  const onSort = (k: string): void => setSort((s) => toggleSort(s, k))
  const sorted = sortRows(rows, sort, (r, key) =>
    key === 'student' ? r.studentName : key === 'batch' ? r.batchName : key === 'outstanding' ? r.outstanding : r.dueDate
  )

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <SortableTh label="Student" sortKey="student" sort={sort} onSort={onSort} />
            <SortableTh label="Batch" sortKey="batch" sort={sort} onSort={onSort} />
            <th className="px-4 py-3">Installment</th>
            <SortableTh label="Due date" sortKey="dueDate" sort={sort} onSort={onSort} />
            <SortableTh label="Outstanding" sortKey="outstanding" sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-slate-400" colSpan={5}>
                {emptyText}
              </td>
            </tr>
          )}
          {sorted.map((r) => (
            <tr key={r.installmentId} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/students/${r.studentId}`)}>
              <td className="px-4 py-3 font-medium text-slate-700">
                {r.studentName} <span className="font-mono text-xs text-slate-400">({r.admissionNo})</span>
              </td>
              <td className="px-4 py-3 text-slate-500">{r.batchName || '—'}</td>
              <td className="px-4 py-3 text-slate-500">{r.label}</td>
              <td className={`px-4 py-3 ${highlight ? 'font-medium text-accent-600' : 'text-slate-500'}`}>{fmtDate(r.dueDate)}</td>
              <td className="px-4 py-3 text-right font-medium">{fmtMoney(r.outstanding)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
