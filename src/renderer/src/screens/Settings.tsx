import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, Building2, Sparkles } from 'lucide-react'
import type { InstituteProfile } from '@shared/types'
import { useAuth } from '../store/auth'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { MIN_PASSWORD_LENGTH } from '@shared/schemas'
import { SecuritySettings } from './SecuritySettings'
import { BackupSettings } from './BackupSettings'
import { UpdateSettings } from './UpdateSettings'

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

        <InstituteProfileCard />

        <BackupSettings />

        <SampleDataCard />

        <UpdateSettings />

        <h2 className="-mb-2 mt-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Security</h2>
        <SecuritySettings />

        <ChangePasswordCard />
      </div>
    </div>
  )
}

function SampleDataCard(): JSX.Element {
  const [busy, setBusy] = useState<'load' | 'remove' | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function load(): Promise<void> {
    if (
      !window.confirm(
        'Load (or refresh) a set of sample students, batches, fee plans, payments and expenses for a demo?\n\nIf sample data is already loaded it is replaced with fresh data dated to today. Your real data is untouched (a "pre-demo" backup was made the first time).'
      )
    )
      return
    setBusy('load')
    setErr('')
    setMsg('')
    try {
      const res = await api.demo.seedSample()
      setMsg(res.message)
      await queryClient.invalidateQueries()
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm('Remove all sample records? Your real data is left intact.')) return
    setBusy('remove')
    setErr('')
    setMsg('')
    try {
      const res = await api.demo.removeSample()
      setMsg(res.removed ? 'Sample data removed.' : 'No sample data to remove.')
      await queryClient.invalidateQueries()
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <Sparkles size={16} /> Sample data
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Fill the app with realistic demo records across every screen (students, batches, fee plans, payments and
        expenses). <strong>Load again any time to refresh</strong> — the “today / this month” figures are re-dated to
        the current period, so the dashboard always reflects the present. Your real data is untouched.
      </p>
      {msg && <p className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p>}
      {err && <p className="mt-3 text-sm text-accent-600">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button className="btn-outline" onClick={() => void load()} disabled={busy !== null}>
          {busy === 'load' ? 'Loading…' : 'Load / refresh sample data'}
        </button>
        <button className="btn-outline text-accent-600" onClick={() => void remove()} disabled={busy !== null}>
          {busy === 'remove' ? 'Removing…' : 'Remove sample data'}
        </button>
      </div>
    </section>
  )
}

function InstituteProfileCard(): JSX.Element {
  const { data } = useQuery({ queryKey: ['institute-profile'], queryFn: () => api.settings.getProfile() })
  const [profile, setProfile] = useState<InstituteProfile | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const current = profile ?? data ?? null

  function set<K extends keyof InstituteProfile>(key: K, value: InstituteProfile[K]): void {
    setProfile({ ...(current as InstituteProfile), [key]: value })
  }

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!current) return
    setBusy(true)
    setError('')
    setDone(false)
    try {
      await api.settings.updateProfile(current)
      void queryClient.invalidateQueries({ queryKey: ['institute-profile'] })
      setDone(true)
    } catch (err) {
      setError(errMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!current) return <section className="card p-6 text-sm text-slate-500">Loading profile…</section>

  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <Building2 size={16} /> Institute profile
      </h2>
      <p className="mt-1 text-xs text-slate-400">Shown on printed receipts.</p>
      <form onSubmit={save} className="mt-4 grid max-w-xl grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Institute name</label>
          <input className="input" value={current.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Address</label>
          <input className="input" value={current.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={current.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={current.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label className="label">Receipt number prefix</label>
          <input className="input" value={current.receiptPrefix} onChange={(e) => set('receiptPrefix', e.target.value)} />
        </div>
        <div>
          <label className="label">Receipt footer</label>
          <input className="input" value={current.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} />
        </div>
        <div className="col-span-2 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
          {done && <span className="text-sm text-green-600">Saved.</span>}
          {error && <span className="text-sm text-accent-600">{error}</span>}
        </div>
      </form>
    </section>
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
