import { format, parseISO } from 'date-fns'

export function fmtDate(iso?: string | null): string {
  return iso ? format(parseISO(iso), 'dd MMM yyyy') : '—'
}

export function fmtDateTime(iso?: string | null): string {
  return iso ? format(parseISO(iso), 'dd MMM yyyy, h:mm a') : '—'
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
