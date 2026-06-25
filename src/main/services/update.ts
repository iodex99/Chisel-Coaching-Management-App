import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log/main'
import semver from 'semver'
import type { UpdateInfo, UpdateStatus } from '@shared/types'

// Injected at build time via electron-vite `define` from the UPDATE_READ_TOKEN
// CI secret. Absent (undefined) in dev/test builds.
declare const __UPDATE_TOKEN__: string
const TOKEN =
  (typeof __UPDATE_TOKEN__ !== 'undefined' ? __UPDATE_TOKEN__ : '') || process.env.UPDATE_READ_TOKEN || ''

let getWindow: () => BrowserWindow | null = () => null
export function setStatusWindow(fn: () => BrowserWindow | null): void {
  getWindow = fn
}
function emit(status: UpdateStatus): void {
  try {
    getWindow()?.webContents.send('update:status', status)
  } catch {
    /* ignore */
  }
}

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.logger = log

const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1)

let wired = false
function wireEvents(): void {
  if (wired) return
  wired = true
  autoUpdater.on('download-progress', (p) =>
    emit({
      state: 'downloading',
      percent: Math.round(p.percent),
      transferred: p.transferred,
      total: p.total,
      message: `${mb(p.transferred)} / ${mb(p.total)} MB`
    })
  )
  autoUpdater.on('error', (e) => emit({ state: 'error', message: e?.message ?? 'Update failed' }))
}

/** electron-updater reads GH_TOKEN for a private GitHub feed. */
function applyToken(): void {
  if (TOKEN) process.env.GH_TOKEN = TOKEN
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion()
  if (!TOKEN) {
    return { current, latest: null, available: false, notes: '', error: 'Updates are only available in release builds.' }
  }
  applyToken()
  try {
    const res = await autoUpdater.checkForUpdates()
    const latest = res?.updateInfo?.version ?? null
    const available = Boolean(latest && semver.valid(latest) && semver.gt(latest, current))
    const size = res?.updateInfo?.files?.[0]?.size
    const notes = typeof res?.updateInfo?.releaseNotes === 'string' ? res.updateInfo.releaseNotes : ''
    return { current, latest, available, notes, sizeBytes: size }
  } catch (e) {
    return { current, latest: null, available: false, notes: '', error: (e as Error).message }
  }
}

/**
 * Download the latest release via electron-updater and let it drive the NSIS
 * installer to swap files and relaunch — which handles file locks and restart
 * reliably (unlike a manual copy of a running app's files).
 */
export async function downloadAndInstall(): Promise<void> {
  if (!TOKEN) throw new Error('Updates are only available in release builds.')
  applyToken()
  wireEvents()
  emit({ state: 'checking' })
  const res = await autoUpdater.checkForUpdates()
  if (!res?.updateInfo) throw new Error('No update is available')
  emit({ state: 'downloading', percent: 0 })
  await autoUpdater.downloadUpdate()
  emit({ state: 'ready', message: 'Restarting to install the update…' })
  log.info(`Installing update v${res.updateInfo.version}; relaunching.`)
  // isSilent = true (run the installer silently), isForceRunAfter = true (relaunch).
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}
