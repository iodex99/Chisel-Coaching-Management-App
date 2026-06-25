import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Tags, Truck, Search } from 'lucide-react'
import type { ExpenseRecord, ExpenseInput, PaymentMode } from '@shared/types'
import { PAYMENT_MODES } from '@shared/constants'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtDate, fmtMoney, rupeesToPaise, paiseToRupees, todayIso } from '../lib/format'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { Pager, PAGE_SIZE } from '../components/Pager'
import { DateField } from '../components/DateField'

const todayStr = (): string => todayIso()
const modeLabel = (m: PaymentMode): string => PAYMENT_MODES.find((x) => x.value === m)?.label ?? m

export default function Expenses(): JSX.Element {
  const [editing, setEditing] = useState<ExpenseRecord | 'new' | null>(null)
  const [manage, setManage] = useState<'' | 'categories' | 'vendors'>('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: summary } = useQuery({ queryKey: ['expense-summary'], queryFn: () => api.expenses.summary() })
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: () => api.expenseCategories.list() })
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [search, categoryId, dateFrom, dateTo])
  const filter = {
    search: search || undefined,
    categoryId: categoryId === '' ? undefined : categoryId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined
  }
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', filter, page],
    queryFn: () => api.expenses.list({ ...filter, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
  })

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['expenses'] })
    void queryClient.invalidateQueries({ queryKey: ['expense-summary'] })
  }

  async function remove(e: ExpenseRecord): Promise<void> {
    if (!window.confirm('Delete this expense?')) return
    try {
      await api.expenses.remove({ id: e.id })
      refresh()
    } catch (err) {
      alert(errMessage(err))
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Expenses"
        subtitle="Day-to-day business expenses."
        actions={
          <>
            <button className="btn-outline" onClick={() => setManage('categories')}>
              <Tags size={16} /> Categories
            </button>
            <button className="btn-outline" onClick={() => setManage('vendors')}>
              <Truck size={16} /> Vendors
            </button>
            <button className="btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> Record expense
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="This month" value={fmtMoney(summary?.monthTotal)} tone="text-accent-600" />
        <Kpi label="All-time total" value={fmtMoney(summary?.allTimeTotal)} />
        <div className="card p-5">
          <div className="text-sm text-slate-500">Top categories (this month)</div>
          <div className="mt-2 space-y-1 text-sm">
            {summary && summary.byCategory.length === 0 && <span className="text-slate-400">No expenses yet</span>}
            {summary?.byCategory.slice(0, 3).map((c) => (
              <div key={c.category} className="flex justify-between">
                <span className="text-slate-600">{c.category}</span>
                <span className="font-medium">{fmtMoney(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Search payee / vendor / remarks" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="w-40">
          <label className="label">From</label>
          <DateField value={dateFrom} onChange={setDateFrom} />
        </div>
        <div className="w-40">
          <label className="label">To</label>
          <DateField value={dateTo} onChange={setDateTo} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Payee / Vendor</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={7}>
                  No expenses found.
                </td>
              </tr>
            )}
            {expenses.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">{fmtDate(e.expenseDate)}</td>
                <td className="px-4 py-3 text-slate-500">{e.categoryName || '—'}</td>
                <td className="px-4 py-3 text-slate-700">{e.vendorName || e.payee || '—'}</td>
                <td className="px-4 py-3 text-right font-medium">{fmtMoney(e.amount)}</td>
                <td className="px-4 py-3">{modeLabel(e.mode)}</td>
                <td className="px-4 py-3 text-slate-500">{e.accountName || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button className="mr-2 text-slate-400 hover:text-brand-600" onClick={() => setEditing(e)} title="Edit">
                    <Pencil size={16} />
                  </button>
                  <button className="text-slate-400 hover:text-accent-600" onClick={() => void remove(e)} title="Delete">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} setPage={setPage} count={expenses.length} />

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Record expense' : 'Edit expense'} width="max-w-2xl">
        {editing !== null && (
          <ExpenseForm
            expense={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null)
              refresh()
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <Modal open={manage === 'categories'} onClose={() => setManage('')} title="Expense categories">
        <ManageCategories />
      </Modal>
      <Modal open={manage === 'vendors'} onClose={() => setManage('')} title="Vendors">
        <ManageVendors />
      </Modal>
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

function ExpenseForm({ expense, onSaved, onCancel }: { expense: ExpenseRecord | null; onSaved: () => void; onCancel: () => void }): JSX.Element {
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: () => api.expenseCategories.list() })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: () => api.vendors.list() })
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts.list() })

  const [date, setDate] = useState(expense?.expenseDate ?? todayStr())
  const [categoryId, setCategoryId] = useState<number | ''>(expense?.categoryId ?? '')
  const [vendorId, setVendorId] = useState<number | ''>(expense?.vendorId ?? '')
  const [payee, setPayee] = useState(expense?.payee ?? '')
  const [amount, setAmount] = useState(paiseToRupees(expense?.amount ?? 0))
  const [mode, setMode] = useState<PaymentMode>(expense?.mode ?? 'cash')
  const [accountId, setAccountId] = useState<number | ''>(expense?.accountId ?? '')
  const [reference, setReference] = useState(expense?.referenceNo ?? '')
  const [remarks, setRemarks] = useState(expense?.remarks ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: limitInfo } = useQuery({
    queryKey: ['vendor-limit', accountId, vendorId, date, expense?.id],
    queryFn: () =>
      api.expenses.vendorLimitInfo({
        accountId: accountId as number,
        vendorId: vendorId as number,
        date,
        excludeId: expense?.id
      }),
    enabled: accountId !== '' && vendorId !== '' && !!date
  })

  const amtPaise = rupeesToPaise(amount || '0')
  const hasLimit = !!limitInfo && limitInfo.limit > 0
  const wouldExceed = hasLimit && limitInfo!.spent + amtPaise > limitInfo!.limit
  const remainingAfter = hasLimit ? limitInfo!.limit - limitInfo!.spent - amtPaise : 0
  const nearLimit = hasLimit && !wouldExceed && remainingAfter < limitInfo!.limit * 0.1

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    const amt = rupeesToPaise(amount)
    if (amt <= 0) return setError('Enter an amount')
    setBusy(true)
    const input: ExpenseInput = {
      expenseDate: date,
      categoryId: categoryId === '' ? null : categoryId,
      vendorId: vendorId === '' ? null : vendorId,
      payee: payee.trim() || undefined,
      amount: amt,
      mode,
      accountId: accountId === '' ? null : accountId,
      referenceNo: reference.trim() || undefined,
      remarks: remarks.trim() || undefined
    }
    try {
      if (expense) await api.expenses.update({ id: expense.id, input })
      else await api.expenses.create(input)
      onSaved()
    } catch (e2) {
      setError(errMessage(e2))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div>
        <label className="label">Date</label>
        <DateField value={date} onChange={setDate} />
      </div>
      <div>
        <label className="label">Amount (₹)</label>
        <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </div>
      <div>
        <label className="label">Category</label>
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Vendor</label>
        <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">—</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <label className="label">Payee (if no vendor)</label>
        <input className="input" value={payee} onChange={(e) => setPayee(e.target.value)} />
      </div>
      <div>
        <label className="label">Mode</label>
        <select className="input" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
          {PAYMENT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Paid from account</label>
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">—</option>
          {accounts.filter((a) => a.isActive).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Reference</label>
        <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div>
        <label className="label">Remarks</label>
        <input className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>
      {hasLimit && (
        <div
          className={`col-span-2 rounded-md p-2 text-xs ${
            wouldExceed ? 'bg-accent-50 text-accent-700' : nearLimit ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
          }`}
        >
          Vendor limit (FY {limitInfo!.fy}): paid {fmtMoney(limitInfo!.spent)} of {fmtMoney(limitInfo!.limit)} ·
          remaining {fmtMoney(limitInfo!.remaining)}.
          {wouldExceed && ` This exceeds the limit by ${fmtMoney(limitInfo!.spent + amtPaise - limitInfo!.limit)}.`}
          {nearLimit && ` Only ${fmtMoney(Math.max(0, remainingAfter))} would remain.`}
        </div>
      )}

      {error && <p className="col-span-2 text-sm text-accent-600">{error}</p>}
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" className="btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy || wouldExceed}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

function ManageCategories(): JSX.Element {
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: () => api.expenseCategories.list() })
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['expense-categories'] })

  async function add(): Promise<void> {
    if (!name.trim()) return
    setError('')
    try {
      await api.expenseCategories.create({ name: name.trim() })
      setName('')
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }
  async function remove(id: number): Promise<void> {
    setError('')
    try {
      await api.expenseCategories.remove({ id })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input className="input" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" onClick={() => void add()}>
          Add
        </button>
      </div>
      {error && <p className="mb-2 text-sm text-accent-600">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span>{c.name}</span>
            <button className="text-slate-400 hover:text-accent-600" onClick={() => void remove(c.id)}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ManageVendors(): JSX.Element {
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: () => api.vendors.list() })
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [error, setError] = useState('')
  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['vendors'] })

  async function add(): Promise<void> {
    if (!name.trim()) return
    setError('')
    try {
      await api.vendors.create({ name: name.trim(), contact: contact.trim() || undefined })
      setName('')
      setContact('')
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }
  async function remove(id: number): Promise<void> {
    setError('')
    try {
      await api.vendors.remove({ id })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input className="input" placeholder="Vendor name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input w-40" placeholder="Contact" value={contact} onChange={(e) => setContact(e.target.value)} />
        <button className="btn-primary" onClick={() => void add()}>
          Add
        </button>
      </div>
      {error && <p className="mb-2 text-sm text-accent-600">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {vendors.map((v) => (
          <li key={v.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {v.name} {v.contact && <span className="text-slate-400">· {v.contact}</span>}
            </span>
            <button className="text-slate-400 hover:text-accent-600" onClick={() => void remove(v.id)}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
