import { useState } from 'react'
import { Logo } from '../components/Logo'
import { useAuth } from '../store/auth'
import { api, errMessage } from '../lib/api'

export default function Login(): JSX.Element {
  const state = useAuth((s) => s.state)
  const setUser = useAuth((s) => s.setUser)
  const refresh = useAuth((s) => s.refresh)
  const [username, setUsername] = useState(state?.username ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = await api.auth.login({ username: username.trim() || undefined, password })
      setUser(user)
      await refresh()
    } catch (err) {
      setError(errMessage(err))
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 p-6">
      <div className="card w-full max-w-sm p-8">
        <Logo className="mx-auto mb-6 w-56" />
        <h1 className="text-center text-lg font-semibold text-brand-700">Sign in</h1>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="label">Master password</label>
            <input
              className="input"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-accent-600">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
