import { randomBytes } from 'crypto'
import log from 'electron-log/main'
import { deriveKey } from '../db/crypto'
import {
  keyfileExists,
  readKeyfile,
  writeKeyfile,
  createKeyfile,
  isLegacyKeyfile,
  dataKeyOf,
  convertLegacyKeyfile,
  type KeyfileData,
  type LegacyKeyfile
} from '../db/keyfile'
import {
  createNewDatabase,
  decryptLiveDatabase,
  openDecryptedDatabase,
  closeDatabase,
  discardDatabase,
  getDb,
  isOpen,
  dbFileExists
} from '../db/database'
import * as twoFactor from './twoFactor'
import { getSetting } from './settings'
import { listBackups } from './backup'
import {
  findBackupForCode,
  findBackupForPassword,
  backupOpensWithPassword,
  backupAcceptsCode,
  replaceLiveWithBackup
} from './damageRecovery'
import type {
  AuthState,
  AuthStage,
  EnrollStart,
  SetupInput,
  LoginInput,
  LegacyUnlockInput,
  LoginResult,
  SignInResult,
  RestoreDamagedInput,
  User
} from '@shared/types'

const MAX_ATTEMPTS = 5
const LOCK_BASE_MS = 30_000 // doubles for each failure past the threshold
const DEFAULT_INSTITUTE = 'Chisel Coaching Classes'

interface Session {
  user: User
  stage: AuthStage
  loginAt: number
  lastActivity: number
  /** Set while unlocking password-based data that has no authenticator yet:
   *  the keyfile is converted only once enrollment succeeds, so quitting
   *  half-way leaves the data still protected by its old password. */
  pendingLegacy?: { kf: LegacyKeyfile; key: Buffer }
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
    return { initialized: false, authenticated: false, stage: null, locked: false, lockedUntil: null, legacyPassword: false }
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
    legacyPassword: isLegacyKeyfile(kf)
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

/** The account name shown in authenticator apps: the institute's name. */
export function accountName(): string {
  try {
    return getSetting('institute.name')?.trim() || DEFAULT_INSTITUTE
  } catch {
    return DEFAULT_INSTITUTE
  }
}

/** Re-authentication gate for sensitive actions (e.g. adding an authenticator):
 *  true if `code` is a valid authenticator or unused recovery code. */
export function verifyCode(code: string): boolean {
  requireSession()
  return twoFactor.verifyTotp(code) || twoFactor.verifyRecoveryCode(code)
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

function loadUser(): User {
  const row = getDb().get<{ username: string; display_name: string | null }>(
    'SELECT username, display_name FROM app_user WHERE id = 1'
  )
  const username = row?.username ?? 'admin'
  return { id: 1, username, displayName: row?.display_name ?? username }
}

function startSession(user: User, stage: AuthStage): void {
  session = { user, stage, loginAt: Date.now(), lastActivity: Date.now() }
}

// --- First-run setup ---

/** First run: a fresh authenticator secret + QR code to scan. Nothing is stored
 *  until `setup` proves the app was scanned by returning a valid code. */
export async function beginSetup(instituteName?: string): Promise<EnrollStart> {
  if (isInitialized()) throw new Error('The application is already set up')
  return twoFactor.newEnrollment(instituteName?.trim() || DEFAULT_INSTITUTE)
}

/** First-run setup: verify the code from the scanned authenticator, then create
 *  the encrypted database (random key) with that authenticator in one step. */
export async function setup(input: SetupInput): Promise<LoginResult> {
  if (isInitialized()) throw new Error('The application is already set up')
  twoFactor.assertSecretCode(input.secret, input.code)

  const key = randomBytes(32)
  const db = await createNewDatabase(key)
  const ts = now()
  db.transaction((d) => {
    d.run('INSERT INTO app_user (id, username, display_name, created_at, updated_at) VALUES (1, ?, ?, ?, ?)', [
      'admin',
      'Admin',
      ts,
      ts
    ])
    d.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
      'institute.name',
      input.instituteName?.trim() || DEFAULT_INSTITUTE,
      ts
    ])
    twoFactor.insertAuthenticator(d, input.secret, input.label ?? '')
    d.run('INSERT INTO audit_log (user_id, action, created_at) VALUES (1, ?, ?)', ['setup', ts])
  })
  // The database must be on disk before the keyfile marks the app as set up.
  await db.flush()
  createKeyfile(key)

  const user = loadUser()
  startSession(user, 'authenticated')
  log.info('First-run setup completed (authenticator enrolled)')
  return { status: 'ok', user }
}

// --- Sign in ---

const DAMAGED_NO_BACKUP =
  'The data file could not be opened and no backup could be verified with what you entered. If you are sure it is right, the data file is probably damaged (for example by a power cut while saving) — nothing has been changed; please contact support.'

/** Sign in with an authenticator code or a one-time recovery code. */
export async function login(input: LoginInput): Promise<SignInResult> {
  if (!isInitialized()) throw new Error('The application is not set up yet')
  const kf = readKeyfile()
  if (isLegacyKeyfile(kf)) {
    throw new Error('This data was created with a master password. Unlock it once with that password to continue.')
  }
  if (kf.lockedUntil && Date.parse(kf.lockedUntil) > Date.now()) throw lockError(kf)
  const code = input.code.trim()

  resetSession()
  const key = dataKeyOf(kf)
  const bytes = readLive(key)
  if (!bytes) {
    // The stored key does not open the file, so the file is damaged (or was
    // replaced). A backup that accepts this code proves the code is right.
    log.error('chisel.db could not be decrypted with the key in keyfile.json — damaged or mismatched data file')
    const backup = await findBackupForCode(code)
    if (backup) return { status: 'damaged', backup }
    throw failure(kf, DAMAGED_NO_BACKUP)
  }
  await openBytes(bytes, key)

  if (twoFactor.enrolledCount() === 0) {
    // Not reachable through the app (setup enrolls atomically and the last
    // authenticator cannot be removed); never lock the owner out of their data.
    startSession(loadUser(), 'pending-enroll')
    return { status: 'enroll_required', user: loadUser() }
  }

  if (!(twoFactor.verifyTotp(code) || twoFactor.verifyRecoveryCode(code))) {
    closeDatabase()
    throw failure(kf, 'Invalid authentication code')
  }
  clearFailures(kf)

  const user = loadUser()
  startSession(user, 'authenticated')
  audit('login')
  log.info('Signed in with an authenticator code')
  return { status: 'ok', user }
}

/** One-time unlock of data created by a password-based version (≤ v1.0.24, or a
 *  backup made by one). Verifies the old password and an authenticator code,
 *  then switches the keyfile to code-only sign-in — keeping the same key, so the
 *  database file itself is not rewritten. */
export async function unlockLegacy(input: LegacyUnlockInput): Promise<SignInResult> {
  if (!isInitialized()) throw new Error('The application is not set up yet')
  const kf = readKeyfile()
  if (!isLegacyKeyfile(kf)) throw new Error('This data is already up to date — sign in with your authenticator code.')
  releaseUpgradeLock(kf)
  if (kf.lockedUntil && Date.parse(kf.lockedUntil) > Date.now()) throw lockError(kf)

  resetSession()
  const key = deriveKey(input.password, Buffer.from(kf.kdf.salt, 'base64'), kf.kdf)
  const bytes = readLive(key)
  if (!bytes) {
    // Wrong password — or the right one and a damaged file. v1.0.24 reported
    // both as "Incorrect password"; a backup that opens settles which it is.
    const backup = findBackupForPassword(input.password)
    if (backup) {
      log.error(`The password is correct (it opens backup "${backup.name}") but chisel.db does not decrypt — the data file is damaged`)
      return { status: 'damaged', backup }
    }
    throw failure(kf, 'Incorrect password')
  }
  await openBytes(bytes, key)

  if (twoFactor.enrolledCount() === 0) {
    // Old data that never finished 2FA enrollment: enroll first, convert after.
    session = { user: loadUser(), stage: 'pending-enroll', loginAt: Date.now(), lastActivity: Date.now(), pendingLegacy: { kf, key } }
    return { status: 'enroll_required', user: session.user }
  }

  const code = input.code?.trim() ?? ''
  if (!code || !(twoFactor.verifyTotp(code) || twoFactor.verifyRecoveryCode(code))) {
    closeDatabase()
    throw failure(kf, code ? 'Invalid authentication code' : 'Enter the 6-digit code from your authenticator app')
  }

  convertLegacyKeyfile(kf, key)
  const user = loadUser()
  startSession(user, 'authenticated')
  audit('login')
  audit('remove-password')
  log.info('Password-based data unlocked and switched to authenticator-only sign-in')
  return { status: 'ok', user }
}

/** Replace a damaged live data file with the backup a sign-in offered. Only
 *  allowed while the live file really cannot be opened with these credentials,
 *  and only when they open that backup. The damaged files are kept. */
export async function restoreDamaged(input: RestoreDamagedInput): Promise<void> {
  if (!isInitialized()) throw new Error('The application is not set up yet')
  if (isOpen()) throw new Error('Sign out first')
  const kf = readKeyfile()
  if (kf.lockedUntil && Date.parse(kf.lockedUntil) > Date.now()) throw lockError(kf)

  const liveKey = isLegacyKeyfile(kf)
    ? deriveKey(input.password ?? '', Buffer.from(kf.kdf.salt, 'base64'), kf.kdf)
    : dataKeyOf(kf)
  if (readLive(liveKey)) throw new Error('The data file is not damaged — sign in normally.')

  const backup = listBackups().find((b) => b.name === input.name && !b.name.startsWith('damaged-'))
  const ok =
    !!backup &&
    ((!!input.password && backupOpensWithPassword(input.name, input.password)) ||
      (!!input.code && (await backupAcceptsCode(input.name, input.code))))
  if (!ok) throw failure(kf, 'That backup could not be verified with what you entered')

  replaceLiveWithBackup(input.name)
}

/** Decrypt the live file; null if the key does not open it. An unreadable file
 *  (missing, locked by another program) is a real error and is reported as such. */
function readLive(key: Buffer): Buffer | null {
  try {
    return decryptLiveDatabase(key)
  } catch (err) {
    log.error('Could not read chisel.db:', err)
    throw new Error(`The data file could not be read: ${(err as Error).message}`)
  }
}

/** Open decrypted bytes as the live database. A failure here (e.g. an update
 *  step) is NOT a credentials problem: report it as-is, never count it. */
async function openBytes(bytes: Buffer, key: Buffer): Promise<void> {
  try {
    await openDecryptedDatabase(bytes, key)
  } catch (err) {
    log.error('The data decrypted but could not be opened:', err)
    throw new Error(
      `Your sign-in details are correct, but the data could not be opened: ${(err as Error).message}. Nothing was changed — please contact support.`
    )
  }
}

/** A sign-in attempt always starts from a signed-out state. */
function resetSession(): void {
  session = null
  if (isOpen()) closeDatabase()
}

/** v1.0.24 counted a damaged data file as wrong passwords, so a client can
 *  arrive here locked out for hours with the right password. Lift that lock
 *  once, on the first upgrade attempt; the normal lockout applies after. */
function releaseUpgradeLock(kf: LegacyKeyfile): void {
  if (kf.upgradeLockReleased) return
  kf.upgradeLockReleased = true
  if (kf.failedAttempts || kf.lockedUntil) {
    log.warn(`Cleared a v1.0.24 sign-in lock (${kf.failedAttempts} failed attempts) for the one-time upgrade`)
  }
  kf.failedAttempts = 0
  kf.lockedUntil = null
  kf.updatedAt = now()
  writeKeyfile(kf)
}

/** Called after a successful enrollment to leave the pending-enroll stage. */
export function noteEnrollment(): void {
  if (session && session.stage === 'pending-enroll' && twoFactor.enrolledCount() > 0) {
    if (session.pendingLegacy) {
      convertLegacyKeyfile(session.pendingLegacy.kf, session.pendingLegacy.key)
      session.pendingLegacy = undefined
      audit('remove-password')
    }
    session.stage = 'authenticated'
    audit('login')
    log.info('Signed in (after enrolling an authenticator)')
  }
}

export function logout(): void {
  if (session && isOpen()) audit('logout')
  closeDatabase()
  session = null
}

/** Clear the session and drop the in-memory DB WITHOUT persisting. Used by
 * restore so the live (pre-restore) data cannot overwrite the restored files. */
export function discardSession(): void {
  session = null
  discardDatabase()
}

// --- Lockout ---

/** Count a failed attempt (persisted, so restarting the app does not reset it)
 *  and return the error to throw — the lockout message once locked. */
function failure(kf: KeyfileData, message: string): Error {
  kf.failedAttempts = (kf.failedAttempts ?? 0) + 1
  if (kf.failedAttempts >= MAX_ATTEMPTS) {
    // Cap the exponent so the backoff can't overflow to an Invalid Date
    // (2**1024 = Infinity). 10 → ~8.5h, already an effectively-permanent lock.
    const over = Math.min(kf.failedAttempts - MAX_ATTEMPTS, 10)
    kf.lockedUntil = new Date(Date.now() + LOCK_BASE_MS * 2 ** over).toISOString()
  }
  kf.updatedAt = now()
  writeKeyfile(kf)
  return kf.failedAttempts >= MAX_ATTEMPTS ? lockError(kf) : new Error(message)
}

function clearFailures(kf: KeyfileData): void {
  if (!kf.failedAttempts && !kf.lockedUntil) return
  kf.failedAttempts = 0
  kf.lockedUntil = null
  kf.updatedAt = now()
  writeKeyfile(kf)
}

function lockError(kf: KeyfileData): Error {
  const secs = Math.ceil((Date.parse(kf.lockedUntil as string) - Date.now()) / 1000)
  return new Error(`Too many failed attempts. Try again in ${secs}s.`)
}
