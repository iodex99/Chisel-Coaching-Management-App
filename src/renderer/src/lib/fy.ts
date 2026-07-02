/** Financial-year helpers for the renderer (April–March). */

function startYear(d = new Date()): number {
  return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1
}

function label(start: number): string {
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

export function currentFy(): string {
  return label(startYear())
}

/** A wide range of FY options for dropdowns (so users pick a canonical
 *  "2026-27" value instead of typing an ambiguous one). Ordered newest-first.
 *  Runs from a few past years (legacy batches) up to FY 2050-51 for long-range
 *  planning — while always keeping the current FY plus a near-term planning
 *  window, so it stays correct even after the year 2050. */
export function fyOptions(): string[] {
  const s = startYear()
  const maxStart = Math.max(2050, s + 8) // up to FY 2050-51, and always ≥8 years ahead
  const minStart = s - 6 // a few past years for legacy batches
  const opts: string[] = []
  for (let y = maxStart; y >= minStart; y--) opts.push(label(y))
  return opts
}
