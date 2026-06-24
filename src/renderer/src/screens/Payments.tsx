import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import type { PaymentFilter, PaymentMode } from '@shared/types'
import { PAYMENT_MODES } from '@shared/constants'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { PaymentForm } from './PaymentForm'
import { PaymentHistory } from './PaymentHistory'

export default function Payments(): JSX.Element {
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [mode, setMode] = useState<PaymentMode | 'all'>('all')
  const [includeCancelled, setIncludeCancelled] = useState(false)
  const [recording, setRecording] = useState(false)

  const filter: PaymentFilter = {
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    mode,
    includeCancelled
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Payments"
        subtitle="Record fee collections and reprint receipts."
        actions={
          <button className="btn-primary" onClick={() => setRecording(true)}>
            <Plus size={16} /> Record payment
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Search receipt no or student" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="label">From</label>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <select className="input w-40" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode | 'all')}>
          <option value="all">All modes</option>
          {PAYMENT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeCancelled} onChange={(e) => setIncludeCancelled(e.target.checked)} /> Show cancelled
        </label>
      </div>

      <PaymentHistory filter={filter} />

      <Modal open={recording} onClose={() => setRecording(false)} title="Record payment" width="max-w-2xl">
        {recording && <PaymentForm onDone={() => setRecording(false)} />}
      </Modal>
    </div>
  )
}
