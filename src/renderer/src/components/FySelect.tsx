import { fyOptions } from '../lib/fy'

/**
 * A dropdown of canonical financial years (e.g. "2026-27"), so the user always
 * picks a well-formed value instead of typing an ambiguous one ("26-27").
 * If the current value isn't in the standard list (e.g. an old saved year), it
 * is kept as a selectable option so editing never loses data.
 */
export function FySelect({
  value,
  onChange,
  includeBlank = false,
  blankLabel = '— None —',
  className = 'input'
}: {
  value: string
  onChange: (fy: string) => void
  includeBlank?: boolean
  blankLabel?: string
  className?: string
}): JSX.Element {
  const opts = fyOptions()
  const list = value && !opts.includes(value) ? [value, ...opts] : opts
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {includeBlank && <option value="">{blankLabel}</option>}
      {list.map((fy) => (
        <option key={fy} value={fy}>
          {fy}
        </option>
      ))}
    </select>
  )
}
