import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileDown, FileText, FileSpreadsheet, Search } from 'lucide-react'
import type { ReportColumn, ReportResult, ReportType } from '@shared/types'
import { api, errMessage } from '../lib/api'
import { PageHeader } from '../components/PageHeader'
import { DateField } from '../components/DateField'
import { SortableTh, toggleSort, sortRows, type Sort } from '../components/SortableTh'
import { fmtDate, fmtMoney, isoToDisplay } from '../lib/format'

const GROUPS = ['Fees & collection', 'Accounts', 'Students', 'Expenses'] as const
type Group = (typeof GROUPS)[number]

const REPORTS: { value: ReportType; label: string; group: Group }[] = [
  { value: 'collection-by-student', label: 'Collection by student', group: 'Fees & collection' },
  { value: 'outstanding', label: 'Outstanding fees', group: 'Fees & collection' },
  { value: 'outstanding-by-batch', label: 'Outstanding by batch', group: 'Fees & collection' },
  { value: 'collection-by-date', label: 'Collection by date', group: 'Fees & collection' },
  { value: 'collection-by-mode', label: 'Collection by payment mode', group: 'Fees & collection' },
  { value: 'collection-by-batch', label: 'Collection summary (by batch)', group: 'Fees & collection' },
  { value: 'collection-by-school', label: 'Collection by school', group: 'Fees & collection' },
  { value: 'discounts-by-student', label: 'Discounts given', group: 'Fees & collection' },
  { value: 'monthly-net', label: 'Monthly collection vs expense (net)', group: 'Fees & collection' },
  { value: 'collection-by-account', label: 'Collection by account (credited)', group: 'Accounts' },
  { value: 'account-summary', label: 'Account summary (in / out / balance)', group: 'Accounts' },
  { value: 'students-by-school', label: 'Students by school', group: 'Students' },
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
  const s = col.type === 'date' ? isoToDisplay(String(value)) || String(value) : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function Reports(): JSX.Element {
  const [type, setType] = useState<ReportType>('collection-by-student')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const [rowSearch, setRowSearch] = useState('')
  const [sort, setSort] = useState<Sort>({ key: '', dir: 'asc' })
  const onSort = (k: string): void => setSort((s) => toggleSort(s, k))
  // A different report has different columns, so reset the row filter/sort.
  useEffect(() => {
    setRowSearch('')
    setSort({ key: '', dir: 'asc' })
  }, [type])

  const { data, isLoading } = useQuery({
    queryKey: ['report', type, from, to],
    queryFn: () => api.reports.get({ type, from: from || undefined, to: to || undefined })
  })

  const cols = data?.columns ?? []
  const sq = rowSearch.trim().toLowerCase()
  let viewRows = data?.rows ?? []
  if (sq) viewRows = viewRows.filter((row) => cols.some((c) => fmtCell(row[c.key], c).toLowerCase().includes(sq)))
  if (sort.key) viewRows = sortRows(viewRows, sort, (row, key) => row[key])

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


  return (
    <div className="p-8">
      <PageHeader title="Reports" subtitle="Fee collection and expense analytics. Export to CSV or PDF." />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px]">
          <label className="label">Report</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {REPORTS.filter((r) => r.group === g).map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label className="label">From</label>
          <DateField value={from} onChange={setFrom} disabled={type === 'outstanding'} />
        </div>
        <div className="w-40">
          <label className="label">To</label>
          <DateField value={to} onChange={setTo} disabled={type === 'outstanding'} />
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
        {data && data.rows.length > 0 && (
          <div className="relative ml-auto min-w-[200px]">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input className="input pl-9" placeholder="Filter rows" value={rowSearch} onChange={(e) => setRowSearch(e.target.value)} />
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-accent-600">{error}</p>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {cols.map((c) => (
                <SortableTh
                  key={c.key}
                  label={c.label}
                  sortKey={c.key}
                  sort={sort}
                  onSort={onSort}
                  align={c.align === 'right' ? 'right' : 'left'}
                />
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
            {data && viewRows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={data.columns.length}>
                  {data.rows.length === 0 ? 'No data for this report.' : 'No rows match your filter.'}
                </td>
              </tr>
            )}
            {viewRows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {cols.map((c) => (
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
