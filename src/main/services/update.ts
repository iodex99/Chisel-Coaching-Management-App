import { app, type BrowserWindow } from 'electron'
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join, dirname, basename } from 'path'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import extract from 'extract-zip'
import semver from 'semver'
import log from 'electron-log/main'
import { dataPath } from '../paths'
import type { UpdateInfo, UpdateStatus } from '@shared/types'

// Injected at build time via electron-vite `define` from the UPDATE_READ_TOKEN
// CI secret. Absent (undefined) in dev/test builds.
declare const __UPDATE_TOKEN__: string
const TOKEN =
  (typeof __UPDATE_TOKEN__ !== 'undefined' ? __UPDATE_TOKEN__ : '') || process.env.UPDATE_READ_TOKEN || ''

const REPO = 'iodex99/Chisel-Coaching-Management-App'
const API = `https://api.github.com/repos/${REPO}`

function headers(json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: json ? 'application/vnd.github+json' : 'application/octet-stream',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ChiselCoaching-Updater'
  }
}

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

interface GhAsset {
  id: number
  name: string
}
interface GhRelease {
  tag_name: string
  body: string
  assets: GhAsset[]
}

async function latestRelease(): Promise<GhRelease> {
  const res = await fetch(`${API}/releases/latest`, { headers: headers() })
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`)
  return (await res.json()) as GhRelease
}

async function downloadAsset(id: number): Promise<Buffer> {
  const res = await fetch(`${API}/releases/assets/${id}`, { headers: headers(false) })
  if (!res.ok) throw new Error(`Asset download failed (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion()
  if (!TOKEN) {
    return { current, latest: null, available: false, notes: '', error: 'Updates are only available in release builds.' }
  }
  try {
    const rel = await latestRelease()
    const latest = String(rel.tag_name || '').replace(/^v/, '')
    const available = Boolean(latest && semver.valid(latest) && semver.gt(latest, current))
    return { current, latest: latest || null, available, notes: rel.body || '' }
  } catch (e) {
    return { current, latest: null, available: false, notes: '', error: (e as Error).message }
  }
}

const SWAP_SCRIPT = `param([int]$ProcId, [string]$Src, [string]$Dest, [string]$Exe)
try { Wait-Process -Id $ProcId -Timeout 60 -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 1
Get-ChildItem -LiteralPath $Src -Force | ForEach-Object {
  if ($_.Name -ne 'data') {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Dest $_.Name) -Recurse -Force -ErrorAction SilentlyContinue
  }
}
Start-Process -FilePath (Join-Path $Dest $Exe)
`

/**
 * Download the latest release, verify it, stage it, then spawn a detached
 * PowerShell helper that swaps the program files (preserving ./data) and
 * relaunches the app once this process exits.
 */
export async function downloadAndInstall(): Promise<void> {
  if (!TOKEN) throw new Error('Updates are only available in release builds.')
  emit({ state: 'checking' })
  const rel = await latestRelease()
  const latest = String(rel.tag_name || '').replace(/^v/, '')
  const zipAsset = rel.assets.find((a) => a.name.toLowerCase().endsWith('.zip'))
  const manifestAsset = rel.assets.find((a) => a.name === 'latest.json')
  if (!zipAsset) throw new Error('No update package was found in the latest release')

  let expectedSha: string | null = null
  if (manifestAsset) {
    try {
      const buf = await downloadAsset(manifestAsset.id)
      const manifest = JSON.parse(buf.toString('utf8')) as { sha256?: string }
      expectedSha = manifest.sha256 ?? null
    } catch {
      /* manifest is optional */
    }
  }

  emit({ state: 'downloading', message: `Downloading v${latest}…` })
  const zipBuf = await downloadAsset(zipAsset.id)

  emit({ state: 'verifying' })
  if (expectedSha) {
    const sha = createHash('sha256').update(zipBuf).digest('hex').toLowerCase()
    if (sha !== expectedSha.toLowerCase()) throw new Error('The downloaded update failed its integrity check')
  }

  const updatesDir = dataPath('updates')
  const staging = join(updatesDir, 'staging')
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  const zipPath = join(updatesDir, `chisel-${latest}.zip`)
  writeFileSync(zipPath, zipBuf)

  emit({ state: 'extracting' })
  await extract(zipPath, { dir: staging })

  emit({ state: 'installing' })
  const appDir = dirname(app.getPath('exe'))
  const exeName = basename(app.getPath('exe'))
  const script = join(updatesDir, 'swap.ps1')
  writeFileSync(script, SWAP_SCRIPT, 'utf8')

  spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, String(process.pid), staging, appDir, exeName],
    { detached: true, stdio: 'ignore' }
  ).unref()

  log.info(`Applying update to v${latest}; relaunching.`)
  emit({ state: 'ready', message: 'Restarting to apply the update…' })
  setTimeout(() => app.quit(), 600)
}
