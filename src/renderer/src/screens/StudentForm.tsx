import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import type { GuardianInput, StudentInput, StudentStatus } from '@shared/types'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { PageHeader } from '../components/PageHeader'
import { DateField } from '../components/DateField'
import { todayIso } from '../lib/format'

const EMPTY: StudentInput = {
  admissionNo: '',
  firstName: '',
  lastName: '',
  gender: '',
  dob: '',
  phone: '',
  email: '',
  address: '',
  batchId: null,
  admissionDate: '',
  status: 'active',
  notes: '',
  guardians: []
}

export default function StudentForm(): JSX.Element {
  const { id } = useParams()
  const nav = useNavigate()
  const editing = Boolean(id)
  const studentId = id ? Number(id) : undefined

  const [form, setForm] = useState<StudentInput>(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: batches = [] } = useQuery({ queryKey: ['batches'], queryFn: () => api.batches.list() })
  const { data: student } = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => api.students.get({ id: studentId as number }),
    enabled: editing
  })

  // Prefill: existing student in edit mode, or a suggested admission no for new.
  useEffect(() => {
    if (editing && student) {
      setForm({
        admissionNo: student.admissionNo,
        firstName: student.firstName,
        lastName: student.lastName ?? '',
        gender: student.gender ?? '',
        dob: student.dob ?? '',
        phone: student.phone ?? '',
        email: student.email ?? '',
        address: student.address ?? '',
        batchId: student.batchId,
        admissionDate: student.admissionDate ?? '',
        status: student.status,
        notes: student.notes ?? '',
        guardians: student.guardians.map((g) => ({
          name: g.name,
          relation: g.relation ?? '',
          phone: g.phone ?? '',
          email: g.email ?? '',
          occupation: g.occupation ?? ''
        }))
      })
    }
  }, [editing, student])

  useEffect(() => {
    if (!editing) {
      api.students.nextAdmissionNo().then((no) =>
        setForm((f) => ({ ...f, admissionNo: no, admissionDate: todayIso() }))
      )
    }
  }, [editing])

  function set<K extends keyof StudentInput>(key: K, value: StudentInput[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setGuardian(i: number, key: keyof GuardianInput, value: string): void {
    setForm((f) => {
      const guardians = f.guardians.slice()
      guardians[i] = { ...guardians[i], [key]: value }
      return { ...f, guardians }
    })
  }

  function addGuardian(): void {
    setForm((f) => ({ ...f, guardians: [...f.guardians, { name: '', relation: '', phone: '' }] }))
  }

  function removeGuardian(i: number): void {
    setForm((f) => ({ ...f, guardians: f.guardians.filter((_, idx) => idx !== i) }))
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (!form.admissionNo.trim()) return setError('Admission number is required')
    if (!form.admissionDate?.trim()) return setError('Admission date is required')
    if (!form.firstName.trim()) return setError('First name is required')
    if (!form.lastName?.trim()) return setError('Last name is required')
    if (!form.gender?.trim()) return setError('Gender is required')
    setBusy(true)
    const input: StudentInput = {
      ...form,
      guardians: form.guardians.filter((g) => g.name.trim())
    }
    try {
      const saved = editing
        ? await api.students.update({ id: studentId as number, input })
        : await api.students.create(input)
      void queryClient.invalidateQueries({ queryKey: ['students'] })
      void queryClient.invalidateQueries({ queryKey: ['batches'] })
      nav(`/students/${saved.id}`)
    } catch (e2) {
      setError(errMessage(e2))
      setBusy(false)
    }
  }

  return (
    <div className="p-8">
      <button className="btn-ghost mb-2 -ml-2" onClick={() => nav(-1)}>
        <ArrowLeft size={16} /> Back
      </button>
      <PageHeader title={editing ? 'Edit student' : 'New student'} />

      <form onSubmit={submit} className="max-w-3xl space-y-6">
        <section className="card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Admission number *</label>
              <input className="input" value={form.admissionNo} onChange={(e) => set('admissionNo', e.target.value)} />
            </div>
            <div>
              <label className="label">Admission date *</label>
              <DateField value={form.admissionDate ?? ''} onChange={(v) => set('admissionDate', v)} />
            </div>
            <div>
              <label className="label">First name *</label>
              <input className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </div>
            <div>
              <label className="label">Last name *</label>
              <input className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </div>
            <div>
              <label className="label">Gender *</label>
              <select className="input" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Date of birth</label>
              <DateField value={form.dob ?? ''} onChange={(v) => set('dob', v)} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div>
              <label className="label">Batch</label>
              <select
                className="input"
                value={form.batchId ?? ''}
                onChange={(e) => set('batchId', e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">— Unassigned —</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => set('status', e.target.value as StudentStatus)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="dropped">Dropped</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <input className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
        </section>

        <section className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Parents / guardians</h2>
            <button type="button" className="btn-outline" onClick={addGuardian} disabled={form.guardians.length >= 5}>
              <Plus size={16} /> Add
            </button>
          </div>
          {form.guardians.length === 0 && <p className="text-sm text-slate-400">No guardians added.</p>}
          <div className="space-y-3">
            {form.guardians.map((g, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input className="input col-span-3" placeholder="Name" value={g.name} onChange={(e) => setGuardian(i, 'name', e.target.value)} />
                <input className="input col-span-2" placeholder="Relation" value={g.relation ?? ''} onChange={(e) => setGuardian(i, 'relation', e.target.value)} />
                <input className="input col-span-3" placeholder="Phone" value={g.phone ?? ''} onChange={(e) => setGuardian(i, 'phone', e.target.value)} />
                <input className="input col-span-3" placeholder="Occupation" value={g.occupation ?? ''} onChange={(e) => setGuardian(i, 'occupation', e.target.value)} />
                <button type="button" className="col-span-1 text-slate-400 hover:text-accent-600" onClick={() => removeGuardian(i)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {error && <p className="text-sm text-accent-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => nav(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create student'}
          </button>
        </div>
      </form>
    </div>
  )
}
