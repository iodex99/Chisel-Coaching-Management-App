import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import type { SchoolSummary, SchoolInput } from '@shared/types'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { SortableTh, toggleSort, sortRows, type Sort } from '../components/SortableTh'

export default function Schools(): JSX.Element {
  const { data: schools = [], isLoading } = useQuery({ queryKey: ['schools'], queryFn: () => api.schools.list() })
  const [editing, setEditing] = useState<SchoolSummary | 'new' | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const onSort = (k: string): void => setSort((s) => toggleSort(s, k))

  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['schools'] })
  const q = search.trim().toLowerCase()
  const filtered = sortRows(
    schools.filter((s) => !q || [s.name, s.area, s.contact].some((x) => (x ?? '').toLowerCase().includes(q))),
    sort,
    (s, key) => (key === 'area' ? s.area : key === 'students' ? s.studentCount : key === 'status' ? (s.isActive ? 1 : 0) : s.name)
  )

  async function remove(s: SchoolSummary): Promise<void> {
    if (!window.confirm(`Delete school "${s.name}"?`)) return
    setError('')
    try {
      await api.schools.remove({ id: s.id })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="School Master"
        subtitle="The schools your students come from — used for enrolment and reports."
        actions={
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> New school
          </button>
        }
      />
      {error && <p className="mb-3 text-sm text-accent-600">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Search by school, area or contact" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortableTh label="School" sortKey="name" sort={sort} onSort={onSort} />
              <SortableTh label="Area" sortKey="area" sort={sort} onSort={onSort} />
              <th className="px-4 py-3">Contact</th>
              <SortableTh label="Students" sortKey="students" sort={sort} onSort={onSort} align="center" />
              <SortableTh label="Status" sortKey="status" sort={sort} onSort={onSort} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={6}>
                  {schools.length === 0 ? 'No schools yet. Add the schools your students come from.' : 'No schools found.'}
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-700">{s.name}</td>
                <td className="px-4 py-3 text-slate-500">{s.area || '—'}</td>
                <td className="px-4 py-3 text-slate-500">{s.contact || '—'}</td>
                <td className="px-4 py-3 text-center">{s.studentCount}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.isActive ? 'active' : 'inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="mr-2 text-slate-400 hover:text-brand-600" onClick={() => setEditing(s)} title="Edit">
                    <Pencil size={16} />
                  </button>
                  <button className="text-slate-400 hover:text-accent-600" onClick={() => void remove(s)} title="Delete">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New school' : 'Edit school'}>
        {editing !== null && (
          <SchoolForm
            school={editing === 'new' ? null : editing}
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

function SchoolForm({ school, onSaved, onCancel }: { school: SchoolSummary | null; onSaved: () => void; onCancel: () => void }): JSX.Element {
  const [name, setName] = useState(school?.name ?? '')
  const [area, setArea] = useState(school?.area ?? '')
  const [contact, setContact] = useState(school?.contact ?? '')
  const [isActive, setIsActive] = useState(school?.isActive ?? true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    const input: SchoolInput = { name: name.trim(), area: area.trim() || undefined, contact: contact.trim() || undefined, isActive }
    try {
      if (school) await api.schools.update({ id: school.id, input })
      else await api.schools.create(input)
      onSaved()
    } catch (e2) {
      setError(errMessage(e2))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">School name</label>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. St. Xavier's High School" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Area / locality</label>
          <input className="input" value={area} onChange={(e) => setArea(e.target.value)} />
        </div>
        <div>
          <label className="label">Contact</label>
          <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
      </label>
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
