import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
    getPath: () => process.cwd()
  }
}))
vi.mock('electron-log/main', () => ({
  default: { info: () => undefined, warn: () => undefined, error: () => undefined }
}))

import * as auth from './auth'
import * as accounts from './account'
import * as batches from './batch'
import * as students from './student'
import { ensureDataDirs } from '../paths'

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-core-'))
  process.env.CHISEL_DATA_DIR = dataDir
  ensureDataDirs()
  await auth.setup({ username: 'admin', password: 'password123', instituteName: 'Test' })
})

afterAll(() => {
  delete process.env.CHISEL_DATA_DIR
  rmSync(dataDir, { recursive: true, force: true })
})

describe('accounts', () => {
  it('creates, updates, lists and deletes', () => {
    const a = accounts.createAccount({ name: 'Cash Drawer', type: 'cash', openingBalance: 50000, isActive: true })
    expect(a.id).toBeGreaterThan(0)
    expect(a.openingBalance).toBe(50000)
    const updated = accounts.updateAccount(a.id, { name: 'Main Cash', type: 'cash', openingBalance: 0, isActive: true })
    expect(updated.name).toBe('Main Cash')
    expect(accounts.listAccounts()).toHaveLength(1)
    accounts.deleteAccount(a.id)
    expect(accounts.listAccounts()).toHaveLength(0)
  })
})

describe('batches & students', () => {
  it('manages batches with student-count and delete guard', () => {
    const b = batches.createBatch({ name: 'NEET 2026', defaultFee: 5000000, status: 'active' })
    expect(b.defaultFee).toBe(5000000)
    let list = batches.listBatches()
    expect(list[0].studentCount).toBe(0)

    const s = students.createStudent({
      admissionNo: 'A-001',
      firstName: 'Asha',
      lastName: 'Verma',
      status: 'active',
      batchId: b.id,
      guardians: [{ name: 'Ramesh Verma', relation: 'Father', phone: '9000000000' }]
    })
    expect(s.guardians).toHaveLength(1)
    expect(s.batchName).toBe('NEET 2026')

    list = batches.listBatches()
    expect(list[0].studentCount).toBe(1)
    expect(() => batches.deleteBatch(b.id)).toThrow() // has a student
  })

  it('enforces unique admission numbers and filters', () => {
    expect(() =>
      students.createStudent({ admissionNo: 'A-001', firstName: 'Dup', status: 'active', guardians: [] })
    ).toThrow(/already exists/)

    students.createStudent({ admissionNo: 'A-002', firstName: 'Bilal', status: 'inactive', guardians: [] })

    expect(students.listStudents({ status: 'active' })).toHaveLength(1)
    expect(students.listStudents({ search: 'Bilal' })).toHaveLength(1)
    expect(students.listStudents({ status: 'all' }).length).toBeGreaterThanOrEqual(2)
    expect(students.nextAdmissionNo()).toBe('3')
  })

  it('updates guardians (replace) and cascades on delete', () => {
    const list = students.listStudents({ search: 'Asha' })
    const id = list[0].id
    const updated = students.updateStudent(id, {
      admissionNo: 'A-001',
      firstName: 'Asha',
      lastName: 'Verma',
      status: 'active',
      guardians: [
        { name: 'Ramesh Verma', relation: 'Father' },
        { name: 'Sita Verma', relation: 'Mother' }
      ]
    })
    expect(updated.guardians).toHaveLength(2)

    students.deleteStudent(id)
    expect(students.getStudent(id)).toBeUndefined()
  })
})
