import { format, parseISO } from 'date-fns'

export function fmtDate(iso?: string | null): string {
  return iso ? format(parseISO(iso), 'dd-MM-yyyy') : '—'
}

export function fmtDateTime(iso?: string | null): string {
  return iso ? format(parseISO(iso), 'dd-MM-yyyy, h:mm a') : '—'
}

/** Today as a local YYYY-MM-DD (never use toISOString — it shifts by timezone). */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** ISO yyyy-mm-dd -> display dd-mm-yyyy (empty string if not a full ISO date). */
export function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/** display dd-mm-yyyy (or dd/mm/yyyy) -> ISO yyyy-mm-dd (empty string if invalid). */
export function displayToIso(text: string): string {
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text.trim())
  if (!m) return ''
  const day = Number(m[1])
  const month = Number(m[2])
  if (day < 1 || day > 31 || month < 1 || month > 12) return ''
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Format integer paise as ₹ amount. */
export function fmtMoney(paise?: number | null): string {
  const value = (paise ?? 0) / 100
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
}

/** Convert a rupee input (string or number) to integer paise. */
export function rupeesToPaise(rupees: string | number): number {
  const n = typeof rupees === 'string' ? parseFloat(rupees) : rupees
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Convert integer paise to a plain rupee string for form inputs. */
export function paiseToRupees(paise?: number | null): string {
  return ((paise ?? 0) / 100).toString()
}
