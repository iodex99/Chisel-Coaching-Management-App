import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileDown, FileText, FileSpreadsheet } from 'lucide-react'
import type { ReportColumn, ReportResult, ReportType } from '@shared/types'
import { api, errMessage } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { fmtDate, fmtMoney } from '../lib/format'

const REPORTS: { value: ReportType; label: string; group: 'Fees' | 'Expenses' }[] = [
  { value: 'collection-by-student', label: 'Collection by student', group: 'Fees' },
  { value: 'outstanding', label: 'Outstanding fees', group: 'Fees' },
  { value: 'collection-by-date', label: 'Collection by date', group: 'Fees' },
  { value: 'collection-by-mode', label: 'Collection by payment mode', group: 'Fees' },
  { value: 'collection-by-batch', label: 'Collection summary (by batch)', group: 'Fees' },
  { value: 'expense-by-date', label: 'Expenses by date', group: 'Expenses' },
  { value: 'expense-by-category', label: 'Expenses by category', group: 'Expenses' },
  { value: 'expense-by-vendor', label: 'Expenses by vendor / payee', group: 'Expenses' },
  { value: 'expense-by-account', label: 'Expenses by account', group: 'Expenses' },
  { value: 'expense-by-month', label: 'Expenses by month', group: 'Expenses' }
]

function fmtCell(value: string | number | null, col: ReportColumn): string {
  if (value === null || value === undefined) return '—'
  if (col.type === 'money') return fmtMoney(Number(value))
  if (col.type === 'date') return fmtDate(String(value))
  return String(value)
}

function csvValue(value: string | number | null, col: ReportColumn): string {
  if (value === null || value === undefined) return ''
  if (col.type === 'money') return (Number(value) / 100).toFixed(2)
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function Reports(): JSX.Element {
  const [type, setType] = useState<ReportType>('collection-by-student')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['report', type, from, to],
    queryFn: () => api.reports.get({ type, from: from || undefined, to: to || undefined })
  })

  function exportCsv(result: ReportResult): void {
    const header = result.columns.map((c) => c.label).join(',')
    const lines = result.rows.map((r) => result.columns.map((c) => csvValue(r[c.key], c)).join(','))
    if (result.totals) lines.push(result.columns.map((c, i) => (i === 0 ? 'Total' : csvValue(result.totals![c.key] ?? '', c))).join(','))
    const csv = [header, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.type}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportPdf(): Promise<void> {
    setError('')
    try {
      await api.reports.exportPdf({ type, from: from || undefined, to: to || undefined })
    } catch (e) {
      setError(errMessage(e))
    }
  }

  async function exportExcel(): Promise<void> {
    setError('')
    try {
      await api.reports.exportExcel({ type, from: from || undefined, to: to || undefined })
    } catch (e) {
      setError(errMessage(e))
    }
  }

  const grouped = { Fees: REPORTS.filter((r) => r.group === 'Fees'), Expenses: REPORTS.filter((r) => r.group === 'Expenses') }

  return (
    <div className="p-8">
      <PageHeader title="Reports" subtitle="Fee collection and expense analytics. Export to CSV or PDF." />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px]">
          <label className="label">Report</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
            <optgroup label="Fees">
              {grouped.Fees.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Expenses">
              {grouped.Expenses.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={type === 'outstanding'} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={type === 'outstanding'} />
        </div>
        <button className="btn-outline" onClick={() => void exportExcel()} disabled={!data}>
          <FileSpreadsheet size={16} /> Excel
        </button>
        <button className="btn-outline" onClick={() => data && exportCsv(data)} disabled={!data}>
          <FileDown size={16} /> CSV
        </button>
        <button className="btn-outline" onClick={() => void exportPdf()} disabled={!data}>
          <FileText size={16} /> PDF
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-accent-600">{error}</p>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {data?.columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={99}>
                  Loading…
                </td>
              </tr>
            )}
            {data && data.rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={data.columns.length}>
                  No data for this report.
                </td>
              </tr>
            )}
            {data?.rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {data.columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {fmtCell(row[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
            {data?.totals && data.rows.length > 0 && (
              <tr className="bg-slate-50 font-semibold">
                {data.columns.map((c, i) => (
                  <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {i === 0 ? 'Total' : data.totals![c.key] != null ? fmtCell(data.totals![c.key], c) : ''}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
