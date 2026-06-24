import { getDb } from '../db/database'
import type { Batch, BatchSummary, BatchInput } from '@shared/types'

const now = (): string => new Date().toISOString()

interface BatchRow {
  id: number
  name: string
  course_name: string | null
  academic_year: string | null
  default_fee: number
  start_date: string | null
  end_date: string | null
  status: Batch['status']
  notes: string | null
  created_at: string
  updated_at: string
}

function map(r: BatchRow): Batch {
  return {
    id: r.id,
    name: r.name,
    courseName: r.course_name,
    academicYear: r.academic_year,
    defaultFee: r.default_fee,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listBatches(): BatchSummary[] {
  return getDb()
    .all<BatchRow & { student_count: number }>(
      `SELECT b.*, (SELECT COUNT(*) FROM students s WHERE s.batch_id = b.id) AS student_count
       FROM batches b ORDER BY b.status, b.name`
    )
    .map((r) => ({ ...map(r), studentCount: r.student_count }))
}

export function getBatch(id: number): Batch | undefined {
  const r = getDb().get<BatchRow>('SELECT * FROM batches WHERE id = ?', [id])
  return r ? map(r) : undefined
}

export function createBatch(input: BatchInput): Batch {
  const ts = now()
  const id = getDb().transaction((d) =>
    d.run(
      `INSERT INTO batches (name, course_name, academic_year, default_fee, start_date, end_date, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.courseName ?? null,
        input.academicYear ?? null,
        input.defaultFee,
        input.startDate ?? null,
        input.endDate ?? null,
        input.status,
        input.notes ?? null,
        ts,
        ts
      ]
    ).lastInsertRowid
  )
  return getBatch(id) as Batch
}

export function updateBatch(id: number, input: BatchInput): Batch {
  getDb().transaction((d) =>
    d.run(
      `UPDATE batches SET name = ?, course_name = ?, academic_year = ?, default_fee = ?, start_date = ?, end_date = ?, status = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        input.name,
        input.courseName ?? null,
        input.academicYear ?? null,
        input.defaultFee,
        input.startDate ?? null,
        input.endDate ?? null,
        input.status,
        input.notes ?? null,
        now(),
        id
      ]
    )
  )
  return getBatch(id) as Batch
}

export function deleteBatch(id: number): void {
  const count = getDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM students WHERE batch_id = ?', [id])?.c ?? 0
  if (count > 0) {
    throw new Error('Cannot delete a batch that still has students. Reassign them first.')
  }
  getDb().transaction((d) => d.run('DELETE FROM batches WHERE id = ?', [id]))
}
