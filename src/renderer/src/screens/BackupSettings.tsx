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
  const { data: dataDir } = useQuery({ queryKey: ['data-dir'], queryFn: () => api.app.getDataDir() })
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
        'Restore this backup? Current data is snapshotted first, then replaced. You will be signed out and sign in again with your authenticator code. (A backup made before v1.0.25 asks once for the master password that was in use then.)'
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
        All your data — the encrypted database, its key, receipts and backups — lives in this one folder.
      </p>
      <div className="mt-2 flex items-center gap-2 rounded-md bg-slate-50 p-2 text-xs">
        <code className="flex-1 select-all break-all text-slate-700">{dataDir || '…'}</code>
        <button className="btn-outline py-0.5 text-xs" onClick={() => void api.app.openDataDir()}>
          Open folder
        </button>
      </div>

      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer text-brand-600">Move everything to another computer →</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>
            <strong>Close Chisel on both computers first</strong> (so the files aren’t being written while you copy).
          </li>
          <li>Copy this whole <code>data</code> folder onto a USB drive (use “Open folder” above).</li>
          <li>
            On the other computer, install Chisel. On its welcome screen choose{' '}
            <strong>“Import data from another computer”</strong> and pick the folder you copied — or paste it manually
            into that PC’s own data folder (shown on its welcome / this screen).
          </li>
          <li>
            Sign in there with a code from your existing authenticator app (or a recovery code) — the same app works on
            every computer.
          </li>
        </ol>
        <p className="mt-2 text-slate-400">
          To keep both computers in sync later, repeat the copy whenever data changes — the app does not sync
          automatically.
        </p>
      </details>

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
