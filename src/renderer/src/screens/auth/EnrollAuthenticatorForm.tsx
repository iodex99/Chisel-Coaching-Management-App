import { useEffect, useState } from 'react'
import type { EnrollStart, TwoFactorAuthenticator } from '@shared/types'
import { api, errMessage } from '../../lib/api'

/**
 * Inner enrollment form: shows a QR code + manual secret, then verifies a code
 * from the authenticator app before saving. Reused in the first-run flow and in
 * Settings. The branded wrapper is applied by the caller.
 */
export function EnrollAuthenticatorForm({
  defaultLabel = '',
  onEnrolled,
  onCancel
}: {
  defaultLabel?: string
  onEnrolled: (auth: TwoFactorAuthenticator) => void
  onCancel?: () => void
}): JSX.Element {
  const [data, setData] = useState<EnrollStart | null>(null)
  const [label, setLabel] = useState(defaultLabel)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.twoFactor
      .beginEnroll({})
      .then(setData)
      .catch((e) => setError(errMessage(e)))
  }, [])

  async function confirm(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!data) return
    setBusy(true)
    setError('')
    try {
      const auth = await api.twoFactor.confirmEnroll({
        secret: data.secret,
        label: label.trim() || 'Authenticator',
        code
      })
      onEnrolled(auth)
    } catch (err) {
      setError(errMessage(err))
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="text-sm text-slate-600">
        Scan this QR code with Google Authenticator, Authy or any TOTP app, then enter the 6-digit code to
        confirm.
      </p>

      <div className="mt-4 flex flex-col items-center">
        {data ? (
          <img
            src={data.qrDataUrl}
            alt="Authenticator QR code"
            className="h-48 w-48 rounded-md border border-slate-200"
          />
        ) : (
          <div className="flex h-48 w-48 items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-400">
            Generating…
          </div>
        )}
        {data && (
          <div className="mt-3 text-center">
            <div className="text-xs text-slate-400">Or enter this key manually</div>
            <code className="select-all text-sm font-medium tracking-wider text-slate-700">{data.secret}</code>
          </div>
        )}
      </div>

      <form onSubmit={confirm} className="mt-5 space-y-3">
        <div>
          <label className="label">Label (optional)</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My phone" />
        </div>
        <div>
          <label className="label">6-digit code</label>
          <input
            className="input tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="000000"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-accent-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={busy || !data}>
            {busy ? 'Verifying…' : 'Verify & enable'}
          </button>
          {onCancel && (
            <button type="button" className="btn-outline" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
