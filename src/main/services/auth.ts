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
  getDb,
  dbFileExists,
  backupDbFile
} from '../db/database'
import type { AuthState, SetupInput, LoginInput, ChangePasswordInput, User } from '@shared/types'

const MAX_ATTEMPTS = 5
const LOCK_BASE_MS = 30_000 // doubles for each failure past the threshold

interface Session {
  user: User
  key: Buffer
  loginAt: number
  lastActivity: number
}

let session: Session | null = null

export function isInitialized(): boolean {
  return keyfileExists() && dbFileExists()
}

export function getAuthState(): AuthState {
  if (!isInitialized()) {
    return { initialized: false, authenticated: false, locked: false, lockedUntil: null, username: null }
  }
  const kf = readKeyfile()
  const lockedUntilMs = kf.lockedUntil ? Date.parse(kf.lockedUntil) : 0
  const locked = lockedUntilMs > Date.now()
  return {
    initialized: true,
    authenticated: session !== null,
    locked,
    lockedUntil: locked ? new Date(lockedUntilMs).toISOString() : null,
    username: kf.username
  }
}

/** First-run setup: create the admin, initialize the encrypted DB, log in. */
export async function setup(input: SetupInput): Promise<User> {
  if (isInitialized()) throw new Error('The application is already set up')

  const salt = generateSalt()
  const params: KdfParams = DEFAULT_KDF
  const key = deriveKey(input.password, salt, params)

  const db = await createNewDatabase(key)
  const now = new Date().toISOString()
  db.transaction((d) => {
    d.run('INSERT INTO app_user (id, username, display_name, created_at, updated_at) VALUES (1, ?, ?, ?, ?)', [
      input.username,
      input.username,
      now,
      now
    ])
    d.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [
      'institute.name',
      input.instituteName?.trim() || 'Chisel Coaching Classes',
      now
    ])
    d.run('INSERT INTO audit_log (user_id, action, created_at) VALUES (1, ?, ?)', ['setup', now])
  })

  createKeyfile(input.username, salt, params)

  const user: User = { id: 1, username: input.username, displayName: input.username }
  session = { user, key, loginAt: Date.now(), lastActivity: Date.now() }
  log.info(`First-run setup completed for "${input.username}"`)
  return user
}

/** Verify the master password by decrypting the DB; manage lockout. */
export async function login(input: LoginInput): Promise<User> {
  if (!isInitialized()) throw new Error('The application is not set up yet')
  const kf = readKeyfile()

  if (kf.lockedUntil && Date.parse(kf.lockedUntil) > Date.now()) {
    throw lockError(kf)
  }

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

  // Success — reset lockout counters.
  kf.failedAttempts = 0
  kf.lockedUntil = null
  kf.updatedAt = new Date().toISOString()
  writeKeyfile(kf)

  const row = getDb().get<{ username: string; display_name: string | null }>(
    'SELECT username, display_name FROM app_user WHERE id = 1'
  )
  const user: User = {
    id: 1,
    username: row?.username ?? kf.username,
    displayName: row?.display_name ?? row?.username ?? kf.username
  }
  session = { user, key, loginAt: Date.now(), lastActivity: Date.now() }

  getDb().transaction((d) =>
    d.run('INSERT INTO audit_log (user_id, action, created_at) VALUES (1, ?, ?)', [
      'login',
      new Date().toISOString()
    ])
  )
  log.info(`User "${user.username}" logged in`)
  return user
}

export function logout(): void {
  if (session) {
    try {
      getDb().transaction((d) =>
        d.run('INSERT INTO audit_log (user_id, action, created_at) VALUES (1, ?, ?)', [
          'logout',
          new Date().toISOString()
        ])
      )
    } catch {
      /* ignore */
    }
  }
  closeDatabase()
  session = null
}

export function currentUser(): User | null {
  return session?.user ?? null
}

/** Assert an active session and refresh its activity timestamp. */
export function requireSession(): Session {
  if (!session) throw new Error('Not authenticated')
  session.lastActivity = Date.now()
  return session
}

/** Change the master password and re-encrypt the database under the new key. */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const s = requireSession()
  const kf = readKeyfile()

  const currentKey = deriveKey(input.currentPassword, Buffer.from(kf.kdf.salt, 'base64'), kf.kdf)
  if (!currentKey.equals(s.key)) {
    throw new Error('Current password is incorrect')
  }

  backupDbFile('pre-rekey')

  const newSalt = generateSalt()
  const newKey = deriveKey(input.newPassword, newSalt, DEFAULT_KDF)
  getDb().rekey(newKey)

  kf.kdf = { salt: newSalt.toString('base64'), ...DEFAULT_KDF }
  kf.updatedAt = new Date().toISOString()
  writeKeyfile(kf)
  s.key = newKey

  getDb().transaction((d) =>
    d.run('INSERT INTO audit_log (user_id, action, created_at) VALUES (1, ?, ?)', [
      'change-password',
      new Date().toISOString()
    ])
  )
  log.info('Master password changed')
}

function registerFailure(kf: KeyfileData): void {
  kf.failedAttempts = (kf.failedAttempts ?? 0) + 1
  if (kf.failedAttempts >= MAX_ATTEMPTS) {
    const over = kf.failedAttempts - MAX_ATTEMPTS
    const lockMs = LOCK_BASE_MS * 2 ** over
    kf.lockedUntil = new Date(Date.now() + lockMs).toISOString()
  }
  kf.updatedAt = new Date().toISOString()
  writeKeyfile(kf)
}

function lockError(kf: KeyfileData): Error {
  const secs = Math.ceil((Date.parse(kf.lockedUntil as string) - Date.now()) / 1000)
  return new Error(`Too many failed attempts. Try again in ${secs}s.`)
}
