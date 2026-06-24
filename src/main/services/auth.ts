import log from 'electron-log/main'
import { generateSalt, deriveKey, DEFAULT_KDF, type KdfParams } from '../db/crypto'
import {
  keyfileExists,
  readKeyfile,
  writeKeyfile,
  createKeyfile,
  type KeyfileData
} from '../db/keyfile'
import {
  createNewDatabase,
  openExistingDatabase,
  closeDatabase,
  discardDatabase,
  getDb,
  dbFileExists,
  backupDbFile
} from '../db/database'
import * as twoFactor from './twoFactor'
import type {
  AuthState,
  AuthStage,
  SetupInput,
  LoginInput,
  ChangePasswordInput,
  LoginResult,
  VerifyTwoFactorInput,
  User
} from '@shared/types'

const MAX_ATTEMPTS = 5
const LOCK_BASE_MS = 30_000 // doubles for each failure past the threshold

interface Session {
  user: User
  key: Buffer
  stage: AuthStage
  loginAt: number
  lastActivity: number
}

let session: Session | null = null

const now = (): string => new Date().toISOString()

export function isInitialized(): boolean {
  return keyfileExists() && dbFileExists()
}

export function getStage(): AuthStage | null {
  return session?.stage ?? null
}

export function getAuthState(): AuthState {
  if (!isInitialized()) {
    return { initialized: false, authenticated: false, stage: null, locked: false, lockedUntil: null, username: null }
  }
  const kf = readKeyfile()
  const lockedUntilMs = kf.lockedUntil ? Date.parse(kf.lockedUntil) : 0
  const locked = lockedUntilMs > Date.now()
  return {
    initialized: true,
    authenticated: session?.stage === 'authenticated',
    stage: session?.stage ?? null,
    locked,
    lockedUntil: locked ? new Date(lockedUntilMs).toISOString() : null,
    username: kf.username
  }
}

/** Assert a session is in one of the given stages; refresh activity. */
export function requireStage(...stages: AuthStage[]): Session {
  if (!session || !stages.includes(session.stage)) throw new Error('Not authorized')
  session.lastActivity = Date.now()
  return session
}

/** Assert a fully-authenticated session. */
export function requireSession(): Session {
  return requireStage('authenticated')
}

export function currentUser(): User | null {
  return session?.user ?? null
}

function audit(action: string): void {
  try {
    getDb().transaction((d) =>
      d.run('INSERT INTO audit_log (user_id, action, created_at) VALUES (1, ?, ?)', [action, now()])
    )
  } catch {
    /* best-effort */
  }
}

/** First-run setup: create the admin, initialize the encrypted DB. 2FA enrollment follows. */
export async function setup(input: SetupInput): Promise<LoginResult> {
  if (isInitialized()) throw new Error('The application is already set up')

  const salt = generateSalt()
  const params: KdfParams = DEFAULT_KDF
  const key = deriveKey(input.password, salt, params)

  const db = await createNewDatabase(key)
  const ts = now()
  db.transaction((d) => {
    d.run('INSERT INTO app_user (id, username, display_name, created_at, updated_at) VALUES (1, ?, ?, ?, ?)', [
      input.username,
      input.username,
      ts,
      ts
    ])
    d.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
      'institute.name',
      input.instituteName?.trim() || 'Chisel Coaching Classes',
      ts
    ])
    d.run('INSERT INTO audit_log (user_id, action, created_at) VALUES (1, ?, ?)', ['setup', ts])
  })

  createKeyfile(input.username, salt, params)

  const user: User = { id: 1, username: input.username, displayName: input.username }
  // 2FA is mandatory, so a fresh account must enroll an authenticator next.
  session = { user, key, stage: 'pending-enroll', loginAt: Date.now(), lastActivity: Date.now() }
  log.info(`First-run setup completed for "${input.username}"`)
  return { status: 'enroll_required', user }
}

/** Verify the master password by decrypting the DB; decide the next stage. */
export async function login(input: LoginInput): Promise<LoginResult> {
  if (!isInitialized()) throw new Error('The application is not set up yet')
  const kf = readKeyfile()

  if (kf.lockedUntil && Date.parse(kf.lockedUntil) > Date.now()) throw lockError(kf)

  const key = deriveKey(input.password, Buffer.from(kf.kdf.salt, 'base64'), kf.kdf)
  try {
    await openExistingDatabase(key)
  } catch {
    registerFailure(kf)
    throw new Error('Incorrect password')
  }

  if (input.username && input.username.trim().toLowerCase() !== kf.username.toLowerCase()) {
    closeDatabase()
    registerFailure(kf)
    throw new Error('Incorrect username or password')
  }

  kf.failedAttempts = 0
  kf.lockedUntil = null
  kf.updatedAt = now()
  writeKeyfile(kf)

  const row = getDb().get<{ username: string; display_name: string | null }>(
    'SELECT username, display_name FROM app_user WHERE id = 1'
  )
  const user: User = {
    id: 1,
    username: row?.username ?? kf.username,
    displayName: row?.display_name ?? row?.username ?? kf.username
  }

  // Decide the gate: enroll if no authenticators, skip 2FA on a trusted device.
  if (twoFactor.enrolledCount() === 0) {
    session = { user, key, stage: 'pending-enroll', loginAt: Date.now(), lastActivity: Date.now() }
    return { status: 'enroll_required', user }
  }
  if (twoFactor.isCurrentDeviceTrusted()) {
    session = { user, key, stage: 'authenticated', loginAt: Date.now(), lastActivity: Date.now() }
    audit('login')
    log.info(`User "${user.username}" logged in (trusted device)`)
    return { status: 'ok', user }
  }
  session = { user, key, stage: 'pending-2fa', loginAt: Date.now(), lastActivity: Date.now() }
  return { status: '2fa_required', user }
}

/** Complete the 2FA gate with a TOTP or recovery code. */
export function verifyTwoFactor(input: VerifyTwoFactorInput): User {
  const s = requireStage('pending-2fa')
  const code = input.code.trim()
  const ok = twoFactor.verifyTotp(code) || twoFactor.verifyRecoveryCode(code)
  if (!ok) throw new Error('Invalid authentication code')
  if (input.trustDevice) {
    try {
      twoFactor.trustCurrentDevice()
    } catch (err) {
      log.warn('Could not trust device:', err)
    }
  }
  s.stage = 'authenticated'
  audit('login')
  log.info(`User "${s.user.username}" logged in`)
  return s.user
}

/** Called after a successful enrollment to leave the pending-enroll stage. */
export function noteEnrollment(): void {
  if (session && session.stage === 'pending-enroll' && twoFactor.enrolledCount() > 0) {
    session.stage = 'authenticated'
    audit('login')
    log.info(`User "${session.user.username}" logged in (after enrollment)`)
  }
}

export function logout(): void {
  if (session) audit('logout')
  closeDatabase()
  session = null
}

/** Clear the session and drop the in-memory DB WITHOUT persisting. Used by
 * restore so the live (pre-restore) data cannot overwrite the restored files. */
export function discardSession(): void {
  session = null
  discardDatabase()
}

/** Change the master password and re-encrypt the database under the new key. */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const s = requireSession()
  const kf = readKeyfile()

  const currentKey = deriveKey(input.currentPassword, Buffer.from(kf.kdf.salt, 'base64'), kf.kdf)
  if (!currentKey.equals(s.key)) throw new Error('Current password is incorrect')

  backupDbFile('pre-rekey')

  const newSalt = generateSalt()
  const newKey = deriveKey(input.newPassword, newSalt, DEFAULT_KDF)
  getDb().rekey(newKey)

  kf.kdf = { salt: newSalt.toString('base64'), ...DEFAULT_KDF }
  kf.updatedAt = now()
  writeKeyfile(kf)
  s.key = newKey

  audit('change-password')
  log.info('Master password changed')
}

function registerFailure(kf: KeyfileData): void {
  kf.failedAttempts = (kf.failedAttempts ?? 0) + 1
  if (kf.failedAttempts >= MAX_ATTEMPTS) {
    const over = kf.failedAttempts - MAX_ATTEMPTS
    kf.lockedUntil = new Date(Date.now() + LOCK_BASE_MS * 2 ** over).toISOString()
  }
  kf.updatedAt = now()
  writeKeyfile(kf)
}

function lockError(kf: KeyfileData): Error {
  const secs = Math.ceil((Date.parse(kf.lockedUntil as string) - Date.now()) / 1000)
  return new Error(`Too many failed attempts. Try again in ${secs}s.`)
}
