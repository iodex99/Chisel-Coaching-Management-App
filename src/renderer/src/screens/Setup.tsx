import { useState } from 'react'
import { Logo } from '../components/Logo'
import { useAuth } from '../store/auth'
import { api, errMessage } from '../lib/api'
import { MIN_PASSWORD_LENGTH } from '@shared/schemas'

export default function Setup(): JSX.Element {
  const setUser = useAuth((s) => s.setUser)
  const refresh = useAuth((s) => s.refresh)
  const [instituteName, setInstituteName] = useState('Chisel Coaching Classes')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (username.trim().length < 3) return setError('Username must be at least 3 characters')
    if (password.length < MIN_PASSWORD_LENGTH)
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    if (password !== confirm) return setError('Passwords do not match')
    setBusy(true)
    try {
      const user = await api.auth.setup({ username: username.trim(), password, instituteName })
      setUser(user)
      await refresh()
    } catch (err) {
      setError(errMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 p-6">
      <div className="card w-full max-w-md p-8">
        <Logo className="mx-auto mb-6 w-60" />
        <h1 className="text-center text-xl font-semibold text-brand-700">Welcome — let’s get set up</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          Create the administrator account for this institute.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label">Institute name</label>
            <input className="input" value={instituteName} onChange={(e) => setInstituteName(e.target.value)} />
          </div>
          <div>
            <label className="label">Admin username</label>
            <input
              className="input"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
            />
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
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <div className="rounded-md bg-accent-50 p-3 text-xs text-accent-700">
            <strong>Important:</strong> your data is encrypted with this password. If you forget it, the data
            cannot be recovered. Keep it safe and back up regularly.
          </div>

          {error && <p className="text-sm text-accent-600">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Setting up…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
