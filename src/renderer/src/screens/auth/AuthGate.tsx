import { useEffect, useState } from 'react'
import type { LoginResult, User } from '@shared/types'
import { useAuth } from '../../store/auth'
import { api, errMessage } from '../../lib/api'
import { AuthCard } from '../../components/AuthCard'
import { EnrollAuthenticatorForm } from './EnrollAuthenticatorForm'
import { RecoveryCodesView } from './RecoveryCodesView'
import Setup from './Setup'
import Login from './Login'

type Phase = 'setup' | 'login' | 'enroll' | 'recovery'

/** Drives the pre-authenticated flow: setup (QR + code) or sign-in (code) → app.
 *  New accounts, and old data enrolling its first authenticator, get recovery
 *  codes before entering the app. */
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

  function onSetup(res: LoginResult): void {
    setPendingUser(res.user)
    setPhase('recovery')
  }

  function onSignIn(res: LoginResult): void {
    setPendingUser(res.user)
    if (res.status === 'ok') void finish(res.user)
    else setPhase('enroll')
  }

  if (phase === 'setup') return <Setup onResult={onSetup} />
  if (phase === 'login') return <Login onResult={onSignIn} />

  if (phase === 'enroll') {
    return (
      <AuthCard>
        <h1 className="text-center text-lg font-semibold text-brand-700">Set up your authenticator app</h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          From now on you’ll sign in with the 6-digit code it shows.
        </p>
        <div className="mt-5">
          <EnrollAuthenticatorForm onEnrolled={() => setPhase('recovery')} />
        </div>
      </AuthCard>
    )
  }

  return <RecoveryStep onDone={() => pendingUser && void finish(pendingUser)} />
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
