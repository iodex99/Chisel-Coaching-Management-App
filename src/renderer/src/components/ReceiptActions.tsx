import { useState } from 'react'
import { FileDown, Printer } from 'lucide-react'
import { api, errMessage } from '../lib/api'

export function ReceiptActions({ paymentId, size = 'normal' }: { paymentId: number; size?: 'normal' | 'sm' }): JSX.Element {
  const [busy, setBusy] = useState<'' | 'pdf' | 'print'>('')
  const [error, setError] = useState('')
  const cls = size === 'sm' ? 'btn-outline py-1 text-xs' : 'btn-outline'

  async function run(kind: 'pdf' | 'print'): Promise<void> {
    setBusy(kind)
    setError('')
    try {
      if (kind === 'pdf') await api.receipts.exportPdf({ paymentId })
      else await api.receipts.print({ paymentId })
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button className={cls} onClick={() => void run('pdf')} disabled={busy !== ''} title="Save & open PDF">
        <FileDown size={size === 'sm' ? 14 : 16} /> PDF
      </button>
      <button className={cls} onClick={() => void run('print')} disabled={busy !== ''} title="Print receipt">
        <Printer size={size === 'sm' ? 14 : 16} /> Print
      </button>
      {error && <span className="text-xs text-accent-600">{error}</span>}
    </div>
  )
}
