import { useEffect, useState, type ReactNode } from 'react'
import type { EnrollStart } from '@shared/types'
import { api, errMessage } from '../../lib/api'

/**
 * Inner enrollment form: shows a QR code + manual secret, then verifies a code
 * from the authenticator app before saving. Used by first-run setup (with its
 * own `begin`/`submit` and extra fields) and by Settings → Add authenticator.
 * The branded wrapper is applied by the caller.
 */
export function EnrollAuthenticatorForm({
  defaultLabel = '',
  begin = () => api.twoFactor.beginEnroll({}),
  submit = async ({ secret, label, code }) => {
    await api.twoFactor.confirmEnroll({ secret, label: label || 'Authenticator', code })
  },
  submitLabel = 'Verify & enable',
  busyLabel = 'Verifying…',
  children,
  onEnrolled,
  onCancel
}: {
  defaultLabel?: string
  begin?: () => Promise<EnrollStart>
  submit?: (input: { secret: string; label: string; code: string }) => Promise<void>
  submitLabel?: string
  busyLabel?: string
  /** Extra fields rendered above the label / code inputs. */
  children?: ReactNode
  onEnrolled: () => void
  onCancel?: () => void
}): JSX.Element {
  const [data, setData] = useState<EnrollStart | null>(null)
  const [label, setLabel] = useState(defaultLabel)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    begin()
      .then(setData)
      .catch((e) => setError(errMessage(e)))
  }, []) // `begin` is fixed for the lifetime of the form

  async function confirm(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!data) return
    if (code.length !== 6) return setError('Enter the 6-digit code shown in your authenticator app')
    setBusy(true)
    setError('')
    try {
      await submit({ secret: data.secret, label: label.trim(), code })
      onEnrolled()
    } catch (err) {
      setError(errMessage(err))
      setBusy(false)
      setCode('')
    }
  }

  return (
    <div>
      <p className="text-sm text-slate-600">
        Scan this QR code with Google Authenticator, Microsoft Authenticator, Authy or any TOTP app, then enter the
        6-digit code it shows to confirm.
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
            <code data-testid="totp-secret" className="select-all text-sm font-medium tracking-wider text-slate-700">
              {data.secret}
            </code>
          </div>
        )}
      </div>

      <form onSubmit={confirm} className="mt-5 space-y-3">
        {children}
        <div>
          <label className="label">Device name (optional)</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My phone" />
        </div>
        <div>
          <label className="label">6-digit code</label>
          <input
            className="input tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-accent-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={busy || !data}>
            {busy ? busyLabel : submitLabel}
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
