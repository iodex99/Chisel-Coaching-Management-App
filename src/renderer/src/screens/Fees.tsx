import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { ImportPanel } from './ImportPanel'
import { fmtDate, fmtMoney } from '../lib/format'

export default function Fees(): JSX.Element {
  const nav = useNavigate()
  const [importing, setImporting] = useState(false)
  const { data: summaries = [], isLoading } = useQuery({ queryKey: ['fee-summaries'], queryFn: () => api.fees.summaries() })

  const totals = summaries.reduce(
    (acc, s) => ({ net: acc.net + s.net, paid: acc.paid + s.paid, outstanding: acc.outstanding + s.outstanding }),
    { net: 0, paid: 0, outstanding: 0 }
  )

  return (
    <div className="p-8">
      <PageHeader
        title="Fees"
        subtitle="Fee plans and outstanding balances across all students."
        actions={
          <button className="btn-outline" onClick={() => setImporting(true)}>
            <Upload size={16} /> Import fee plans
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Total fees (net)" value={fmtMoney(totals.net)} />
        <Kpi label="Collected" value={fmtMoney(totals.paid)} tone="text-green-600" />
        <Kpi label="Outstanding" value={fmtMoney(totals.outstanding)} tone="text-accent-600" />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Adm. No</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3 text-right">Net</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3">Next due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!isLoading && summaries.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={7}>
                  No fee plans yet. Open a student and create a fee plan.
                </td>
              </tr>
            )}
            {summaries.map((s) => (
              <tr key={s.studentId} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/students/${s.studentId}`)}>
                <td className="px-4 py-3 font-mono text-slate-500">{s.admissionNo}</td>
                <td className="px-4 py-3 font-medium text-slate-700">
                  {s.firstName} {s.lastName}
                  {s.overdueCount > 0 && (
                    <span className="ml-2 rounded bg-accent-100 px-1.5 py-0.5 text-[10px] text-accent-700">
                      {s.overdueCount} overdue
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{s.batchName || '—'}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(s.net)}</td>
                <td className="px-4 py-3 text-right text-green-600">{fmtMoney(s.paid)}</td>
                <td className="px-4 py-3 text-right font-medium text-accent-600">{fmtMoney(s.outstanding)}</td>
                <td className="px-4 py-3 text-slate-500">{s.nextDueDate ? fmtDate(s.nextDueDate) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={importing} onClose={() => setImporting(false)} title="Import fee plans" width="max-w-lg">
        <ImportPanel kind="fees" />
      </Modal>
    </div>
  )
}

function Kpi({ label, value, tone = 'text-brand-700' }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="card p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  )
}
