import { existsSync, readFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { authenticator } from 'otplib'
import log from 'electron-log/main'
import { dataPath } from '../paths'
import { deriveKey, verifySecret } from '../db/crypto'
import { decryptFile, getSqlJs, copyFileDurable as copyDurable } from '../db/database'
import { isLegacyKeyfile, dataKeyOf, type KeyfileData } from '../db/keyfile'
import { listBackups } from './backup'
import { normalizeRecoveryCode } from './twoFactor'

/**
 * When the credentials do not open the live database, it is either the wrong
 * password / code — or the right one and a damaged file (most often a save cut
 * short by a power failure or forced shutdown). The encryption cannot tell the
 * two apart, so we ask the backups: if the same credentials open a backup, they
 * are correct and the live file is damaged.
 */

/** scrypt costs ~0.1 s per password-based backup, so only look this far back. */
const MAX_BACKUPS_CHECKED = 25

export interface FoundBackup {
  name: string
  createdAt: string
}

const backupDir = (name: string): string => dataPath('backups', name)

function readBackupKeyfile(name: string): KeyfileData | null {
  try {
    return JSON.parse(readFileSync(join(backupDir(name), 'keyfile.json'), 'utf8')) as KeyfileData
  } catch {
    return null
  }
}

/** Backups worth trying, newest first. Folders that hold a damaged file we set
 *  aside ourselves are never offered. */
function candidates(): FoundBackup[] {
  return listBackups()
    .filter((b) => !b.name.startsWith('damaged-'))
    .slice(0, MAX_BACKUPS_CHECKED)
    .map((b) => ({ name: b.name, createdAt: b.createdAt }))
}

function safeDecrypt(path: string, key: Buffer): Buffer | null {
  try {
    return decryptFile(path, key)
  } catch {
    return null // unreadable backup file
  }
}

/** True if `password` opens the (password-based, ≤ v1.0.24) backup `name`. */
export function backupOpensWithPassword(name: string, password: string): boolean {
  const kf = readBackupKeyfile(name)
  if (!kf || !isLegacyKeyfile(kf)) return false
  const key = deriveKey(password, Buffer.from(kf.kdf.salt, 'base64'), kf.kdf)
  return safeDecrypt(join(backupDir(name), 'chisel.db'), key) !== null
}

/** True if `code` is a valid authenticator code or unused recovery code for the
 *  (code-based, v1.0.25+) backup `name`. The backup is only read, never changed. */
export async function backupAcceptsCode(name: string, code: string): Promise<boolean> {
  const kf = readBackupKeyfile(name)
  if (!kf || isLegacyKeyfile(kf)) return false
  let bytes: Buffer | null
  try {
    bytes = safeDecrypt(join(backupDir(name), 'chisel.db'), dataKeyOf(kf))
  } catch {
    return false // damaged keyfile in the backup
  }
  if (!bytes) return false
  const SQL = await getSqlJs()
  const db = new SQL.Database(bytes)
  try {
    const token = code.replace(/\s/g, '')
    const secrets = db.exec('SELECT secret FROM two_factor')[0]?.values ?? []
    if (secrets.some(([s]) => authenticator.verify({ token, secret: String(s) }))) return true
    const candidate = normalizeRecoveryCode(code)
    if (!/^[0-9A-F]{10}$/.test(candidate)) return false
    const hashes = db.exec('SELECT code_hash FROM recovery_codes WHERE used_at IS NULL')[0]?.values ?? []
    return hashes.some(([h]) => verifySecret(candidate, String(h)))
  } catch {
    return false
  } finally {
    db.close()
  }
}

/** Newest backup that `password` opens, or null. */
export function findBackupForPassword(password: string): FoundBackup | null {
  for (const b of candidates()) if (backupOpensWithPassword(b.name, password)) return b
  return null
}

/** Newest backup for which `code` is valid, or null. */
export async function findBackupForCode(code: string): Promise<FoundBackup | null> {
  for (const b of candidates()) if (await backupAcceptsCode(b.name, code)) return b
  return null
}

/** Put backup `name` in place of the live files. The damaged live files are
 *  first moved aside into `backups/damaged-<time>/` — nothing is deleted. */
export function replaceLiveWithBackup(name: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const aside = dataPath('backups', `damaged-${stamp}`)
  mkdirSync(aside, { recursive: true })
  for (const f of ['chisel.db', 'keyfile.json']) {
    if (existsSync(dataPath(f))) copyDurable(dataPath(f), join(aside, f))
  }
  copyDurable(join(backupDir(name), 'chisel.db'), dataPath('chisel.db'))
  copyDurable(join(backupDir(name), 'keyfile.json'), dataPath('keyfile.json'))
  log.warn(`Damaged data file replaced by backup "${name}"; the damaged files were kept in backups/damaged-${stamp}`)
  return `damaged-${stamp}`
}
