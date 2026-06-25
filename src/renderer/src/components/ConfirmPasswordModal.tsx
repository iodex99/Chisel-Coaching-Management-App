import { useState } from 'react'
import { Modal } from './Modal'
import { api, errMessage } from '../lib/api'

/** Re-authentication gate: asks for the master password before a sensitive action. */
export function ConfirmPasswordModal({
  open,
  onClose,
  onVerified,
  title = 'Confirm your password',
  description = 'Enter your master password to continue.'
}: {
  open: boolean
  onClose: () => void
  onVerified: () => void
  title?: string
  description?: string
}): JSX.Element {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const ok = await api.auth.verifyPassword({ password })
      if (ok) {
        setPassword('')
        onVerified()
      } else {
        setError('Incorrect password')
      }
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
          className="input"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Master password"
        />
        {error && <p className="text-sm text-accent-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
