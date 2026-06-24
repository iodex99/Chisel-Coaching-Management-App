import { getDb } from '../db/database'
import type { InstituteProfile } from '@shared/types'

const now = (): string => new Date().toISOString()

const KEYS = {
  name: 'institute.name',
  address: 'institute.address',
  phone: 'institute.phone',
  email: 'institute.email',
  receiptPrefix: 'receipt.prefix',
  receiptFooter: 'receipt.footer'
} as const

export function getSetting(key: string): string | null {
  return getDb().get<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb().transaction((d) =>
    d.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now()]
    )
  )
}

export function getInstituteProfile(): InstituteProfile {
  return {
    name: getSetting(KEYS.name) || 'Chisel Coaching Classes',
    address: getSetting(KEYS.address) || '',
    phone: getSetting(KEYS.phone) || '',
    email: getSetting(KEYS.email) || '',
    receiptPrefix: getSetting(KEYS.receiptPrefix) || 'CHISEL',
    receiptFooter: getSetting(KEYS.receiptFooter) || ''
  }
}

export function updateInstituteProfile(profile: InstituteProfile): InstituteProfile {
  getDb().transaction((d) => {
    const pairs: [string, string][] = [
      [KEYS.name, profile.name],
      [KEYS.address, profile.address],
      [KEYS.phone, profile.phone],
      [KEYS.email, profile.email],
      [KEYS.receiptPrefix, profile.receiptPrefix],
      [KEYS.receiptFooter, profile.receiptFooter]
    ]
    for (const [key, value] of pairs) {
      d.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value ?? '', now()]
      )
    }
  })
  return getInstituteProfile()
}
