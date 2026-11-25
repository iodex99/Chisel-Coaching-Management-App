import { useState, useEffect } from 'react'
import type { LoginResult } from '@shared/types'
import { AuthCard } from '../../components/AuthCard'
import { api, errMessage } from '../../lib/api'
import { EnrollAuthenticatorForm } from './EnrollAuthenticatorForm'

/** First run: name the institute and link an authenticator app. That is the
 *  whole sign-up — there is no username or password. */
export default function Setup({ onResult }: { onResult: (res: LoginResult) => void }): JSX.Element {
  const [instituteName, setInstituteName] = useState('Chisel Coaching Classes')
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

  return (
    <AuthCard>
      <h1 className="text-center text-xl font-semibold text-brand-700">Welcome — let’s get set up</h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        You’ll sign in with a 6-digit code from an authenticator app on your phone — no username or password.
      </p>

      <div className="mt-6">
        <EnrollAuthenticatorForm
          begin={() => api.auth.beginSetup()}
          submit={async ({ secret, label, code }) => {
            const res = await api.auth.setup({
              instituteName: instituteName.trim() || undefined,
              secret,
              label: label || undefined,
              code
            })
            onResult(res) // the gate moves on to the recovery codes
          }}
          onEnrolled={() => undefined}
          submitLabel="Verify & create"
          busyLabel="Setting up…"
        >
          <div>
            <label className="label">Institute name</label>
            <input className="input" value={instituteName} onChange={(e) => setInstituteName(e.target.value)} />
          </div>
        </EnrollAuthenticatorForm>
      </div>

      <div className="mt-4 rounded-md bg-accent-50 p-3 text-xs text-accent-700">
        <strong>Important:</strong> you can add up to 3 authenticator apps (e.g. a second phone) in Settings, and you
        will get one-time recovery codes next. Keep them safe — they let you in if you lose your phone.
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Already using Chisel on another computer?</p>
        <p className="mt-1">Don’t sign up here — bring your existing data across instead:</p>
        <button type="button" className="btn-outline mt-2 w-full" onClick={() => void importData()}>
          Import data from another computer…
        </button>
        {moveError && <p className="mt-2 text-accent-600">{moveError}</p>}
        <p className="mt-2 text-slate-400">
          Pick the <code>data</code> folder you copied from the other PC (via USB). Then sign in with a code from your
          existing authenticator app (or a recovery code).
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
