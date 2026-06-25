import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, cpSync } from 'fs'

/**
 * Resolve the data directory.
 *
 * Production: a `data` folder under the OS user-data location
 * (`%APPDATA%\Chisel Coaching\data`). This is OUTSIDE the install directory, so
 * NSIS auto-updates (which clean/replace the install folder) never touch it —
 * the previous "data next to the .exe" layout caused data loss on update.
 *
 * Development: a `data` folder in the project root (git-ignored).
 *
 * Tests/E2E may override the location via `CHISEL_DATA_DIR`.
 */
export function resolveDataDir(): string {
  const override = process.env.CHISEL_DATA_DIR
  if (override) return override
  if (app.isPackaged) {
    return join(app.getPath('userData'), 'data')
  }
  return join(app.getAppPath(), 'data')
}

/** Build an absolute path inside the portable data directory. */
export function dataPath(...segments: string[]): string {
  return join(resolveDataDir(), ...segments)
}

const SUBDIRS = ['receipts', 'backups', 'updates', 'logs', 'exports'] as const

/** Ensure the data directory and its standard sub-folders exist. */
export function ensureDataDirs(): void {
  const root = resolveDataDir()
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  for (const d of SUBDIRS) {
    const p = join(root, d)
    if (!existsSync(p)) mkdirSync(p, { recursive: true })
  }
}

/**
 * One-time migration of data created by older builds that stored it next to the
 * executable. If the new location has no database yet but a legacy location
 * does, copy it across so the user keeps their data.
 */
export function migrateLegacyData(): void {
  if (!app.isPackaged || process.env.CHISEL_DATA_DIR) return
  const target = resolveDataDir()
  if (existsSync(join(target, 'keyfile.json'))) return // already have data here

  const candidates = [
    join(dirname(app.getPath('exe')), 'data'), // data next to the current exe
    join(app.getPath('home'), 'AppData', 'Local', 'Programs', 'Chisel Coaching', 'data') // default install dir
  ]
  for (const legacy of candidates) {
    if (legacy === target) continue
    if (existsSync(join(legacy, 'keyfile.json'))) {
      mkdirSync(target, { recursive: true })
      cpSync(legacy, target, { recursive: true })
      return
    }
  }
}
