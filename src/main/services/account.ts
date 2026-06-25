import { getDb, type Db } from '../db/database'
import type { Account, AccountInput, AccountFyLimit } from '@shared/types'

const now = (): string => new Date().toISOString()

function loadFyLimits(accountId: number): AccountFyLimit[] {
  return getDb()
    .all<{ fy: string; limit_amount: number }>(
      'SELECT fy, limit_amount FROM account_vendor_limits WHERE account_id = ? ORDER BY fy',
      [accountId]
    )
    .map((r) => ({ fy: r.fy, limit: r.limit_amount }))
}

function replaceFyLimits(d: Db, accountId: number, limits: AccountFyLimit[] | undefined): void {
  d.run('DELETE FROM account_vendor_limits WHERE account_id = ?', [accountId])
  for (const l of limits ?? []) {
    if (!l.fy?.trim()) continue
    d.run('INSERT INTO account_vendor_limits (account_id, fy, limit_amount) VALUES (?, ?, ?)', [
      accountId,
      l.fy.trim(),
      l.limit
    ])
  }
}

/** The per-vendor limit that applies to a given FY: the override if set, else the account default. */
export function effectiveVendorLimit(accountId: number, fy: string): number {
  const override = getDb().get<{ limit_amount: number }>(
    'SELECT limit_amount FROM account_vendor_limits WHERE account_id = ? AND fy = ?',
    [accountId, fy]
  )
  if (override) return override.limit_amount
  return getDb().get<{ vendor_fy_limit: number }>('SELECT vendor_fy_limit FROM accounts WHERE id = ?', [accountId])?.vendor_fy_limit ?? 0
}

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
    vendorFyLimits: loadFyLimits(r.id),
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
  const id = getDb().transaction((d) => {
    const newId = d.run(
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
    replaceFyLimits(d, newId, input.vendorFyLimits)
    return newId
  })
  return getAccount(id) as Account
}

export function updateAccount(id: number, input: AccountInput): Account {
  getDb().transaction((d) => {
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
    replaceFyLimits(d, id, input.vendorFyLimits)
  })
  return getAccount(id) as Account
}

export function deleteAccount(id: number): void {
  getDb().transaction((d) => d.run('DELETE FROM accounts WHERE id = ?', [id]))
}
