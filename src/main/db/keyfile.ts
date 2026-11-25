import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dataPath } from '../paths'
import type { KdfParams } from './crypto'

/**
 * The sidecar stored at `data/keyfile.json`, next to the encrypted database.
 *
 * Version 2 (current): sign-in is authenticator-code only, so there is no
 * password to derive the key from. The random 256-bit database key is stored
 * here (`dataKey`, base64). Keeping it beside the database means the data
 * folder and every backup folder stay self-contained: copy one to another PC
 * and it opens with the same authenticator app.
 *
 * Version 1 (legacy, ≤ v1.0.24): the key was derived from the master password
 * with scrypt, and this file held only the salt + KDF parameters. Data in this
 * form is unlocked once with that password and converted to version 2 (see
 * `auth.unlockLegacy`); an old backup restored later is converted the same way.
 *
 * Both versions also carry the sign-in lockout state.
 */
interface KeyfileCommon {
  failedAttempts: number
  lockedUntil: string | null
  createdAt: string
  updatedAt: string
}

export interface KeyfileV2 extends KeyfileCommon {
  version: 2
  dataKey: string
  /** When the file was converted from a password-based (v1) keyfile. */
  convertedFromPasswordAt?: string
}

export interface LegacyKeyfile extends KeyfileCommon {
  version: 1
  username: string
  kdf: { salt: string } & KdfParams
}

export type KeyfileData = KeyfileV2 | LegacyKeyfile

const keyfilePath = (): string => dataPath('keyfile.json')

export function keyfileExists(): boolean {
  return existsSync(keyfilePath())
}

export function readKeyfile(): KeyfileData {
  return JSON.parse(readFileSync(keyfilePath(), 'utf8')) as KeyfileData
}

/** True for a password-based keyfile written by v1.0.24 or earlier. */
export function isLegacyKeyfile(kf: KeyfileData): kf is LegacyKeyfile {
  return !(kf as Partial<KeyfileV2>).dataKey
}

/** The stored database key of a version-2 keyfile. */
export function dataKeyOf(kf: KeyfileV2): Buffer {
  const key = Buffer.from(kf.dataKey, 'base64')
  if (key.length !== 32) throw new Error('keyfile.json is damaged (the data key is not 32 bytes)')
  return key
}

/** Atomically replace keyfile.json (write a temp file, then rename over it). */
export function writeKeyfile(data: KeyfileData): void {
  const tmp = `${keyfilePath()}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, keyfilePath())
}

/** Create a fresh version-2 keyfile holding the given database key. */
export function createKeyfile(dataKey: Buffer): KeyfileV2 {
  const now = new Date().toISOString()
  const data: KeyfileV2 = {
    version: 2,
    dataKey: dataKey.toString('base64'),
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now
  }
  writeKeyfile(data)
  return data
}

/** Write a legacy (v1, password-based) keyfile. Only used by tests that build
 *  data the way v1.0.24 and earlier did, to exercise the one-time conversion. */
export function createLegacyKeyfile(username: string, salt: Buffer, params: KdfParams): LegacyKeyfile {
  const now = new Date().toISOString()
  const data: LegacyKeyfile = {
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

/** Convert a legacy keyfile to version 2 in a single atomic write, keeping the
 *  existing key (so the database file itself is not rewritten) and the original
 *  creation date. */
export function convertLegacyKeyfile(kf: LegacyKeyfile, key: Buffer): KeyfileV2 {
  const now = new Date().toISOString()
  const data: KeyfileV2 = {
    version: 2,
    dataKey: key.toString('base64'),
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: kf.createdAt,
    updatedAt: now,
    convertedFromPasswordAt: now
  }
  writeKeyfile(data)
  return data
}
