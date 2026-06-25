import { getDb } from '../db/database'
import type { Account, AccountInput } from '@shared/types'

const now = (): string => new Date().toISOString()

interface AccountRow {
  id: number
  name: string
  type: Account['type']
  opening_balance: number
  is_active: number
  notes: string | null
  vendor_fy_limit: number
  created_at: string
  updated_at: string
}

function map(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    openingBalance: r.opening_balance,
    isActive: !!r.is_active,
    notes: r.notes,
    vendorFyLimit: r.vendor_fy_limit ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listAccounts(includeInactive = true): Account[] {
  const sql = includeInactive
    ? 'SELECT * FROM accounts ORDER BY is_active DESC, name'
    : 'SELECT * FROM accounts WHERE is_active = 1 ORDER BY name'
  return getDb().all<AccountRow>(sql).map(map)
}

export function getAccount(id: number): Account | undefined {
  const r = getDb().get<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id])
  return r ? map(r) : undefined
}

export function createAccount(input: AccountInput): Account {
  const ts = now()
  const id = getDb().transaction((d) =>
    d.run(
      'INSERT INTO accounts (name, type, opening_balance, is_active, notes, vendor_fy_limit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        input.name,
        input.type,
        input.openingBalance,
        input.isActive ? 1 : 0,
        input.notes ?? null,
        input.vendorFyLimit ?? 0,
        ts,
        ts
      ]
    ).lastInsertRowid
  )
  return getAccount(id) as Account
}

export function updateAccount(id: number, input: AccountInput): Account {
  getDb().transaction((d) =>
    d.run(
      'UPDATE accounts SET name = ?, type = ?, opening_balance = ?, is_active = ?, notes = ?, vendor_fy_limit = ?, updated_at = ? WHERE id = ?',
      [
        input.name,
        input.type,
        input.openingBalance,
        input.isActive ? 1 : 0,
        input.notes ?? null,
        input.vendorFyLimit ?? 0,
        now(),
        id
      ]
    )
  )
  return getAccount(id) as Account
}

export function deleteAccount(id: number): void {
  getDb().transaction((d) => d.run('DELETE FROM accounts WHERE id = ?', [id]))
}
