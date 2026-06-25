import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Upload, Plus, Search } from 'lucide-react'
import { api } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { SortableTh, toggleSort, sortRows, type Sort } from '../components/SortableTh'
import { ImportPanel } from './ImportPanel'
import { FeePlanEditor } from './FeePlan'
import { fmtDate, fmtMoney } from '../lib/format'

export default function Fees(): JSX.Element {
  const nav = useNavigate()
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [batchName, setBatchName] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'outstanding' | 'overdue' | 'paid'>('all')
  const [sort, setSort] = useState<Sort>({ key: 'outstanding', dir: 'desc' })
  const onSort = (k: string): void => setSort((s) => toggleSort(s, k))
  const { data: summaries = [], isLoading } = useQuery({ queryKey: ['fee-summaries'], queryFn: () => api.fees.summaries() })

  const refreshFees = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['fee-summaries'] })
    void queryClient.invalidateQueries({ queryKey: ['fee-plan'] })
  }

  const batchNames = Array.from(new Set(summaries.map((s) => s.batchName).filter(Boolean))) as string[]
  const q = search.trim().toLowerCase()
  const rows = sortRows(
    summaries.filter((s) => {
      if (batchName && s.batchName !== batchName) return false
      if (statusFilter === 'outstanding' && s.outstanding <= 0) return false
      if (statusFilter === 'overdue' && s.overdueCount <= 0) return false
      if (statusFilter === 'paid' && s.outstanding > 0) return false
      if (!q) return true
      return (
        s.admissionNo.toLowerCase().includes(q) ||
        `${s.firstName} ${s.lastName ?? ''}`.toLowerCase().includes(q) ||
        (s.batchName ?? '').toLowerCase().includes(q)
      )
    }),
    sort,
    (s, key) =>
      key === 'admissionNo'
        ? s.admissionNo
        : key === 'student'
          ? `${s.firstName} ${s.lastName ?? ''}`
          : key === 'batch'
            ? s.batchName
            : key === 'net'
              ? s.net
              : key === 'paid'
                ? s.paid
                : key === 'nextDue'
                  ? s.nextDueDate
                  : s.outstanding
  )

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

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Search by student, admission no or batch" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-48" value={batchName} onChange={(e) => setBatchName(e.target.value)}>
          <option value="">All batches</option>
          {batchNames.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select className="input w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'outstanding' | 'overdue' | 'paid')}>
          <option value="all">All</option>
          <option value="outstanding">Has outstanding</option>
          <option value="overdue">Has overdue</option>
          <option value="paid">Fully paid</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortableTh label="Adm. No" sortKey="admissionNo" sort={sort} onSort={onSort} />
              <SortableTh label="Student" sortKey="student" sort={sort} onSort={onSort} />
              <SortableTh label="Batch" sortKey="batch" sort={sort} onSort={onSort} />
              <SortableTh label="Net" sortKey="net" sort={sort} onSort={onSort} align="right" />
              <SortableTh label="Paid" sortKey="paid" sort={sort} onSort={onSort} align="right" />
              <SortableTh label="Outstanding" sortKey="outstanding" sort={sort} onSort={onSort} align="right" />
              <SortableTh label="Next due" sortKey="nextDue" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!isLoading && rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={7}>
                  {summaries.length === 0
                    ? 'No fee plans yet. Use “New fee plan” above, or open a student and create one.'
                    : 'No fee plans match your filters.'}
                </td>
              </tr>
            )}
            {rows.map((s) => (
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

/** Pick a student (with search), then build (or update) their fee structure with
 *  the same editor used on the student detail page. */
function NewFeePlan({ onDone }: { onDone: () => void }): JSX.Element {
  const [studentId, setStudentId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const { data: students = [] } = useQuery({
    queryKey: ['students', 'fee-picker'],
    queryFn: () => api.students.list({ status: 'all' })
  })
  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['fee-plan', studentId],
    queryFn: () => api.fees.getPlan({ studentId: studentId as number }),
    enabled: studentId != null
  })

  const selected = students.find((s) => s.id === studentId)

  if (studentId == null) {
    const q = search.trim().toLowerCase()
    const matches = q
      ? students.filter(
          (s) =>
            s.admissionNo.toLowerCase().includes(q) ||
            `${s.firstName} ${s.lastName ?? ''}`.toLowerCase().includes(q) ||
            (s.phone ?? '').includes(q)
        )
      : students
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Search for a student, then build their fee structure.</p>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            autoFocus
            placeholder="Search by name, admission no or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {matches.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">
              {students.length === 0 ? 'No students yet — add a student first.' : 'No students match your search.'}
            </p>
          ) : (
            matches.map((s) => (
              <button
                key={s.id}
                type="button"
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                onClick={() => setStudentId(s.id)}
              >
                <span className="font-medium text-slate-700">
                  {s.firstName} {s.lastName ?? ''}
                </span>
                <span className="text-xs text-slate-400">
                  {s.admissionNo}
                  {s.batchName ? ` · ${s.batchName}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  if (planLoading) return <p className="text-sm text-slate-400">Loading…</p>

  return (
    <div className="space-y-3">
      <button type="button" className="text-sm text-brand-600 hover:underline" onClick={() => setStudentId(null)}>
        ← Choose a different student
      </button>
      <p className="text-sm text-slate-500">
        Fee plan for <span className="font-medium text-slate-700">{selected?.firstName} {selected?.lastName ?? ''}</span>
      </p>
      {plan && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-700">
          This student already has a fee plan — saving will update it.
        </p>
      )}
      <FeePlanEditor
        studentId={studentId}
        plan={plan ?? null}
        defaultBatchId={selected?.batchId ?? null}
        onSaved={onDone}
        onCancel={onDone}
      />
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
