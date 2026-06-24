import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, RotateCcw, Trash2, Save } from 'lucide-react'
import { api, errMessage } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { fmtDateTime } from '../lib/format'

function fmtSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function BackupSettings(): JSX.Element {
  const { data: backups = [] } = useQuery({ queryKey: ['backups'], queryFn: () => api.backups.list() })
  const { data: auto } = useQuery({ queryKey: ['backup-auto'], queryFn: () => api.backups.getAuto() })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['backups'] })
    void queryClient.invalidateQueries({ queryKey: ['backup-auto'] })
  }

  async function create(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await api.backups.create()
      refresh()
    } catch (e) {
      setError(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function toggleAuto(): Promise<void> {
    try {
      await api.backups.setAuto({ enabled: !auto })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  async function remove(name: string): Promise<void> {
    if (!window.confirm('Delete this backup?')) return
    try {
      await api.backups.remove({ name })
      refresh()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  async function restore(name: string): Promise<void> {
    if (
      !window.confirm(
        'Restore this backup? Current data is snapshotted first, then replaced. You will be signed out and must log in with the password that was in use when this backup was made.'
      )
    )
      return
    try {
      await api.backups.restore({ name })
      alert('Backup restored. Please sign in again.')
      window.location.reload()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <Database size={16} /> Data & backups
      </h2>
      <p className="mt-1 text-xs text-slate-400">
        Backups include the encrypted database and its key file, stored in <code>data/backups</code>.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button className="btn-primary" onClick={() => void create()} disabled={busy}>
          <Save size={16} /> {busy ? 'Backing up…' : 'Create backup now'}
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={!!auto} onChange={() => void toggleAuto()} /> Automatic backup on exit (keeps last 10)
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-accent-600">{error}</p>}

      <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Backup</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2 text-right">Size</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {backups.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={4}>
                  No backups yet.
                </td>
              </tr>
            )}
            {backups.map((b) => (
              <tr key={b.name} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{b.name}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDateTime(b.createdAt)}</td>
                <td className="px-3 py-2 text-right text-slate-500">{fmtSize(b.sizeBytes)}</td>
                <td className="px-3 py-2 text-right">
                  <button className="mr-2 text-slate-400 hover:text-brand-600" title="Restore" onClick={() => void restore(b.name)}>
                    <RotateCcw size={15} />
                  </button>
                  <button className="text-slate-400 hover:text-accent-600" title="Delete" onClick={() => void remove(b.name)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
