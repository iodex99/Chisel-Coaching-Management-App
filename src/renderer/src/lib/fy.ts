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

/** A sensible range of FY options around the current year for dropdowns. */
export function fyOptions(): string[] {
  const s = startYear()
  const opts: string[] = []
  for (let y = s - 2; y <= s + 4; y++) opts.push(label(y))
  return opts
}
