import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dataPath } from '../paths'
import { DEFAULT_KDF, type KdfParams } from './crypto'

/**
 * The non-secret sidecar stored at `data/keyfile.json`. It holds the KDF salt
 * and parameters (needed to derive the key from the password) plus lockout
 * state. It contains NO key and NO password — the database's GCM auth tag is
 * the actual password verifier.
 */
export interface KeyfileData {
  version: number
  username: string
  kdf: { salt: string } & KdfParams
  failedAttempts: number
  lockedUntil: string | null
  createdAt: string
  updatedAt: string
}

const keyfilePath = (): string => dataPath('keyfile.json')

export function keyfileExists(): boolean {
  return existsSync(keyfilePath())
}

export function readKeyfile(): KeyfileData {
  return JSON.parse(readFileSync(keyfilePath(), 'utf8')) as KeyfileData
}

export function writeKeyfile(data: KeyfileData): void {
  const tmp = `${keyfilePath()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, keyfilePath())
}

export function createKeyfile(username: string, salt: Buffer, params: KdfParams = DEFAULT_KDF): KeyfileData {
  const now = new Date().toISOString()
  const data: KeyfileData = {
    version: 1,
    username,
    kdf: { salt: salt.toString('base64'), ...params },
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now
  }
  writeKeyfile(data)
  return data
}
