import { useState } from 'react'
import type { LoginResult } from '@shared/types'
import { AuthCard } from '../../components/AuthCard'
import { useAuth } from '../../store/auth'
import { api, errMessage } from '../../lib/api'

/** Sign in with a code from the authenticator app (or a recovery code). Data
 *  from a password-based version is unlocked once with that password first. */
export default function Login({ onResult }: { onResult: (res: LoginResult) => void }): JSX.Element {
  const legacy = useAuth((s) => s.state?.legacyPassword ?? false)
  return legacy ? <LegacyUnlock onResult={onResult} /> : <CodeSignIn onResult={onResult} />
}

function CodeSignIn({ onResult }: { onResult: (res: LoginResult) => void }): JSX.Element {
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      onResult(await api.auth.login({ code: code.trim() }))
    } catch (err) {
      setError(errMessage(err))
      setBusy(false)
      setCode('')
    }
  }

  return (
    <AuthCard width="max-w-sm">
      <h1 className="text-center text-lg font-semibold text-brand-700">Sign in</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        {useRecovery
          ? 'Enter one of your one-time recovery codes.'
          : 'Enter the 6-digit code from your authenticator app.'}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {useRecovery ? (
          <input
            key="recovery"
            className="input text-center font-mono tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 20))}
            autoFocus
            placeholder="XXXXX-XXXXX"
            aria-label="Recovery code"
          />
        ) : (
          <input
            key="totp"
            className="input text-center text-lg tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            aria-label="Authenticator code"
          />
        )}

        {error && (
          <div>
            <p className="text-sm text-accent-600">{error}</p>
            <p className="mt-1 text-xs text-slate-400">
              Check that this computer’s date and time are correct — codes depend on the clock. Moved your data from
              another computer? The same authenticator app and recovery codes work here.
            </p>
          </div>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={busy || (useRecovery ? code.replace(/[^0-9A-Z]/g, '').length < 10 : code.length !== 6)}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button"
          className="btn-ghost w-full text-sm"
          onClick={() => {
            setUseRecovery((v) => !v)
            setCode('')
            setError('')
          }}
          disabled={busy}
        >
          {useRecovery ? 'Use my authenticator app instead' : 'Lost your phone? Use a recovery code'}
        </button>
      </form>
    </AuthCard>
  )
}

function LegacyUnlock({ onResult }: { onResult: (res: LoginResult) => void }): JSX.Element {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      onResult(await api.auth.unlockLegacy({ password, code: code.trim() || undefined }))
    } catch (err) {
      setError(errMessage(err))
      setBusy(false)
      setCode('')
    }
  }

  return (
    <AuthCard width="max-w-sm">
      <h1 className="text-center text-lg font-semibold text-brand-700">One-time upgrade</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        Chisel no longer uses a username or password — you’ll sign in with just your authenticator code. To switch
        over, enter your old master password <strong>one last time</strong>.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="label">Master password (last time)</label>
          <input
            className="input"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Authenticator code or recovery code</label>
          <input
            className="input tracking-[0.3em]"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 20))}
            placeholder="000000"
            aria-label="Authenticator code"
          />
          <p className="mt-1 text-xs text-slate-400">Leave blank only if you never set up an authenticator app.</p>
        </div>

        {error && <p className="text-sm text-accent-600">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={busy || !password}>
          {busy ? 'Unlocking…' : 'Unlock & switch to code sign-in'}
        </button>
        <p className="text-center text-xs text-slate-400">
          Your data is not changed — only how you sign in. Restoring a backup made before this update asks for the
          password that was in use then, once.
        </p>
      </form>
    </AuthCard>
  )
}
