import { useEffect, useState } from 'react'
import type { LoginResult, User } from '@shared/types'
import { useAuth } from '../../store/auth'
import { api, errMessage } from '../../lib/api'
import { AuthCard } from '../../components/AuthCard'
import { EnrollAuthenticatorForm } from './EnrollAuthenticatorForm'
import { RecoveryCodesView } from './RecoveryCodesView'
import Setup from './Setup'
import Login from './Login'

type Phase = 'setup' | 'login' | 'enroll' | 'recovery' | '2fa'

/** Drives the entire pre-authenticated flow: setup/login → 2FA/enroll → app. */
export default function AuthGate(): JSX.Element {
  const state = useAuth((s) => s.state)
  const setUser = useAuth((s) => s.setUser)
  const refresh = useAuth((s) => s.refresh)
  const [phase, setPhase] = useState<Phase>(state?.initialized ? 'login' : 'setup')
  const [pendingUser, setPendingUser] = useState<User | null>(null)

  async function finish(user: User): Promise<void> {
    setUser(user)
    await refresh()
  }

  function onAuthResult(res: LoginResult): void {
    setPendingUser(res.user)
    if (res.status === 'ok') void finish(res.user)
    else if (res.status === '2fa_required') setPhase('2fa')
    else setPhase('enroll')
  }

  if (phase === 'setup') return <Setup onResult={onAuthResult} />
  if (phase === 'login') return <Login onResult={onAuthResult} />

  if (phase === 'enroll') {
    return (
      <AuthCard>
        <h1 className="text-center text-lg font-semibold text-brand-700">Set up two-factor authentication</h1>
        <p className="mt-1 text-center text-sm text-slate-500">This is required to protect your data.</p>
        <div className="mt-5">
          <EnrollAuthenticatorForm onEnrolled={() => setPhase('recovery')} />
        </div>
      </AuthCard>
    )
  }

  if (phase === 'recovery') {
    return <RecoveryStep onDone={() => pendingUser && void finish(pendingUser)} />
  }

  return (
    <TwoFactorStep
      onVerified={(u) => void finish(u)}
      onBack={async () => {
        await api.auth.logout()
        await refresh()
        setPhase('login')
      }}
    />
  )
}

function RecoveryStep({ onDone }: { onDone: () => void }): JSX.Element {
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.twoFactor
      .generateRecoveryCodes()
      .then(setCodes)
      .catch((e) => setError(errMessage(e)))
  }, [])

  return (
    <AuthCard>
      {codes ? (
        <RecoveryCodesView codes={codes} onDone={onDone} doneLabel="Continue to the app" />
      ) : (
        <p className="text-center text-sm text-slate-500">{error || 'Generating recovery codes…'}</p>
      )}
    </AuthCard>
  )
}

function TwoFactorStep({
  onVerified,
  onBack
}: {
  onVerified: (user: User) => void
  onBack: () => void
}): JSX.Element {
  const [code, setCode] = useState('')
  const [trust, setTrust] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const user = await api.twoFactor.verify({ code: code.trim(), trustDevice: trust })
      onVerified(user)
    } catch (err) {
      setError(errMessage(err))
      setBusy(false)
      setCode('')
    }
  }

  return (
    <AuthCard width="max-w-sm">
      <h1 className="text-center text-lg font-semibold text-brand-700">Two-factor authentication</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        Enter the 6-digit code from your authenticator app, or a recovery code.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input
          className="input text-center tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          placeholder="000000"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
          Trust this device (skip 2FA here next time)
        </label>
        {error && <p className="text-sm text-accent-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Verifying…' : 'Verify'}
        </button>
        <button type="button" className="btn-ghost w-full" onClick={onBack} disabled={busy}>
          Back to sign in
        </button>
      </form>
    </AuthCard>
  )
}
