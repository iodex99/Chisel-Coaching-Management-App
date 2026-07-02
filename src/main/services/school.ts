import { getDb } from '../db/database'
import type { School, SchoolSummary, SchoolInput } from '@shared/types'

const now = (): string => new Date().toISOString()

interface SchoolRow {
  id: number
  name: string
  area: string | null
  contact: string | null
  is_active: number
}

const map = (r: SchoolRow): School => ({
  id: r.id,
  name: r.name,
  area: r.area,
  contact: r.contact,
  isActive: !!r.is_active
})

export function listSchools(): SchoolSummary[] {
  return getDb()
    .all<SchoolRow & { student_count: number }>(
      `SELECT s.id, s.name, s.area, s.contact, s.is_active,
              (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id) AS student_count
       FROM schools s ORDER BY s.is_active DESC, s.name`
    )
    .map((r) => ({ ...map(r), studentCount: r.student_count }))
}

export function createSchool(input: SchoolInput): School {
  const id = getDb().transaction((d) =>
    d.run('INSERT INTO schools (name, area, contact, is_active, created_at) VALUES (?, ?, ?, ?, ?)', [
      input.name,
      input.area ?? null,
      input.contact ?? null,
      input.isActive ? 1 : 0,
      now()
    ]).lastInsertRowid
  )
  return { id, name: input.name, area: input.area ?? null, contact: input.contact ?? null, isActive: input.isActive }
}

export function updateSchool(id: number, input: SchoolInput): School {
  getDb().transaction((d) =>
    d.run('UPDATE schools SET name = ?, area = ?, contact = ?, is_active = ? WHERE id = ?', [
      input.name,
      input.area ?? null,
      input.contact ?? null,
      input.isActive ? 1 : 0,
      id
    ])
  )
  return { id, name: input.name, area: input.area ?? null, contact: input.contact ?? null, isActive: input.isActive }
}

export function deleteSchool(id: number): void {
  const count = getDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM students WHERE school_id = ?', [id])?.c ?? 0
  if (count > 0) throw new Error('Cannot delete a school that still has students. Reassign them first.')
  getDb().transaction((d) => d.run('DELETE FROM schools WHERE id = ?', [id]))
}
