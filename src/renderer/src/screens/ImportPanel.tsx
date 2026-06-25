import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import type { ImportResult } from '@shared/types'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'

export function ImportPanel({ kind }: { kind: 'students' | 'fees' }): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  async function downloadTemplate(): Promise<void> {
    setError('')
    try {
      if (kind === 'students') await api.bulk.studentTemplate()
      else await api.bulk.feeTemplate()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const res = kind === 'students' ? await api.bulk.importStudents(bytes) : await api.bulk.importFees(bytes)
      setResult(res)
      void queryClient.invalidateQueries({ queryKey: ['students'] })
      void queryClient.invalidateQueries({ queryKey: ['fee-summaries'] })
      void queryClient.invalidateQueries({ queryKey: ['batches'] })
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal space-y-3 pl-5 text-slate-600">
        <li>
          Download the template and fill it in Excel.
          {kind === 'students' && ' The Batch, Gender and Status columns have dropdowns, so there are no spelling mistakes.'}
          <div className="mt-2">
            <button className="btn-outline" onClick={() => void downloadTemplate()}>
              <Download size={16} /> Download {kind === 'students' ? 'students' : 'fees'} template
            </button>
          </div>
        </li>
        <li>
          Save it, then upload the filled file:
          <div className="mt-2">
            <label className="btn-primary cursor-pointer">
              <Upload size={16} /> {busy ? 'Importing…' : 'Choose file & import'}
              <input type="file" accept=".xlsx" className="hidden" onChange={onFile} disabled={busy} />
            </label>
          </div>
        </li>
      </ol>

      {error && <p className="text-accent-600">{error}</p>}

      {result && (
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="font-medium text-green-700">Imported {result.imported} row(s).</p>
          {result.errors.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-accent-600">{result.errors.length} row(s) skipped:</p>
              <ul className="mt-1 max-h-48 overflow-auto text-xs text-slate-600">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {kind === 'fees' && (
        <p className="text-xs text-slate-400">
          Each fee row creates a plan split into equal monthly installments from the first due date. The student must
          already exist (import students first).
        </p>
      )}
    </div>
  )
}
