import { randomBytes } from 'crypto'
import { authenticator } from 'otplib'
import qrcode from 'qrcode'
import { getDb, type Db } from '../db/database'
import { hashSecret, verifySecret } from '../db/crypto'
import { MAX_AUTHENTICATORS, RECOVERY_CODE_COUNT, TOTP_ISSUER } from '@shared/constants'
import type { EnrollStart, TwoFactorAuthenticator, TwoFactorStatus } from '@shared/types'

// Allow ±1 time step (30s) to tolerate clock skew between machines.
authenticator.options = { window: 1 }

const now = (): string => new Date().toISOString()

// --- Enrollment ---

export function enrolledCount(): number {
  return getDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM two_factor')?.c ?? 0
}

/** A fresh TOTP secret + QR code. Needs no database, so first-run setup can
 *  show it before any data exists. `account` is the name shown in the app. */
export async function newEnrollment(account: string, label?: string): Promise<EnrollStart> {
  const secret = authenticator.generateSecret()
  const name = account.trim() || 'Admin'
  const accountLabel = label?.trim() ? `${name} (${label.trim()})` : name
  const otpauthUrl = authenticator.keyuri(accountLabel, TOTP_ISSUER, secret)
  const qrDataUrl = await qrcode.toDataURL(otpauthUrl, { margin: 1, width: 220 })
  return { secret, otpauthUrl, qrDataUrl }
}

export async function beginEnroll(label: string | undefined, account: string): Promise<EnrollStart> {
  if (enrolledCount() >= MAX_AUTHENTICATORS) {
    throw new Error(`You can enroll at most ${MAX_AUTHENTICATORS} authenticator apps`)
  }
  return newEnrollment(account, label)
}

/** Throws unless `code` is the current code for `secret` (±30s). */
export function assertSecretCode(secret: string, code: string): void {
  if (!authenticator.verify({ token: code.replace(/\s/g, ''), secret })) {
    throw new Error('That code is not valid. Make sure your device time is correct and try again.')
  }
}

/** Store an authenticator. Use inside an open transaction or via confirmEnroll. */
export function insertAuthenticator(d: Db, secret: string, label: string): TwoFactorAuthenticator {
  const createdAt = now()
  const finalLabel = label?.trim() || 'Authenticator'
  const id = d.run('INSERT INTO two_factor (label, secret, created_at) VALUES (?, ?, ?)', [
    finalLabel,
    secret,
    createdAt
  ]).lastInsertRowid
  return { id, label: finalLabel, createdAt, lastUsedAt: null }
}

export function confirmEnroll(secret: string, label: string, code: string): TwoFactorAuthenticator {
  if (enrolledCount() >= MAX_AUTHENTICATORS) {
    throw new Error(`You can enroll at most ${MAX_AUTHENTICATORS} authenticator apps`)
  }
  assertSecretCode(secret, code)
  if (getDb().get('SELECT id FROM two_factor WHERE secret = ?', [secret])) {
    throw new Error('This authenticator is already added')
  }
  return getDb().transaction((d) => insertAuthenticator(d, secret, label))
}

export function listAuthenticators(): TwoFactorAuthenticator[] {
  return getDb()
    .all<{ id: number; label: string; created_at: string; last_used_at: string | null }>(
      'SELECT id, label, created_at, last_used_at FROM two_factor ORDER BY created_at'
    )
    .map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at }))
}

export function removeAuthenticator(id: number): void {
  if (enrolledCount() <= 1) {
    throw new Error('At least one authenticator must remain — two-factor authentication is required.')
  }
  getDb().transaction((d) => d.run('DELETE FROM two_factor WHERE id = ?', [id]))
}

// --- Verification ---

export function verifyTotp(code: string): boolean {
  const token = code.replace(/\s/g, '')
  const rows = getDb().all<{ id: number; secret: string }>('SELECT id, secret FROM two_factor')
  for (const r of rows) {
    if (authenticator.verify({ token, secret: r.secret })) {
      getDb().transaction((d) => d.run('UPDATE two_factor SET last_used_at = ? WHERE id = ?', [now(), r.id]))
      return true
    }
  }
  return false
}

// --- Recovery codes ---

function formatRecoveryCode(bytes: Buffer): string {
  const hex = bytes.toString('hex').toUpperCase() // 10 chars from 5 bytes
  return `${hex.slice(0, 5)}-${hex.slice(5)}`
}

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

export function generateRecoveryCodes(): string[] {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => formatRecoveryCode(randomBytes(5)))
  const createdAt = now()
  getDb().transaction((d) => {
    d.run('DELETE FROM recovery_codes')
    for (const c of codes) {
      d.run('INSERT INTO recovery_codes (code_hash, created_at) VALUES (?, ?)', [
        hashSecret(normalizeRecoveryCode(c)),
        createdAt
      ])
    }
  })
  return codes
}

export function verifyRecoveryCode(code: string): boolean {
  const candidate = normalizeRecoveryCode(code)
  // Recovery codes are exactly 10 hex characters (XXXXX-XXXXX); anything else
  // (e.g. a 6-digit authenticator code) cannot match, so skip the scrypt work.
  if (!/^[0-9A-F]{10}$/.test(candidate)) return false
  const rows = getDb().all<{ id: number; code_hash: string }>(
    'SELECT id, code_hash FROM recovery_codes WHERE used_at IS NULL'
  )
  for (const r of rows) {
    if (verifySecret(candidate, r.code_hash)) {
      getDb().transaction((d) => d.run('UPDATE recovery_codes SET used_at = ? WHERE id = ?', [now(), r.id]))
      return true
    }
  }
  return false
}

export function recoveryCodesRemaining(): number {
  return getDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM recovery_codes WHERE used_at IS NULL')?.c ?? 0
}

// --- Aggregate status (Settings) ---

export function status(): TwoFactorStatus {
  return {
    enrolledCount: enrolledCount(),
    authenticators: listAuthenticators(),
    recoveryCodesRemaining: recoveryCodesRemaining()
  }
}
