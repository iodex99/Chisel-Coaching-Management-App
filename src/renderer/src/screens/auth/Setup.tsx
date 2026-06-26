import { useState, useEffect } from 'react'
import type { LoginResult } from '@shared/types'
import { AuthCard } from '../../components/AuthCard'
import { api, errMessage } from '../../lib/api'
import { MIN_PASSWORD_LENGTH } from '@shared/schemas'

export default function Setup({ onResult }: { onResult: (res: LoginResult) => void }): JSX.Element {
  const [instituteName, setInstituteName] = useState('Chisel Coaching Classes')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dataDir, setDataDir] = useState('')
  const [moveError, setMoveError] = useState('')

  useEffect(() => {
    api.app.getDataDir().then(setDataDir).catch(() => undefined)
  }, [])

  async function importData(): Promise<void> {
    setMoveError('')
    try {
      const r = await api.app.importData()
      if (r.imported) window.location.reload()
      else if (r.message !== 'Cancelled.') setMoveError(r.message)
    } catch (e) {
      setMoveError(errMessage(e))
    }
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (username.trim().length < 3) return setError('Username must be at least 3 characters')
    if (password.length < MIN_PASSWORD_LENGTH)
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    if (password !== confirm) return setError('Passwords do not match')
    setBusy(true)
    try {
      const res = await api.auth.setup({ username: username.trim(), password, instituteName })
      onResult(res)
    } catch (err) {
      setError(errMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthCard>
      <h1 className="text-center text-xl font-semibold text-brand-700">Welcome — let’s get set up</h1>
      <p className="mt-1 text-center text-sm text-slate-500">Create the administrator account for this institute.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="label">Institute name</label>
          <input className="input" value={instituteName} onChange={(e) => setInstituteName(e.target.value)} />
        </div>
        <div>
          <label className="label">Admin username</label>
          <input className="input" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. admin" />
        </div>
        <div>
          <label className="label">Master password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          />
        </div>
        <div>
          <label className="label">Confirm password</label>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>

        <div className="rounded-md bg-accent-50 p-3 text-xs text-accent-700">
          <strong>Important:</strong> your data is encrypted with this password. If you forget it, the data cannot
          be recovered. Keep it safe and back up regularly.
        </div>

        {error && <p className="text-sm text-accent-600">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Setting up…' : 'Create account'}
        </button>
      </form>

      <div className="mt-5 border-t border-slate-200 pt-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Already using Chisel on another computer?</p>
        <p className="mt-1">Don’t sign up here — bring your existing data across instead:</p>
        <button type="button" className="btn-outline mt-2 w-full" onClick={() => void importData()}>
          Import data from another computer…
        </button>
        {moveError && <p className="mt-2 text-accent-600">{moveError}</p>}
        <p className="mt-2 text-slate-400">
          Pick the <code>data</code> folder you copied from the other PC (via USB). Then sign in with{' '}
          <strong>that computer’s master password</strong> and your existing authenticator (or a recovery code) — a new
          device always asks for 2FA once.
        </p>
        {dataDir && (
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 select-all break-all rounded bg-slate-50 px-2 py-1 text-slate-700">{dataDir}</code>
            <button type="button" className="btn-outline py-0.5" onClick={() => void api.app.openDataDir()}>
              Open
            </button>
          </div>
        )}
      </div>
    </AuthCard>
  )
}
