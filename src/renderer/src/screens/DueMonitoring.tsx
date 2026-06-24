import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { DueItem } from '@shared/types'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { fmtDate, fmtMoney } from '../lib/format'

export default function DueMonitoring(): JSX.Element {
  const [days, setDays] = useState(30)
  const { data: overdue = [] } = useQuery({ queryKey: ['dues-overdue'], queryFn: () => api.dues.overdue() })
  const { data: upcoming = [] } = useQuery({ queryKey: ['dues-upcoming', days], queryFn: () => api.dues.upcoming({ days }) })

  return (
    <div className="p-8">
      <PageHeader title="Due Monitoring" subtitle="Overdue and upcoming fee installments." />

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-accent-600">
          Overdue ({overdue.length})
        </h2>
        <DueTable rows={overdue} emptyText="Nothing overdue. 🎉" highlight />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-700">
            Upcoming ({upcoming.length})
          </h2>
          <select className="input w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
            <option value={60}>Next 60 days</option>
          </select>
        </div>
        <DueTable rows={upcoming} emptyText="No upcoming dues in this window." />
      </section>
    </div>
  )
}

function DueTable({ rows, emptyText, highlight }: { rows: DueItem[]; emptyText: string; highlight?: boolean }): JSX.Element {
  const nav = useNavigate()
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Batch</th>
            <th className="px-4 py-3">Installment</th>
            <th className="px-4 py-3">Due date</th>
            <th className="px-4 py-3 text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-slate-400" colSpan={5}>
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((r) => (
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
