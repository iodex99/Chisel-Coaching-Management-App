import { getDb } from '../db/database'
import { financialYear, financialYearRange, todayISO } from './fy'
import { effectiveVendorLimit } from './account'
import type {
  ExpenseCategory,
  Vendor,
  ExpenseInput,
  ExpenseRecord,
  ExpenseFilter,
  ExpenseSummary,
  VendorLimitInfo
} from '@shared/types'

const now = (): string => new Date().toISOString()
const rs = (paise: number): string => '₹' + (paise / 100).toLocaleString('en-IN')

/** How much has been paid to a vendor from an account in the FY of `dateISO`,
 * and the headroom remaining against the account's per-vendor FY limit. */
export function vendorLimitInfo(
  accountId: number,
  vendorId: number,
  dateISO: string,
  excludeExpenseId?: number
): VendorLimitInfo {
  const fy = financialYear(dateISO)
  const limit = effectiveVendorLimit(accountId, fy)
  const { start, end } = financialYearRange(dateISO)
  const params: (string | number)[] = [accountId, vendorId, start, end]
  let sql =
    'SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE account_id = ? AND vendor_id = ? AND expense_date >= ? AND expense_date <= ?'
  if (excludeExpenseId) {
    sql += ' AND id != ?'
    params.push(excludeExpenseId)
  }
  const spent = getDb().get<{ s: number }>(sql, params)?.s ?? 0
  return { limit, spent, remaining: limit > 0 ? Math.max(0, limit - spent) : 0, fy }
}

/** Block an expense that would push a vendor over the account's FY limit. */
function enforceVendorLimit(input: ExpenseInput, excludeExpenseId?: number): void {
  if (!input.accountId || !input.vendorId) return
  const info = vendorLimitInfo(input.accountId, input.vendorId, input.expenseDate, excludeExpenseId)
  if (info.limit > 0 && info.spent + input.amount > info.limit) {
    throw new Error(
      `This exceeds the per-vendor limit for FY ${info.fy}. Limit ${rs(info.limit)}, already paid ${rs(info.spent)}, remaining ${rs(info.remaining)}.`
    )
  }
}

// --- Categories ---

export function listCategories(): ExpenseCategory[] {
  return getDb()
    .all<{ id: number; name: string; is_active: number }>('SELECT id, name, is_active FROM expense_categories ORDER BY name')
    .map((r) => ({ id: r.id, name: r.name, isActive: !!r.is_active }))
}

export function createCategory(name: string): ExpenseCategory {
  try {
    const id = getDb().transaction((d) =>
      d.run('INSERT INTO expense_categories (name, is_active, created_at) VALUES (?, 1, ?)', [name, now()]).lastInsertRowid
    )
    return { id, name, isActive: true }
  } catch (e) {
    if (String(e).includes('UNIQUE')) throw new Error('A category with this name already exists')
    throw e
  }
}

export function updateCategory(id: number, name: string): void {
  getDb().transaction((d) => d.run('UPDATE expense_categories SET name = ? WHERE id = ?', [name, id]))
}

export function deleteCategory(id: number): void {
  const c = getDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM expenses WHERE category_id = ?', [id])?.c ?? 0
  if (c > 0) throw new Error('Cannot delete a category that is used by expenses')
  getDb().transaction((d) => d.run('DELETE FROM expense_categories WHERE id = ?', [id]))
}

// --- Vendors ---

export function listVendors(): Vendor[] {
  return getDb()
    .all<{ id: number; name: string; contact: string | null; notes: string | null; is_active: number }>(
      'SELECT id, name, contact, notes, is_active FROM vendors ORDER BY name'
    )
    .map((r) => ({ id: r.id, name: r.name, contact: r.contact, notes: r.notes, isActive: !!r.is_active }))
}

export function createVendor(input: { name: string; contact?: string; notes?: string }): Vendor {
  const id = getDb().transaction((d) =>
    d.run('INSERT INTO vendors (name, contact, notes, is_active, created_at) VALUES (?, ?, ?, 1, ?)', [
      input.name,
      input.contact ?? null,
      input.notes ?? null,
      now()
    ]).lastInsertRowid
  )
  return { id, name: input.name, contact: input.contact ?? null, notes: input.notes ?? null, isActive: true }
}

export function updateVendor(id: number, input: { name: string; contact?: string; notes?: string }): void {
  getDb().transaction((d) =>
    d.run('UPDATE vendors SET name = ?, contact = ?, notes = ? WHERE id = ?', [
      input.name,
      input.contact ?? null,
      input.notes ?? null,
      id
    ])
  )
}

export function deleteVendor(id: number): void {
  const c = getDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM expenses WHERE vendor_id = ?', [id])?.c ?? 0
  if (c > 0) throw new Error('Cannot delete a vendor that is used by expenses')
  getDb().transaction((d) => d.run('DELETE FROM vendors WHERE id = ?', [id]))
}

// --- Expenses ---

interface ExpenseRow {
  id: number
  expense_date: string
  category_id: number | null
  category_name: string | null
  vendor_id: number | null
  vendor_name: string | null
  payee: string | null
  amount: number
  mode: ExpenseRecord['mode']
  account_id: number | null
  account_name: string | null
  reference_no: string | null
  remarks: string | null
  created_at: string
}

function map(r: ExpenseRow): ExpenseRecord {
  return {
    id: r.id,
    expenseDate: r.expense_date,
    categoryId: r.category_id,
    categoryName: r.category_name,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    payee: r.payee,
    amount: r.amount,
    mode: r.mode,
    accountId: r.account_id,
    accountName: r.account_name,
    referenceNo: r.reference_no,
    remarks: r.remarks,
    createdAt: r.created_at
  }
}

const SELECT = `
  SELECT e.*, c.name AS category_name, v.name AS vendor_name, a.name AS account_name
  FROM expenses e
  LEFT JOIN expense_categories c ON c.id = e.category_id
  LEFT JOIN vendors v ON v.id = e.vendor_id
  LEFT JOIN accounts a ON a.id = e.account_id`

export function getExpense(id: number): ExpenseRecord | undefined {
  const r = getDb().get<ExpenseRow>(`${SELECT} WHERE e.id = ?`, [id])
  return r ? map(r) : undefined
}

export function listExpenses(filter: ExpenseFilter = {}): ExpenseRecord[] {
  const where: string[] = []
  const params: (string | number)[] = []
  if (filter.dateFrom) {
    where.push('e.expense_date >= ?')
    params.push(filter.dateFrom)
  }
  if (filter.dateTo) {
    where.push('e.expense_date <= ?')
    params.push(filter.dateTo)
  }
  if (filter.categoryId) {
    where.push('e.category_id = ?')
    params.push(filter.categoryId)
  }
  if (filter.vendorId) {
    where.push('e.vendor_id = ?')
    params.push(filter.vendorId)
  }
  if (filter.accountId) {
    where.push('e.account_id = ?')
    params.push(filter.accountId)
  }
  if (filter.mode && filter.mode !== 'all') {
    where.push('e.mode = ?')
    params.push(filter.mode)
  }
  if (filter.search) {
    where.push('(e.payee LIKE ? OR e.remarks LIKE ? OR v.name LIKE ?)')
    const q = `%${filter.search}%`
    params.push(q, q, q)
  }
  let sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.expense_date DESC, e.id DESC`
  if (filter.limit) {
    sql += ' LIMIT ? OFFSET ?'
    params.push(Math.min(filter.limit, 500), filter.offset ?? 0)
  }
  return getDb().all<ExpenseRow>(sql, params).map(map)
}

export function createExpense(input: ExpenseInput, userId = 1): ExpenseRecord {
  if (input.amount <= 0) throw new Error('Amount must be greater than zero')
  enforceVendorLimit(input)
  const ts = now()
  const id = getDb().transaction((d) => {
    const eid = d.run(
      `INSERT INTO expenses (expense_date, category_id, vendor_id, payee, amount, mode, account_id, reference_no, remarks, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.expenseDate,
        input.categoryId ?? null,
        input.vendorId ?? null,
        input.payee ?? null,
        input.amount,
        input.mode,
        input.accountId ?? null,
        input.referenceNo ?? null,
        input.remarks ?? null,
        userId,
        ts
      ]
    ).lastInsertRowid
    d.run('INSERT INTO audit_log (user_id, action, entity, entity_id, created_at) VALUES (?, ?, ?, ?, ?)', [
      userId,
      'expense',
      'expense',
      eid,
      ts
    ])
    return eid
  })
  return getExpense(id) as ExpenseRecord
}

export function updateExpense(id: number, input: ExpenseInput): ExpenseRecord {
  enforceVendorLimit(input, id)
  getDb().transaction((d) =>
    d.run(
      `UPDATE expenses SET expense_date = ?, category_id = ?, vendor_id = ?, payee = ?, amount = ?, mode = ?, account_id = ?, reference_no = ?, remarks = ?
       WHERE id = ?`,
      [
        input.expenseDate,
        input.categoryId ?? null,
        input.vendorId ?? null,
        input.payee ?? null,
        input.amount,
        input.mode,
        input.accountId ?? null,
        input.referenceNo ?? null,
        input.remarks ?? null,
        id
      ]
    )
  )
  return getExpense(id) as ExpenseRecord
}

export function deleteExpense(id: number): void {
  getDb().transaction((d) => d.run('DELETE FROM expenses WHERE id = ?', [id]))
}

export function getExpenseSummary(): ExpenseSummary {
  const monthStart = `${todayISO().slice(0, 7)}-01`
  const monthTotal =
    getDb().get<{ t: number }>('SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE expense_date >= ?', [monthStart])?.t ?? 0
  const allTimeTotal = getDb().get<{ t: number }>('SELECT COALESCE(SUM(amount), 0) AS t FROM expenses')?.t ?? 0

  const byCategory = getDb()
    .all<{ name: string | null; total: number }>(
      `SELECT c.name AS name, SUM(e.amount) AS total FROM expenses e
       LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE e.expense_date >= ? GROUP BY e.category_id ORDER BY total DESC`,
      [monthStart]
    )
    .map((r) => ({ category: r.name ?? 'Uncategorised', total: r.total }))

  const rows = getDb().all<{ ym: string; total: number }>(
    "SELECT substr(expense_date, 1, 7) AS ym, SUM(amount) AS total FROM expenses GROUP BY ym"
  )
  const byMonth = new Map(rows.map((r) => [r.ym, r.total]))
  const fmt = new Intl.DateTimeFormat('en-IN', { month: 'short' })
  const nowDate = new Date()
  const trend: { month: string; label: string; amount: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    trend.push({ month: ym, label: fmt.format(d), amount: byMonth.get(ym) ?? 0 })
  }

  return { monthTotal, allTimeTotal, byCategory, trend }
}
