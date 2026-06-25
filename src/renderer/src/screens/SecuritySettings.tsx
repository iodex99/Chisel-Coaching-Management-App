import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Smartphone, ShieldCheck, MonitorSmartphone, Trash2, Plus } from 'lucide-react'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtDate, fmtDateTime } from '../lib/format'
import { Modal } from '../components/Modal'
import { ConfirmPasswordModal } from '../components/ConfirmPasswordModal'
import { EnrollAuthenticatorForm } from './auth/EnrollAuthenticatorForm'
import { RecoveryCodesView } from './auth/RecoveryCodesView'
import { MAX_AUTHENTICATORS } from '@shared/constants'

export function SecuritySettings(): JSX.Element {
  const { data: status, isLoading } = useQuery({ queryKey: ['2fa-status'], queryFn: () => api.twoFactor.status() })
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [error, setError] = useState('')

  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['2fa-status'] })

  async function removeAuth(id: number): Promise<void> {
    setError('')
    try {
      await api.twoFactor.removeAuthenticator({ id })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  async function removeDevice(id: number): Promise<void> {
    setError('')
    try {
      await api.twoFactor.removeTrustedDevice({ id })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  async function regenerate(): Promise<void> {
    setError('')
    try {
      setRecoveryCodes(await api.twoFactor.generateRecoveryCodes())
    } catch (e) {
      setError(errMessage(e))
    }
  }

  if (isLoading || !status) {
    return <section className="card p-6 text-sm text-slate-500">Loading security settings…</section>
  }

  return (
    <>
      {error && <p className="text-sm text-accent-600">{error}</p>}

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Smartphone size={16} /> Authenticator apps ({status.enrolledCount}/{MAX_AUTHENTICATORS})
          </h2>
          <button
            className="btn-outline"
            onClick={() => setGateOpen(true)}
            disabled={status.enrolledCount >= MAX_AUTHENTICATORS}
          >
            <Plus size={16} /> Add
          </button>
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {status.authenticators.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium text-slate-700">{a.label}</div>
                <div className="text-xs text-slate-400">
                  Added {fmtDate(a.createdAt)} · Last used {a.lastUsedAt ? fmtDateTime(a.lastUsedAt) : 'never'}
                </div>
              </div>
              <button
                className="text-slate-400 hover:text-accent-600 disabled:opacity-30"
                title={status.enrolledCount <= 1 ? 'At least one is required' : 'Remove'}
                disabled={status.enrolledCount <= 1}
                onClick={() => void removeAuth(a.id)}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <ShieldCheck size={16} /> Recovery codes
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {status.recoveryCodesRemaining} unused code{status.recoveryCodesRemaining === 1 ? '' : 's'} remaining.
        </p>
        <button className="btn-outline mt-3" onClick={() => void regenerate()}>
          Regenerate codes
        </button>
      </section>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <MonitorSmartphone size={16} /> Trusted devices
        </h2>
        {status.trustedDevices.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No trusted devices. 2FA is required at every sign-in.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {status.trustedDevices.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium text-slate-700">
                    {d.label} {d.current && <span className="ml-1 rounded bg-brand-100 px-1.5 text-[10px] text-brand-700">This device</span>}
                  </div>
                  <div className="text-xs text-slate-400">
                    Trusted {fmtDate(d.createdAt)} · Last seen {fmtDateTime(d.lastSeenAt)}
                  </div>
                </div>
                <button className="text-slate-400 hover:text-accent-600" title="Remove" onClick={() => void removeDevice(d.id)}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmPasswordModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        title="Confirm to add authenticator"
        description="Enter your master password to add a new authenticator app."
        onVerified={() => {
          setGateOpen(false)
          setEnrollOpen(true)
        }}
      />

      <Modal open={enrollOpen} onClose={() => setEnrollOpen(false)} title="Add authenticator">
        <EnrollAuthenticatorForm
          onEnrolled={() => {
            setEnrollOpen(false)
            refresh()
          }}
          onCancel={() => setEnrollOpen(false)}
        />
      </Modal>

      <Modal open={!!recoveryCodes} onClose={() => setRecoveryCodes(null)} title="New recovery codes">
        {recoveryCodes && (
          <RecoveryCodesView
            codes={recoveryCodes}
            doneLabel="Done"
            onDone={() => {
              setRecoveryCodes(null)
              refresh()
            }}
          />
        )}
      </Modal>
    </>
  )
}
