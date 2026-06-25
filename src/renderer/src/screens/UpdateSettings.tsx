import { useEffect, useState } from 'react'
import { RefreshCw, Download, CheckCircle2 } from 'lucide-react'
import type { UpdateInfo, UpdateStatus } from '@shared/types'
import { api, errMessage } from '../lib/api'

const STATUS_TEXT: Record<UpdateStatus['state'], string> = {
  checking: 'Checking…',
  downloading: 'Downloading…',
  verifying: 'Verifying…',
  extracting: 'Extracting…',
  installing: 'Installing…',
  ready: 'Restarting to install…',
  error: 'Update failed'
}

const mb = (bytes?: number): string => (bytes ? (bytes / 1024 / 1024).toFixed(1) : '0')

export function UpdateSettings(): JSX.Element {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => api.update.onStatus(setStatus), [])
  useEffect(() => {
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function check(): Promise<void> {
    setChecking(true)
    try {
      setInfo(await api.update.check())
    } finally {
      setChecking(false)
    }
  }

  async function install(): Promise<void> {
    setInstalling(true)
    setStatus({ state: 'checking' })
    try {
      await api.update.install()
    } catch (e) {
      setStatus({ state: 'error', message: errMessage(e) })
      setInstalling(false)
    }
  }

  const downloading = installing && status && status.state !== 'error'

  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <RefreshCw size={16} /> Updates
      </h2>
      <div className="mt-3 text-sm text-slate-600">
        Current version: <span className="font-medium">{info?.current ?? '—'}</span>
      </div>

      {info?.available ? (
        <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <div className="font-medium text-brand-700">
            Version {info.latest} is available{info.sizeBytes ? ` · ${mb(info.sizeBytes)} MB` : ''}
          </div>
          {info.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{info.notes}</p>}

          {downloading ? (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded bg-brand-100">
                <div
                  className="h-2 rounded bg-brand-600 transition-all"
                  style={{ width: `${status?.percent ?? 0}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {STATUS_TEXT[status?.state ?? 'downloading']}
                {status?.total ? ` · ${mb(status.transferred)} / ${mb(status.total)} MB (${status.percent ?? 0}%)` : ''}
              </div>
            </div>
          ) : (
            <button className="btn-primary mt-3" onClick={() => void install()}>
              <Download size={16} /> Download &amp; install
            </button>
          )}

          {status?.state === 'error' && <p className="mt-2 text-sm text-accent-600">{status.message}</p>}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          {info && !info.error && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 size={16} /> Up to date
            </span>
          )}
          {info?.error && <span className="text-sm text-slate-400">{info.error}</span>}
          <button className="btn-outline" onClick={() => void check()} disabled={checking}>
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
        </div>
      )}
    </section>
  )
}
