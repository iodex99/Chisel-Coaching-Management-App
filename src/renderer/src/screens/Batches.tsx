import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import type { BatchSummary, BatchInput, BatchStatus } from '@shared/types'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtMoney, rupeesToPaise, paiseToRupees } from '../lib/format'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { DateField } from '../components/DateField'
import { FySelect } from '../components/FySelect'
import { SortableTh, toggleSort, sortRows, type Sort } from '../components/SortableTh'

export default function Batches(): JSX.Element {
  const { data: batches = [], isLoading } = useQuery({ queryKey: ['batches'], queryFn: () => api.batches.list() })
  const [editing, setEditing] = useState<BatchSummary | 'new' | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | BatchStatus>('all')
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const onSort = (k: string): void => setSort((s) => toggleSort(s, k))

  const q = search.trim().toLowerCase()
  const filtered = sortRows(
    batches.filter(
      (b) =>
        (statusFilter === 'all' || b.status === statusFilter) &&
        (!q || [b.name, b.courseName, b.academicYear].some((x) => (x ?? '').toLowerCase().includes(q)))
    ),
    sort,
    (b, key) =>
      key === 'course'
        ? b.courseName
        : key === 'year'
          ? b.academicYear
          : key === 'fee'
            ? b.defaultFee
            : key === 'students'
              ? b.studentCount
              : key === 'status'
                ? b.status
                : b.name
  )

  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['batches'] })

  async function remove(b: BatchSummary): Promise<void> {
    if (!window.confirm(`Delete batch "${b.name}"?`)) return
    setError('')
    try {
      await api.batches.remove({ id: b.id })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Batches"
        subtitle="Courses and batches students are enrolled into."
        actions={
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> New batch
          </button>
        }
      />
      {error && <p className="mb-3 text-sm text-accent-600">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Search by batch, course or year" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | BatchStatus)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortableTh label="Batch" sortKey="name" sort={sort} onSort={onSort} />
              <SortableTh label="Course" sortKey="course" sort={sort} onSort={onSort} />
              <SortableTh label="Year" sortKey="year" sort={sort} onSort={onSort} />
              <SortableTh label="Default fee" sortKey="fee" sort={sort} onSort={onSort} align="right" />
              <SortableTh label="Students" sortKey="students" sort={sort} onSort={onSort} align="center" />
              <SortableTh label="Status" sortKey="status" sort={sort} onSort={onSort} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={7}>
                  No batches found.
                </td>
              </tr>
            )}
            {filtered.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-700">{b.name}</td>
                <td className="px-4 py-3 text-slate-500">{b.courseName || '—'}</td>
                <td className="px-4 py-3 text-slate-500">{b.academicYear || '—'}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(b.defaultFee)}</td>
                <td className="px-4 py-3 text-center">{b.studentCount}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      b.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="mr-2 text-slate-400 hover:text-brand-600" onClick={() => setEditing(b)} title="Edit">
                    <Pencil size={16} />
                  </button>
                  <button className="text-slate-400 hover:text-accent-600" onClick={() => void remove(b)} title="Delete">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New batch' : 'Edit batch'}
      >
        {editing !== null && (
          <BatchForm
            batch={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null)
              refresh()
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  )
}

function BatchForm({
  batch,
  onSaved,
  onCancel
}: {
  batch: BatchSummary | null
  onSaved: () => void
  onCancel: () => void
}): JSX.Element {
  const [name, setName] = useState(batch?.name ?? '')
  const [courseName, setCourseName] = useState(batch?.courseName ?? '')
  const [academicYear, setAcademicYear] = useState(batch?.academicYear ?? '')
  const [defaultFee, setDefaultFee] = useState(paiseToRupees(batch?.defaultFee ?? 0))
  const [startDate, setStartDate] = useState(batch?.startDate ?? '')
  const [endDate, setEndDate] = useState(batch?.endDate ?? '')
  const [status, setStatus] = useState<BatchStatus>(batch?.status ?? 'active')
  const [notes, setNotes] = useState(batch?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    const input: BatchInput = {
      name: name.trim(),
      courseName: courseName.trim() || undefined,
      academicYear: academicYear.trim() || undefined,
      defaultFee: rupeesToPaise(defaultFee),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status,
      notes: notes.trim() || undefined
    }
    try {
      if (batch) await api.batches.update({ id: batch.id, input })
      else await api.batches.create(input)
      onSaved()
    } catch (e2) {
      setError(errMessage(e2))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">Batch name</label>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NEET Morning 2026" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Course</label>
          <input className="input" value={courseName} onChange={(e) => setCourseName(e.target.value)} />
        </div>
        <div>
          <label className="label">Academic year</label>
          <FySelect value={academicYear} onChange={setAcademicYear} includeBlank blankLabel="— Not set —" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Default fee (₹)</label>
          <input className="input" type="number" min="0" step="0.01" value={defaultFee} onChange={(e) => setDefaultFee(e.target.value)} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as BatchStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Start date</label>
          <DateField value={startDate} onChange={setStartDate} />
        </div>
        <div>
          <label className="label">End date</label>
          <DateField value={endDate} onChange={setEndDate} />
        </div>
      </div>
      <div>
        <label className="label">Notes</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="text-sm text-accent-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
