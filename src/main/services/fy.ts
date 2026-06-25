/** Indian financial-year helpers (April–March). Dates are YYYY-MM-DD. */

/** Today as a local YYYY-MM-DD (never use toISOString — it shifts by timezone). */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function financialYear(dateISO: string): string {
  const [y, m] = dateISO.split('-').map(Number)
  const startYear = m >= 4 ? y : y - 1
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

export function financialYearRange(dateISO: string): { start: string; end: string } {
  const [y, m] = dateISO.split('-').map(Number)
  const startYear = m >= 4 ? y : y - 1
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` }
}
