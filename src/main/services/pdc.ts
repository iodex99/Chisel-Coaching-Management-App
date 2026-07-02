import { getDb } from '../db/database'
import { todayISO } from './fy'
import type { PostDatedCheque, PdcInput, PdcFilter, PdcStatus } from '@shared/types'

const now = (): string => new Date().toISOString()

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface PdcRow {
  id: number
  student_id: number | null
  student_name: string | null
  amount: number
  cheque_no: string | null
  bank: string | null
  deposit_date: string
  status: PdcStatus
  notes: string | null
  created_at: string
  updated_at: string
}

const map = (r: PdcRow): PostDatedCheque => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.student_name,
  amount: r.amount,
  chequeNo: r.cheque_no,
  bank: r.bank,
  depositDate: r.deposit_date,
  status: r.status,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

export function listPdcs(filter: PdcFilter = {}): PostDatedCheque[] {
  const where: string[] = []
  const params: (string | number)[] = []
  if (filter.status && filter.status !== 'all') {
    where.push('p.status = ?')
    params.push(filter.status)
  }
  if (filter.search) {
    where.push('(p.student_name LIKE ? OR p.cheque_no LIKE ? OR p.bank LIKE ?)')
    const q = `%${filter.search}%`
    params.push(q, q, q)
  }
  return getDb()
    .all<PdcRow>(
      `SELECT p.* FROM postdated_cheques p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.deposit_date, p.id`,
      params
    )
    .map(map)
}

export function getPdc(id: number): PostDatedCheque | undefined {
  const r = getDb().get<PdcRow>('SELECT * FROM postdated_cheques WHERE id = ?', [id])
  return r ? map(r) : undefined
}

export function createPdc(input: PdcInput): PostDatedCheque {
  if (input.amount <= 0) throw new Error('Amount must be greater than zero')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.depositDate)) throw new Error('A valid deposit date is required')
  const studentName = input.studentId
    ? (getDb().get<{ n: string }>(
        "SELECT (first_name || ' ' || COALESCE(last_name, '')) AS n FROM students WHERE id = ?",
        [input.studentId]
      )?.n ?? null)
    : null
  const ts = now()
  const id = getDb().transaction((d) =>
    d.run(
      `INSERT INTO postdated_cheques (student_id, student_name, amount, cheque_no, bank, deposit_date, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [
        input.studentId ?? null,
        studentName ? studentName.trim() : null,
        input.amount,
        input.chequeNo ?? null,
        input.bank ?? null,
        input.depositDate,
        input.notes ?? null,
        ts,
        ts
      ]
    ).lastInsertRowid
  )
  return getPdc(id) as PostDatedCheque
}

export function setPdcStatus(id: number, status: PdcStatus): void {
  getDb().transaction((d) => d.run('UPDATE postdated_cheques SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]))
}

export function deletePdc(id: number): void {
  getDb().transaction((d) => d.run('DELETE FROM postdated_cheques WHERE id = ?', [id]))
}

/** Pending cheques due for deposit within `days` (includes overdue). */
export function listPdcDue(days = 7): PostDatedCheque[] {
  const until = addDays(todayISO(), days)
  return getDb()
    .all<PdcRow>(
      "SELECT * FROM postdated_cheques WHERE status = 'pending' AND deposit_date <= ? ORDER BY deposit_date, id",
      [until]
    )
    .map(map)
}

/** Count + amount of pending cheques whose deposit date has arrived (<= today). */
export function pdcDueSummary(): { count: number; amount: number } {
  const r = getDb().get<{ c: number; a: number }>(
    "SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS a FROM postdated_cheques WHERE status = 'pending' AND deposit_date <= ?",
    [todayISO()]
  )
  return { count: r?.c ?? 0, amount: r?.a ?? 0 }
}
