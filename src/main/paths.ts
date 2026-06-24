import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'

/**
 * Resolve the portable data directory.
 *
 * Production: a `data` folder living NEXT TO the executable, so the whole app
 * folder (exe + data) can be copied to a USB drive and resume on any machine.
 * The auto-updater overwrites program files but never touches this folder.
 *
 * Development: a `data` folder in the project root (git-ignored).
 */
export function resolveDataDir(): string {
  if (app.isPackaged) {
    return join(dirname(app.getPath('exe')), 'data')
  }
  return join(app.getAppPath(), 'data')
}

/** Build an absolute path inside the portable data directory. */
export function dataPath(...segments: string[]): string {
  return join(resolveDataDir(), ...segments)
}

const SUBDIRS = ['receipts', 'backups', 'updates', 'logs'] as const

/** Ensure the data directory and its standard sub-folders exist. */
export function ensureDataDirs(): void {
  const root = resolveDataDir()
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  for (const d of SUBDIRS) {
    const p = join(root, d)
    if (!existsSync(p)) mkdirSync(p, { recursive: true })
  }
}
