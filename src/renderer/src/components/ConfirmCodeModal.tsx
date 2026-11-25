import { useState } from 'react'
import { Modal } from './Modal'
import { api, errMessage } from '../lib/api'

/** Re-authentication gate: asks for a current authenticator code (or a recovery
 *  code) before a sensitive action. */
export function ConfirmCodeModal({
  open,
  onClose,
  onVerified,
  title = 'Confirm it’s you',
  description = 'Enter the 6-digit code from your authenticator app to continue.'
}: {
  open: boolean
  onClose: () => void
  onVerified: () => void
  title?: string
  description?: string
}): JSX.Element {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const ok = await api.auth.verifyCode({ code: code.trim() })
      setCode('')
      if (ok) onVerified()
      else setError('That code is not valid')
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">{description}</p>
        <input
          className="input tracking-[0.3em]"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 20))}
          placeholder="000000"
          aria-label="Authenticator code"
        />
        <p className="text-xs text-slate-400">Lost your phone? A recovery code works here too.</p>
        {error && <p className="text-sm text-accent-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || code.trim().length < 6}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
