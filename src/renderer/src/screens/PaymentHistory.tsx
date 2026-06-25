import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ban } from 'lucide-react'
import type { PaymentFilter, PaymentListItem, PaymentMode } from '@shared/types'
import { PAYMENT_MODES } from '@shared/constants'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtDate, fmtMoney } from '../lib/format'
import { ReceiptActions } from '../components/ReceiptActions'
import { SortableTh, toggleSort, type Sort } from '../components/SortableTh'
import { Pager, PAGE_SIZE } from '../components/Pager'
import { Modal } from '../components/Modal'

const modeLabel = (m: PaymentMode): string => PAYMENT_MODES.find((x) => x.value === m)?.label ?? m

export function PaymentHistory({ filter, showStudent = true }: { filter: PaymentFilter; showStudent?: boolean }): JSX.Element {
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' })
  const onSort = (k: string): void => setSort((s) => toggleSort(s, k))
  const filterKey = JSON.stringify(filter)
  useEffect(() => setPage(0), [filterKey, sort])
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', filterKey, sort, page],
    queryFn: () =>
      api.payments.list({
        ...filter,
        sortBy: sort.key as PaymentFilter['sortBy'],
        sortDir: sort.dir,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE
      })
  })

  const [cancelling, setCancelling] = useState<PaymentListItem | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirmCancel(): Promise<void> {
    if (!cancelling) return
    setBusy(true)
    setError('')
    try {
      await api.payments.cancel({ id: cancelling.id, reason: reason.trim() || undefined })
      void queryClient.invalidateQueries({ queryKey: ['payments'] })
      void queryClient.invalidateQueries({ queryKey: ['fee-plan'] })
      void queryClient.invalidateQueries({ queryKey: ['fee-summaries'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setCancelling(null)
      setReason('')
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <SortableTh label="Receipt" sortKey="receiptNo" sort={sort} onSort={onSort} />
            <SortableTh label="Date" sortKey="date" sort={sort} onSort={onSort} />
            {showStudent && <SortableTh label="Student" sortKey="student" sort={sort} onSort={onSort} />}
            <SortableTh label="Amount" sortKey="amount" sort={sort} onSort={onSort} align="right" />
            <SortableTh label="Mode" sortKey="mode" sort={sort} onSort={onSort} />
            <th className="px-4 py-3">Account</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading && (
            <tr>
              <td className="px-4 py-6 text-slate-400" colSpan={showStudent ? 7 : 6}>
                Loading…
              </td>
            </tr>
          )}
          {!isLoading && payments.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-slate-400" colSpan={showStudent ? 7 : 6}>
                No payments recorded.
              </td>
            </tr>
          )}
          {payments.map((p) => (
            <tr key={p.id} className={p.isCancelled ? 'bg-accent-50/40 text-slate-400' : 'hover:bg-slate-50'}>
              <td className="px-4 py-3 font-mono text-xs">
                {p.receiptNo}
                {p.isCancelled && <span className="ml-2 rounded bg-accent-100 px-1.5 text-[10px] text-accent-700">cancelled</span>}
              </td>
              <td className="px-4 py-3">{fmtDate(p.paymentDate)}</td>
              {showStudent && <td className="px-4 py-3 text-slate-700">{p.studentName}</td>}
              <td className="px-4 py-3 text-right font-medium">{fmtMoney(p.amount)}</td>
              <td className="px-4 py-3">{modeLabel(p.mode)}</td>
              <td className="px-4 py-3 text-slate-500">{p.accountName || '—'}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <ReceiptActions paymentId={p.id} size="sm" />
                  {!p.isCancelled && (
                    <button className="text-slate-400 hover:text-accent-600" title="Cancel payment" onClick={() => setCancelling(p)}>
                      <Ban size={15} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <Pager page={page} setPage={setPage} count={payments.length} />

    <Modal open={cancelling !== null} onClose={() => setCancelling(null)} title="Cancel payment">
      {cancelling && (
        <div>
          <p className="text-sm text-slate-600">
            Cancel receipt <span className="font-mono">{cancelling.receiptNo}</span> for{' '}
            <span className="font-medium">{cancelling.studentName}</span> ({fmtMoney(cancelling.amount)})? The amount
            will no longer count toward fees paid. The record is kept (marked cancelled), not deleted.
          </p>
          <div className="mt-3">
            <label className="label">Reason (optional)</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          {error && <p className="mt-2 text-sm text-accent-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-outline" onClick={() => setCancelling(null)} disabled={busy}>
              Keep payment
            </button>
            <button className="btn-accent" onClick={() => void confirmCancel()} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel payment'}
            </button>
          </div>
        </div>
      )}
    </Modal>
    </>
  )
}
