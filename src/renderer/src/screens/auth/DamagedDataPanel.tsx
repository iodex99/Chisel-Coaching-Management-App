import { useState } from 'react'
import type { DamagedDataResult } from '@shared/types'
import { fmtDateTime } from '../../lib/format'
import { errMessage } from '../../lib/api'

/** Shown when the sign-in details are correct but the live data file cannot be
 *  decrypted (typically a save cut short by a power cut). Offers the newest
 *  backup that the same details open; the damaged file is kept, not deleted. */
export function DamagedDataPanel({
  result,
  what,
  onRestore,
  onCancel
}: {
  result: DamagedDataResult
  /** "password" or "code" — what the user entered that was proven correct. */
  what: string
  onRestore: () => Promise<void>
  onCancel: () => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function restore(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await onRestore()
    } catch (e) {
      setError(errMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md bg-amber-50 p-3 text-amber-800">
        <p className="font-semibold">Your {what} is correct — but the data file is damaged.</p>
        <p className="mt-1">
          This usually happens when the computer loses power or is switched off while Chisel is saving. The damaged file
          cannot be opened by anyone.
        </p>
      </div>
      <p className="text-slate-600">
        The newest backup that opens is from <strong>{fmtDateTime(result.backup.createdAt)}</strong>. Restoring it
        brings back everything up to that time; anything entered after it will need to be entered again. The damaged
        file is kept in the backups folder, not deleted.
      </p>
      {error && <p className="text-accent-600">{error}</p>}
      <button type="button" className="btn-primary w-full" onClick={() => void restore()} disabled={busy}>
        {busy ? 'Restoring…' : 'Restore this backup and sign in'}
      </button>
      <button type="button" className="btn-ghost w-full" onClick={onCancel} disabled={busy}>
        Not now
      </button>
    </div>
  )
}
