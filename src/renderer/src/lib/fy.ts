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

/** A wide range of FY options around the current year for dropdowns (so users
 *  pick a canonical "2026-27" value instead of typing an ambiguous one).
 *  Ordered newest-first. Covers several past years (legacy batches) and future
 *  years (planning ahead). */
export function fyOptions(): string[] {
  const s = startYear()
  const opts: string[] = []
  for (let y = s + 8; y >= s - 6; y--) opts.push(label(y))
  return opts
}
