import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ban } from 'lucide-react'
import type { PaymentFilter, PaymentMode } from '@shared/types'
import { PAYMENT_MODES } from '@shared/constants'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtDate, fmtMoney } from '../lib/format'
import { ReceiptActions } from '../components/ReceiptActions'
import { Pager, PAGE_SIZE } from '../components/Pager'

const modeLabel = (m: PaymentMode): string => PAYMENT_MODES.find((x) => x.value === m)?.label ?? m

export function PaymentHistory({ filter, showStudent = true }: { filter: PaymentFilter; showStudent?: boolean }): JSX.Element {
  const [page, setPage] = useState(0)
  const filterKey = JSON.stringify(filter)
  useEffect(() => setPage(0), [filterKey])
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', filterKey, page],
    queryFn: () => api.payments.list({ ...filter, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
  })

  async function cancel(id: number): Promise<void> {
    const reason = window.prompt('Reason for cancelling this payment? (optional)') ?? undefined
    if (!window.confirm('Cancel this payment? The amount will no longer count toward fees paid.')) return
    try {
      await api.payments.cancel({ id, reason })
      void queryClient.invalidateQueries({ queryKey: ['payments'] })
      void queryClient.invalidateQueries({ queryKey: ['fee-plan'] })
      void queryClient.invalidateQueries({ queryKey: ['fee-summaries'] })
    } catch (e) {
      alert(errMessage(e))
    }
  }

  return (
    <>
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Receipt</th>
            <th className="px-4 py-3">Date</th>
            {showStudent && <th className="px-4 py-3">Student</th>}
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Mode</th>
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
                    <button className="text-slate-400 hover:text-accent-600" title="Cancel payment" onClick={() => void cancel(p.id)}>
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
    </>
  )
}
