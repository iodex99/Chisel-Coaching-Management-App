import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../store/auth'
import { api, errMessage } from '../lib/api'
import { MIN_PASSWORD_LENGTH } from '@shared/schemas'
import { SecuritySettings } from './SecuritySettings'

export default function Settings(): JSX.Element {
  const user = useAuth((s) => s.user)
  const [version, setVersion] = useState('')

  useEffect(() => {
    api.app.getVersion().then(setVersion).catch(() => undefined)
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>
      <p className="mt-1 text-slate-500">Account and security. More options arrive with later modules.</p>

      <div className="mt-6 grid max-w-3xl grid-cols-1 gap-6">
        <section className="card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Account</h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Username</dt>
            <dd className="text-slate-800">{user?.username}</dd>
            <dt className="text-slate-500">Application version</dt>
            <dd className="text-slate-800">{version || '—'}</dd>
          </dl>
        </section>

        <h2 className="-mb-2 mt-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Security</h2>
        <SecuritySettings />

        <ChangePasswordCard />
      </div>
    </div>
  )
}

function ChangePasswordCard(): JSX.Element {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setDone(false)
    if (next.length < MIN_PASSWORD_LENGTH)
      return setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    if (next !== confirm) return setError('New passwords do not match')
    setBusy(true)
    try {
      await api.auth.changePassword({ currentPassword: current, newPassword: next })
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <KeyRound size={16} /> Change master password
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        This re-encrypts the database. A backup is taken automatically before the change.
      </p>
      <form onSubmit={submit} className="mt-4 max-w-sm space-y-3">
        <div>
          <label className="label">Current password</label>
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="label">New password</label>
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p className="text-sm text-accent-600">{error}</p>}
        {done && <p className="text-sm text-green-600">Password changed successfully.</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </section>
  )
}
