import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Upload, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { ImportPanel } from './ImportPanel'
import { FeePlanEditor } from './FeePlan'
import { fmtDate, fmtMoney } from '../lib/format'

export default function Fees(): JSX.Element {
  const nav = useNavigate()
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const { data: summaries = [], isLoading } = useQuery({ queryKey: ['fee-summaries'], queryFn: () => api.fees.summaries() })

  const refreshFees = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['fee-summaries'] })
    void queryClient.invalidateQueries({ queryKey: ['fee-plan'] })
  }

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
          <div className="flex gap-2">
            <button className="btn-outline" onClick={() => setImporting(true)}>
              <Upload size={16} /> Import fee plans
            </button>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New fee plan
            </button>
          </div>
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
                  No fee plans yet. Use “New fee plan” above, or open a student and create one.
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

      <Modal open={creating} onClose={() => setCreating(false)} title="New fee plan" width="max-w-2xl">
        {creating && (
          <NewFeePlan
            onDone={() => {
              setCreating(false)
              refreshFees()
            }}
          />
        )}
      </Modal>
    </div>
  )
}

/** Pick a student, then build (or update) their fee structure with the same
 *  editor used on the student detail page. */
function NewFeePlan({ onDone }: { onDone: () => void }): JSX.Element {
  const [studentId, setStudentId] = useState<number | null>(null)
  const { data: students = [] } = useQuery({
    queryKey: ['students', 'fee-picker'],
    queryFn: () => api.students.list({ status: 'all' })
  })
  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['fee-plan', studentId],
    queryFn: () => api.fees.getPlan({ studentId: studentId as number }),
    enabled: studentId != null
  })

  if (studentId == null) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Choose a student, then build their fee structure.</p>
        <div>
          <label className="label">Student</label>
          <select className="input" defaultValue="" onChange={(e) => setStudentId(Number(e.target.value) || null)}>
            <option value="" disabled>
              Select a student…
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.admissionNo} — {s.firstName} {s.lastName ?? ''}
              </option>
            ))}
          </select>
        </div>
        {students.length === 0 && <p className="text-sm text-slate-400">No students yet — add a student first.</p>}
      </div>
    )
  }

  if (planLoading) return <p className="text-sm text-slate-400">Loading…</p>

  return (
    <div className="space-y-3">
      <button type="button" className="text-sm text-brand-600 hover:underline" onClick={() => setStudentId(null)}>
        ← Choose a different student
      </button>
      {plan && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">
          This student already has a fee plan — saving will update it.
        </p>
      )}
      <FeePlanEditor studentId={studentId} plan={plan ?? null} onSaved={onDone} onCancel={onDone} />
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
