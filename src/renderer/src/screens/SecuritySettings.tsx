import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Smartphone, ShieldCheck, Trash2, Plus } from 'lucide-react'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtDate, fmtDateTime } from '../lib/format'
import { Modal } from '../components/Modal'
import { ConfirmCodeModal } from '../components/ConfirmCodeModal'
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
        <p className="mt-1 text-xs text-slate-400">
          Sign-in is by a 6-digit code from any of these apps — there is no username or password. Add a second phone
          so you are never locked out.
        </p>
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

      <ConfirmCodeModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        title="Confirm to add authenticator"
        description="Enter a code from one of your current authenticator apps to add a new one."
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
