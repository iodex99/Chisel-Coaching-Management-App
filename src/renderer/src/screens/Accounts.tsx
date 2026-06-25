import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Account, AccountInput, AccountType } from '@shared/types'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtMoney, rupeesToPaise, paiseToRupees } from '../lib/format'
import { currentFy, fyOptions } from '../lib/fy'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'

/** The per-vendor limit that applies to an account this financial year. */
function effectiveLimit(a: Account): number {
  const fy = currentFy()
  return a.vendorFyLimits.find((l) => l.fy === fy)?.limit ?? a.vendorFyLimit
}

const TYPES: { value: AccountType; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'upi', label: 'UPI' },
  { value: 'other', label: 'Other' }
]

export default function Accounts(): JSX.Element {
  const { data: accounts = [], isLoading } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() })
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [error, setError] = useState('')

  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['accounts'] })

  async function remove(a: Account): Promise<void> {
    if (!window.confirm(`Delete account "${a.name}"?`)) return
    setError('')
    try {
      await api.accounts.remove({ id: a.id })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Accounts"
        subtitle="Cash, bank and UPI accounts that money flows in and out of."
        actions={
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} /> New account
          </button>
        }
      />
      {error && <p className="mb-3 text-sm text-accent-600">{error}</p>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Opening balance</th>
              <th className="px-4 py-3 text-right">Vendor limit / FY</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && accounts.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={6}>
                  No accounts yet. Create one to start recording payments.
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-700">{a.name}</td>
                <td className="px-4 py-3 uppercase text-slate-500">{a.type}</td>
                <td className="px-4 py-3 text-right">{fmtMoney(a.openingBalance)}</td>
                <td className="px-4 py-3 text-right text-slate-500">
                  {effectiveLimit(a) > 0 ? fmtMoney(effectiveLimit(a)) : '—'}
                  {a.vendorFyLimits.length > 0 && (
                    <span className="ml-1 text-[10px] uppercase text-slate-400" title="Varies by financial year">
                      yr
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {a.isActive ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">Active</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="mr-2 text-slate-400 hover:text-brand-600" onClick={() => setEditing(a)} title="Edit">
                    <Pencil size={16} />
                  </button>
                  <button className="text-slate-400 hover:text-accent-600" onClick={() => void remove(a)} title="Delete">
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
        title={editing === 'new' ? 'New account' : 'Edit account'}
      >
        {editing !== null && (
          <AccountForm
            account={editing === 'new' ? null : editing}
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

function AccountForm({
  account,
  onSaved,
  onCancel
}: {
  account: Account | null
  onSaved: () => void
  onCancel: () => void
}): JSX.Element {
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'cash')
  const [opening, setOpening] = useState(paiseToRupees(account?.openingBalance ?? 0))
  const [isActive, setIsActive] = useState(account?.isActive ?? true)
  const [notes, setNotes] = useState(account?.notes ?? '')
  const [vendorLimit, setVendorLimit] = useState(paiseToRupees(account?.vendorFyLimit ?? 0))
  const [fyLimits, setFyLimits] = useState<{ fy: string; amount: string }[]>(
    account?.vendorFyLimits.map((l) => ({ fy: l.fy, amount: paiseToRupees(l.limit) })) ?? []
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const fyChoices = fyOptions()

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    const input: AccountInput = {
      name: name.trim(),
      type,
      openingBalance: rupeesToPaise(opening),
      isActive,
      notes: notes.trim() || undefined,
      vendorFyLimit: rupeesToPaise(vendorLimit),
      vendorFyLimits: fyLimits.filter((r) => r.fy).map((r) => ({ fy: r.fy, limit: rupeesToPaise(r.amount) }))
    }
    try {
      if (account) await api.accounts.update({ id: account.id, input })
      else await api.accounts.create(input)
      onSaved()
    } catch (e2) {
      setError(errMessage(e2))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">Name</label>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Opening balance (₹)</label>
          <input className="input" type="number" min="0" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Notes</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div>
        <label className="label">Default per-vendor limit per financial year (₹)</label>
        <input className="input" type="number" min="0" step="0.01" value={vendorLimit} onChange={(e) => setVendorLimit(e.target.value)} />
        <p className="mt-1 text-xs text-slate-400">
          Caps how much can be paid to any single vendor from this account in a financial year (Apr–Mar). Used for
          years without a specific limit below. 0 = no limit.
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="label mb-0">Limits by financial year (optional)</label>
          <button
            type="button"
            className="btn-ghost py-0.5 text-xs"
            onClick={() => setFyLimits((rows) => [...rows, { fy: currentFy(), amount: '' }])}
          >
            <Plus size={14} /> Add year
          </button>
        </div>
        {fyLimits.length === 0 && <p className="text-xs text-slate-400">No year-specific limits — the default applies.</p>}
        <div className="space-y-2">
          {fyLimits.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                className="input w-32"
                value={row.fy}
                onChange={(e) => setFyLimits((rows) => rows.map((r, idx) => (idx === i ? { ...r, fy: e.target.value } : r)))}
              >
                {fyChoices.includes(row.fy) ? null : <option value={row.fy}>{row.fy}</option>}
                {fyChoices.map((fy) => (
                  <option key={fy} value={fy}>
                    {fy}
                  </option>
                ))}
              </select>
              <input
                className="input flex-1"
                type="number"
                min="0"
                step="0.01"
                placeholder="Limit ₹ (0 = no limit)"
                value={row.amount}
                onChange={(e) => setFyLimits((rows) => rows.map((r, idx) => (idx === i ? { ...r, amount: e.target.value } : r)))}
              />
              <button type="button" className="text-slate-400 hover:text-accent-600" onClick={() => setFyLimits((rows) => rows.filter((_, idx) => idx !== i))}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
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
