import { useEffect, useRef, useState } from 'react'
import { Calendar } from 'lucide-react'
import { isoToDisplay, displayToIso } from '../lib/format'

/**
 * A date input that shows and accepts dd-mm-yyyy, with a calendar button.
 * The value passed in/out is always ISO (yyyy-mm-dd) so form/state logic is
 * unchanged; only the display format is dd-mm-yyyy.
 */
export function DateField({
  value,
  onChange,
  className = 'input',
  disabled = false
}: {
  value: string
  onChange: (iso: string) => void
  className?: string
  disabled?: boolean
}): JSX.Element {
  const [text, setText] = useState(isoToDisplay(value))
  const picker = useRef<HTMLInputElement>(null)

  // Reflect external value changes (e.g. calendar pick or form reset).
  useEffect(() => setText(isoToDisplay(value)), [value])

  function onText(v: string): void {
    setText(v)
    if (v.trim() === '') {
      onChange('')
      return
    }
    const iso = displayToIso(v)
    if (iso) onChange(iso)
  }

  return (
    <div className="relative">
      <input
        className={`${className} pr-9`}
        placeholder="dd-mm-yyyy"
        value={text}
        disabled={disabled}
        onChange={(e) => onText(e.target.value)}
        onBlur={() => setText(isoToDisplay(value))}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-600 disabled:opacity-40"
        title="Pick a date"
        disabled={disabled}
        onClick={() => picker.current?.showPicker?.()}
      >
        <Calendar size={16} />
      </button>
      <input
        ref={picker}
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 right-2 h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  )
}
