import { getDb, type Db } from '../db/database'
import type {
  Student,
  StudentDetail,
  StudentListItem,
  StudentInput,
  StudentFilter,
  Guardian,
  GuardianInput
} from '@shared/types'

const now = (): string => new Date().toISOString()

interface StudentRow {
  id: number
  admission_no: string
  first_name: string
  last_name: string | null
  gender: string | null
  dob: string | null
  phone: string | null
  email: string | null
  address: string | null
  batch_id: number | null
  admission_date: string | null
  status: Student['status']
  notes: string | null
  created_at: string
  updated_at: string
}

function map(r: StudentRow): Student {
  return {
    id: r.id,
    admissionNo: r.admission_no,
    firstName: r.first_name,
    lastName: r.last_name,
    gender: r.gender,
    dob: r.dob,
    phone: r.phone,
    email: r.email,
    address: r.address,
    batchId: r.batch_id,
    admissionDate: r.admission_date,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listStudents(filter: StudentFilter = {}): StudentListItem[] {
  const where: string[] = []
  const params: (string | number)[] = []
  if (filter.status && filter.status !== 'all') {
    where.push('s.status = ?')
    params.push(filter.status)
  }
  if (filter.batchId) {
    where.push('s.batch_id = ?')
    params.push(filter.batchId)
  }
  if (filter.search) {
    where.push('(s.first_name LIKE ? OR s.last_name LIKE ? OR s.admission_no LIKE ? OR s.phone LIKE ?)')
    const q = `%${filter.search}%`
    params.push(q, q, q, q)
  }
  let sql = `
    SELECT s.id, s.admission_no, s.first_name, s.last_name, s.phone, s.status, s.batch_id, b.name AS batch_name
    FROM students s LEFT JOIN batches b ON b.id = s.batch_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY s.first_name, s.last_name`
  if (filter.limit) {
    sql += ' LIMIT ? OFFSET ?'
    params.push(Math.min(filter.limit, 500), filter.offset ?? 0)
  }
  return getDb()
    .all<StudentRow & { batch_name: string | null }>(sql, params)
    .map((r) => ({
      id: r.id,
      admissionNo: r.admission_no,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      status: r.status,
      batchId: r.batch_id,
      batchName: r.batch_name
    }))
}

function loadGuardians(studentId: number): Guardian[] {
  return getDb()
    .all<{ id: number; name: string; relation: string | null; phone: string | null; email: string | null; occupation: string | null }>(
      'SELECT id, name, relation, phone, email, occupation FROM guardians WHERE student_id = ? ORDER BY id',
      [studentId]
    )
    .map((g) => ({ id: g.id, name: g.name, relation: g.relation, phone: g.phone, email: g.email, occupation: g.occupation }))
}

export function getStudent(id: number): StudentDetail | undefined {
  const r = getDb().get<StudentRow & { batch_name: string | null }>(
    'SELECT s.*, b.name AS batch_name FROM students s LEFT JOIN batches b ON b.id = s.batch_id WHERE s.id = ?',
    [id]
  )
  if (!r) return undefined
  return { ...map(r), batchName: r.batch_name, guardians: loadGuardians(id) }
}

function replaceGuardians(d: Db, studentId: number, guardians: GuardianInput[]): void {
  d.run('DELETE FROM guardians WHERE student_id = ?', [studentId])
  for (const g of guardians) {
    if (!g.name?.trim()) continue
    d.run('INSERT INTO guardians (student_id, name, relation, phone, email, occupation) VALUES (?, ?, ?, ?, ?, ?)', [
      studentId,
      g.name.trim(),
      g.relation ?? null,
      g.phone ?? null,
      g.email ?? null,
      g.occupation ?? null
    ])
  }
}

function uniqueError(e: unknown): never {
  if (String(e).includes('UNIQUE')) throw new Error('A student with this admission number already exists')
  throw e
}

export function createStudent(input: StudentInput): StudentDetail {
  const ts = now()
  try {
    const id = getDb().transaction((d) => {
      const sid = d.run(
        `INSERT INTO students (admission_no, first_name, last_name, gender, dob, phone, email, address, batch_id, admission_date, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.admissionNo,
          input.firstName,
          input.lastName ?? null,
          input.gender ?? null,
          input.dob ?? null,
          input.phone ?? null,
          input.email ?? null,
          input.address ?? null,
          input.batchId ?? null,
          input.admissionDate ?? null,
          input.status,
          input.notes ?? null,
          ts,
          ts
        ]
      ).lastInsertRowid
      replaceGuardians(d, sid, input.guardians)
      return sid
    })
    return getStudent(id) as StudentDetail
  } catch (e) {
    return uniqueError(e)
  }
}

export function updateStudent(id: number, input: StudentInput): StudentDetail {
  try {
    getDb().transaction((d) => {
      d.run(
        `UPDATE students SET admission_no = ?, first_name = ?, last_name = ?, gender = ?, dob = ?, phone = ?, email = ?, address = ?, batch_id = ?, admission_date = ?, status = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.admissionNo,
          input.firstName,
          input.lastName ?? null,
          input.gender ?? null,
          input.dob ?? null,
          input.phone ?? null,
          input.email ?? null,
          input.address ?? null,
          input.batchId ?? null,
          input.admissionDate ?? null,
          input.status,
          input.notes ?? null,
          now(),
          id
        ]
      )
      replaceGuardians(d, id, input.guardians)
    })
    return getStudent(id) as StudentDetail
  } catch (e) {
    return uniqueError(e)
  }
}

export function deleteStudent(id: number): void {
  getDb().transaction((d) => d.run('DELETE FROM students WHERE id = ?', [id]))
}

/** Suggest the next admission number based on the highest numeric one seen. */
export function nextAdmissionNo(): string {
  const rows = getDb().all<{ admission_no: string }>('SELECT admission_no FROM students')
  let max = 0
  for (const r of rows) {
    const n = parseInt(r.admission_no.replace(/\D/g, ''), 10)
    if (!Number.isNaN(n) && n > max) max = n
  }
  return String(max + 1)
}
