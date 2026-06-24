import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Plus } from 'lucide-react'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtDate } from '../lib/format'
import { FeePlanPanel } from './FeePlan'
import { PaymentForm } from './PaymentForm'
import { PaymentHistory } from './PaymentHistory'
import { Modal } from '../components/Modal'

function Row({ label, value }: { label: string; value?: string | null }): JSX.Element {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value || '—'}</dd>
    </>
  )
}

export default function StudentDetail(): JSX.Element {
  const { id } = useParams()
  const nav = useNavigate()
  const studentId = Number(id)
  const [collecting, setCollecting] = useState(false)
  const { data: student, isLoading } = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => api.students.get({ id: studentId })
  })

  async function remove(): Promise<void> {
    if (!student) return
    if (!window.confirm(`Delete ${student.firstName} ${student.lastName ?? ''} and all their records?`)) return
    try {
      await api.students.remove({ id: studentId })
      void queryClient.invalidateQueries({ queryKey: ['students'] })
      nav('/students')
    } catch (e) {
      alert(errMessage(e))
    }
  }

  if (isLoading) return <div className="p-8 text-slate-400">Loading…</div>
  if (!student) return <div className="p-8 text-slate-400">Student not found.</div>

  return (
    <div className="p-8">
      <button className="btn-ghost mb-2 -ml-2" onClick={() => nav('/students')}>
        <ArrowLeft size={16} /> All students
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">
            {student.firstName} {student.lastName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Admission {student.admissionNo} · {student.batchName || 'No batch'} ·{' '}
            <span className="capitalize">{student.status}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => nav(`/students/${studentId}/edit`)}>
            <Pencil size={16} /> Edit
          </button>
          <button className="btn-outline text-accent-600" onClick={() => void remove()}>
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Profile</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <Row label="Phone" value={student.phone} />
            <Row label="Email" value={student.email} />
            <Row label="Gender" value={student.gender} />
            <Row label="Date of birth" value={student.dob ? fmtDate(student.dob) : null} />
            <Row label="Admission date" value={student.admissionDate ? fmtDate(student.admissionDate) : null} />
            <Row label="Address" value={student.address} />
            <Row label="Notes" value={student.notes} />
          </dl>
        </section>

        <section className="card p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Guardians</h2>
          {student.guardians.length === 0 ? (
            <p className="text-sm text-slate-400">No guardians recorded.</p>
          ) : (
            <ul className="space-y-3">
              {student.guardians.map((g) => (
                <li key={g.id} className="text-sm">
                  <div className="font-medium text-slate-700">
                    {g.name} {g.relation && <span className="text-slate-400">· {g.relation}</span>}
                  </div>
                  <div className="text-slate-500">
                    {[g.phone, g.email, g.occupation].filter(Boolean).join(' · ') || '—'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Fee plan</h2>
          <FeePlanPanel studentId={studentId} />
        </section>

        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payment history</h2>
            <button className="btn-primary" onClick={() => setCollecting(true)}>
              <Plus size={16} /> Collect payment
            </button>
          </div>
          <PaymentHistory filter={{ studentId, includeCancelled: true }} showStudent={false} />
        </section>
      </div>

      <Modal open={collecting} onClose={() => setCollecting(false)} title="Collect payment" width="max-w-2xl">
        {collecting && <PaymentForm studentId={studentId} onDone={() => setCollecting(false)} />}
      </Modal>
    </div>
  )
}
