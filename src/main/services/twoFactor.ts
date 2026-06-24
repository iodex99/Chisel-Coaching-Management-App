import { randomBytes } from 'crypto'
import { hostname } from 'os'
import { authenticator } from 'otplib'
import qrcode from 'qrcode'
import { getDb } from '../db/database'
import { hashSecret, verifySecret } from '../db/crypto'
import { getDeviceIdentity, computeDeviceHmac } from './device'
import {
  MAX_AUTHENTICATORS,
  MAX_TRUSTED_DEVICES,
  RECOVERY_CODE_COUNT,
  TOTP_ISSUER
} from '@shared/constants'
import type {
  EnrollStart,
  TwoFactorAuthenticator,
  TwoFactorStatus,
  TrustedDevice
} from '@shared/types'

// Allow ±1 time step (30s) to tolerate clock skew between machines.
authenticator.options = { window: 1 }

const now = (): string => new Date().toISOString()

// --- Enrollment ---

export function enrolledCount(): number {
  return getDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM two_factor')?.c ?? 0
}

export async function beginEnroll(label: string | undefined, username: string): Promise<EnrollStart> {
  if (enrolledCount() >= MAX_AUTHENTICATORS) {
    throw new Error(`You can enroll at most ${MAX_AUTHENTICATORS} authenticator apps`)
  }
  const secret = authenticator.generateSecret()
  const accountLabel = label?.trim() ? `${username} (${label.trim()})` : username
  const otpauthUrl = authenticator.keyuri(accountLabel, TOTP_ISSUER, secret)
  const qrDataUrl = await qrcode.toDataURL(otpauthUrl, { margin: 1, width: 220 })
  return { secret, otpauthUrl, qrDataUrl }
}

export function confirmEnroll(secret: string, label: string, code: string): TwoFactorAuthenticator {
  if (enrolledCount() >= MAX_AUTHENTICATORS) {
    throw new Error(`You can enroll at most ${MAX_AUTHENTICATORS} authenticator apps`)
  }
  if (!authenticator.verify({ token: code.replace(/\s/g, ''), secret })) {
    throw new Error('That code is not valid. Make sure your device time is correct and try again.')
  }
  const createdAt = now()
  const finalLabel = label?.trim() || 'Authenticator'
  const id = getDb().transaction((d) =>
    d.run('INSERT INTO two_factor (label, secret, created_at) VALUES (?, ?, ?)', [
      finalLabel,
      secret,
      createdAt
    ]).lastInsertRowid
  )
  return { id, label: finalLabel, createdAt, lastUsedAt: null }
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
  if (!candidate) return false
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

// --- Trusted devices ---

export function isCurrentDeviceTrusted(): boolean {
  const { deviceId, deviceSecret } = getDeviceIdentity()
  const row = getDb().get<{ hmac: string }>('SELECT hmac FROM trusted_devices WHERE device_id = ?', [deviceId])
  if (!row) return false
  if (row.hmac !== computeDeviceHmac(deviceId, deviceSecret)) return false
  getDb().transaction((d) =>
    d.run('UPDATE trusted_devices SET last_seen_at = ? WHERE device_id = ?', [now(), deviceId])
  )
  return true
}

export function trustCurrentDevice(label?: string): void {
  const { deviceId, deviceSecret } = getDeviceIdentity()
  if (getDb().get('SELECT id FROM trusted_devices WHERE device_id = ?', [deviceId])) return
  const count = getDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM trusted_devices')?.c ?? 0
  if (count >= MAX_TRUSTED_DEVICES) {
    throw new Error(`You can trust at most ${MAX_TRUSTED_DEVICES} devices. Remove one in Settings first.`)
  }
  const createdAt = now()
  getDb().transaction((d) =>
    d.run('INSERT INTO trusted_devices (device_id, hmac, label, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)', [
      deviceId,
      computeDeviceHmac(deviceId, deviceSecret),
      label?.trim() || hostname(),
      createdAt,
      createdAt
    ])
  )
}

export function listTrustedDevices(): TrustedDevice[] {
  const { deviceId } = getDeviceIdentity()
  return getDb()
    .all<{ id: number; device_id: string; label: string | null; created_at: string; last_seen_at: string | null }>(
      'SELECT id, device_id, label, created_at, last_seen_at FROM trusted_devices ORDER BY created_at'
    )
    .map((r) => ({
      id: r.id,
      label: r.label ?? 'Device',
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      current: r.device_id === deviceId
    }))
}

export function removeTrustedDevice(id: number): void {
  getDb().transaction((d) => d.run('DELETE FROM trusted_devices WHERE id = ?', [id]))
}

// --- Aggregate status (Settings) ---

export function status(): TwoFactorStatus {
  return {
    enrolledCount: enrolledCount(),
    authenticators: listAuthenticators(),
    recoveryCodesRemaining: recoveryCodesRemaining(),
    deviceTrusted: isCurrentDeviceTrusted(),
    trustedDevices: listTrustedDevices()
  }
}
