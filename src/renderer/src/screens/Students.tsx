import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Upload } from 'lucide-react'
import type { StudentFilter, StudentStatus } from '@shared/types'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { SortableTh, toggleSort, type Sort } from '../components/SortableTh'
import { Pager, PAGE_SIZE } from '../components/Pager'
import { Modal } from '../components/Modal'
import { ImportPanel } from './ImportPanel'

const STATUS_BADGE: Record<StudentStatus, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-slate-100 text-slate-500',
  dropped: 'bg-accent-100 text-accent-700',
  completed: 'bg-brand-100 text-brand-700'
}

export default function Students(): JSX.Element {
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [batchId, setBatchId] = useState<number | ''>('')
  const [schoolId, setSchoolId] = useState<number | ''>('')
  const [status, setStatus] = useState<StudentStatus | 'all'>('active')
  const [gender, setGender] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const onSort = (k: string): void => setSort((s) => toggleSort(s, k))

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [importing, setImporting] = useState(false)
  useEffect(() => setPage(0), [search, batchId, schoolId, status, gender, sort, pageSize])

  const { data: batches = [] } = useQuery({ queryKey: ['batches'], queryFn: () => api.batches.list() })
  const { data: schools = [] } = useQuery({ queryKey: ['schools'], queryFn: () => api.schools.list() })
  const { data: students = [], isLoading } = useQuery({
    queryKey: ['students', search, batchId, schoolId, status, gender, sort, page, pageSize],
    queryFn: () =>
      api.students.list({
        search: search || undefined,
        batchId: batchId === '' ? undefined : batchId,
        schoolId: schoolId === '' ? undefined : schoolId,
        status,
        gender: gender || undefined,
        sortBy: sort.key as StudentFilter['sortBy'],
        sortDir: sort.dir,
        limit: pageSize,
        offset: page * pageSize
      })
  })

  return (
    <div className="p-8">
      <PageHeader
        title="Students"
        subtitle="Student master records, admissions and guardians."
        actions={
          <>
            <button className="btn-outline" onClick={() => setImporting(true)}>
              <Upload size={16} /> Import
            </button>
            <button className="btn-primary" onClick={() => nav('/students/new')}>
              <Plus size={16} /> New student
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by name, admission no or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-48" value={batchId} onChange={(e) => setBatchId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | 'all')}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="dropped">Dropped</option>
          <option value="completed">Completed</option>
        </select>
        <select className="input w-36" value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">All genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
        <select className="input w-48" value={schoolId} onChange={(e) => setSchoolId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">All schools</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortableTh label="Adm. No" sortKey="admissionNo" sort={sort} onSort={onSort} />
              <SortableTh label="Name" sortKey="name" sort={sort} onSort={onSort} />
              <SortableTh label="Batch" sortKey="batch" sort={sort} onSort={onSort} />
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={5}>
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && students.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={5}>
                  No students found.
                </td>
              </tr>
            )}
            {students.map((s) => (
              <tr
                key={s.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => nav(`/students/${s.id}`)}
              >
                <td className="px-4 py-3 font-mono text-slate-500">{s.admissionNo}</td>
                <td className="px-4 py-3 font-medium text-slate-700">
                  {s.firstName} {s.lastName}
                </td>
                <td className="px-4 py-3 text-slate-500">{s.batchName || '—'}</td>
                <td className="px-4 py-3 text-slate-500">{s.phone || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[s.status]}`}>{s.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} setPage={setPage} count={students.length} pageSize={pageSize} setPageSize={setPageSize} />

      <Modal open={importing} onClose={() => setImporting(false)} title="Import students" width="max-w-lg">
        <ImportPanel kind="students" />
      </Modal>
    </div>
  )
}
