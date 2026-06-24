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
