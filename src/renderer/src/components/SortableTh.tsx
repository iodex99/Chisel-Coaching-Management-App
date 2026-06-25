import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

export interface Sort {
  key: string
  dir: 'asc' | 'desc'
}

/** Toggle sort for a column: switch to it (asc) or flip direction if already active. */
export function toggleSort(sort: Sort, key: string): Sort {
  if (sort.key !== key) return { key, dir: 'asc' }
  return { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
}

/** Stable, type-aware client-side sort. Numbers compare numerically; everything
 * else compares as a natural string. Null/undefined always sort last. */
export function sortRows<T>(
  rows: T[],
  sort: Sort,
  accessor: (row: T, key: string) => string | number | null | undefined
): T[] {
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = accessor(a, sort.key)
    const bv = accessor(b, sort.key)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir
  })
}

/** A sortable table header cell. Click to sort by `sortKey`; click again to flip. */
export function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left'
}: {
  label: string
  sortKey: string
  sort: Sort
  onSort: (key: string) => void
  align?: 'left' | 'right' | 'center'
}): JSX.Element {
  const active = sort.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <th className={`px-4 py-3 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-700 ${
          active ? 'text-slate-700' : ''
        } ${align === 'right' ? 'flex-row-reverse' : ''}`}
        title={`Sort by ${label}`}
      >
        {label}
        <Icon size={13} className={active ? 'text-brand-600' : 'text-slate-300'} />
      </button>
    </th>
  )
}
