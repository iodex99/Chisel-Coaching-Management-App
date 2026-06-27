import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import type { PaymentFilter, PaymentMode } from '@shared/types'
import { PAYMENT_MODES } from '@shared/constants'
import { api } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { DateField } from '../components/DateField'
import { PaymentForm } from './PaymentForm'
import { PaymentHistory } from './PaymentHistory'

export default function Payments(): JSX.Element {
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [mode, setMode] = useState<PaymentMode | 'all'>('all')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [cancelled, setCancelled] = useState<'active' | 'cancelled' | 'all'>('active')
  const [recording, setRecording] = useState(false)

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() })

  const filter: PaymentFilter = {
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    mode,
    accountId: accountId === '' ? undefined : accountId,
    cancelled
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
        <div className="w-40">
          <label className="label">From</label>
          <DateField value={dateFrom} onChange={setDateFrom} />
        </div>
        <div className="w-40">
          <label className="label">To</label>
          <DateField value={dateTo} onChange={setDateTo} />
        </div>
        <select className="input w-40" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode | 'all')}>
          <option value="all">All modes</option>
          {PAYMENT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select className="input w-44" value={accountId} onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="input w-40" value={cancelled} onChange={(e) => setCancelled(e.target.value as 'active' | 'cancelled' | 'all')}>
          <option value="active">Active only</option>
          <option value="cancelled">Cancelled only</option>
          <option value="all">All (incl. cancelled)</option>
        </select>
      </div>

      <PaymentHistory filter={filter} />

      <Modal open={recording} onClose={() => setRecording(false)} title="Record payment" width="max-w-2xl">
        {recording && <PaymentForm onDone={() => setRecording(false)} />}
      </Modal>
    </div>
  )
}
