import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from 'fs'
import { join } from 'path'
import { dataPath } from '../paths'
import { isOpen } from '../db/database'
import { getSetting, setSetting } from './settings'
import { discardSession } from './auth'
import type { BackupInfo } from '@shared/types'

const backupsRoot = (): string => dataPath('backups')
const dbFile = (): string => dataPath('chisel.db')
const keyFile = (): string => dataPath('keyfile.json')
const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-')
const MAX_AUTO = 10

/** A backup is a folder containing both chisel.db and keyfile.json, so the
 * encryption salt matches the data even after a later password change. */
function isBackupDir(name: string): boolean {
  try {
    return statSync(join(backupsRoot(), name)).isDirectory() && existsSync(join(backupsRoot(), name, 'chisel.db'))
  } catch {
    return false
  }
}

function info(name: string): BackupInfo {
  const st = statSync(join(backupsRoot(), name, 'chisel.db'))
  return { name, createdAt: st.mtime.toISOString(), sizeBytes: st.size }
}

export function createBackup(label = 'manual'): BackupInfo {
  if (!existsSync(dbFile())) throw new Error('There is no database to back up yet')
  const name = `${label}-${stamp()}`
  const dir = join(backupsRoot(), name)
  mkdirSync(dir, { recursive: true })
  copyFileSync(dbFile(), join(dir, 'chisel.db'))
  if (existsSync(keyFile())) copyFileSync(keyFile(), join(dir, 'keyfile.json'))
  return info(name)
}

export function listBackups(): BackupInfo[] {
  if (!existsSync(backupsRoot())) return []
  return readdirSync(backupsRoot())
    .filter(isBackupDir)
    .map(info)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function deleteBackup(name: string): void {
  if (!isBackupDir(name)) throw new Error('Backup not found')
  rmSync(join(backupsRoot(), name), { recursive: true, force: true })
}

/** Restore a backup: snapshot current, drop the live DB+session WITHOUT
 * persisting, then swap in the backup's files. The caller must re-login. */
export function restoreBackup(name: string): void {
  if (!isBackupDir(name)) throw new Error('Backup not found')
  const dir = join(backupsRoot(), name)
  try {
    createBackup('pre-restore')
  } catch {
    /* best-effort safety snapshot */
  }
  discardSession()
  copyFileSync(join(dir, 'chisel.db'), dbFile())
  const kf = join(dir, 'keyfile.json')
  if (existsSync(kf)) copyFileSync(kf, keyFile())
}

export function getAutoBackup(): boolean {
  return getSetting('backup.auto') !== 'off'
}

export function setAutoBackup(enabled: boolean): void {
  setSetting('backup.auto', enabled ? 'on' : 'off')
}

/** Create an automatic backup on exit (when logged in + enabled), keeping the
 * most recent MAX_AUTO auto backups. Best-effort. */
export function autoBackupOnExit(): void {
  try {
    if (!isOpen() || !existsSync(dbFile()) || !existsSync(keyFile())) return
    if (getSetting('backup.auto') === 'off') return
    createBackup('auto')
    const autos = listBackups().filter((b) => b.name.startsWith('auto-'))
    for (const old of autos.slice(MAX_AUTO)) deleteBackup(old.name)
  } catch {
    /* ignore */
  }
}
