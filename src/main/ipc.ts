import { app, ipcMain } from 'electron'
import { z, type ZodTypeAny } from 'zod'
import * as auth from './services/auth'
import * as twoFactor from './services/twoFactor'
import * as accounts from './services/account'
import * as batches from './services/batch'
import * as students from './services/student'
import {
  setupSchema,
  loginSchema,
  changePasswordSchema,
  beginEnrollSchema,
  confirmEnrollSchema,
  verifyTwoFactorSchema,
  idSchema,
  accountInputSchema,
  accountUpdateSchema,
  batchInputSchema,
  batchUpdateSchema,
  studentInputSchema,
  studentUpdateSchema,
  studentFilterSchema
} from '@shared/schemas'

type Handler<I> = (input: I) => unknown

function parse<S extends ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join('; '))
  }
  return parsed.data
}

/** Register a handler with optional Zod validation of the payload. */
function handle<S extends ZodTypeAny>(channel: string, schema: S, fn: Handler<z.infer<S>>): void
function handle(channel: string, schema: null, fn: Handler<unknown>): void
function handle(channel: string, schema: ZodTypeAny | null, fn: Handler<unknown>): void {
  ipcMain.handle(channel, async (_event, raw) => fn(schema ? parse(schema, raw) : raw))
}

/** Like `handle`, but requires a fully-authenticated session first. */
function handleAuthed<S extends ZodTypeAny>(channel: string, schema: S, fn: Handler<z.infer<S>>): void
function handleAuthed(channel: string, schema: null, fn: Handler<unknown>): void
function handleAuthed(channel: string, schema: ZodTypeAny | null, fn: Handler<unknown>): void {
  ipcMain.handle(channel, async (_event, raw) => {
    auth.requireSession()
    return fn(schema ? parse(schema, raw) : raw)
  })
}

/** Register all IPC handlers. Each feature domain adds its handlers here. */
export function registerIpc(): void {
  handle('app:getVersion', null, () => app.getVersion())

  // Authentication & session
  handle('auth:getState', null, () => auth.getAuthState())
  handle('auth:setup', setupSchema, (i) => auth.setup(i))
  handle('auth:login', loginSchema, (i) => auth.login(i))
  handle('auth:logout', null, () => auth.logout())
  handle('auth:changePassword', changePasswordSchema, (i) => auth.changePassword(i))

  // Two-factor authentication
  handle('twofactor:beginEnroll', beginEnrollSchema, (i) => {
    const s = auth.requireStage('pending-enroll', 'authenticated')
    return twoFactor.beginEnroll(i.label, s.user.username)
  })
  handle('twofactor:confirmEnroll', confirmEnrollSchema, (i) => {
    auth.requireStage('pending-enroll', 'authenticated')
    const result = twoFactor.confirmEnroll(i.secret, i.label, i.code)
    auth.noteEnrollment()
    return result
  })
  handle('twofactor:verify', verifyTwoFactorSchema, (i) => auth.verifyTwoFactor(i))
  handle('twofactor:generateRecoveryCodes', null, () => {
    auth.requireStage('authenticated')
    return twoFactor.generateRecoveryCodes()
  })
  handle('twofactor:status', null, () => {
    auth.requireStage('authenticated')
    return twoFactor.status()
  })
  handle('twofactor:removeAuthenticator', idSchema, (i) => {
    auth.requireStage('authenticated')
    twoFactor.removeAuthenticator(i.id)
  })
  handle('twofactor:removeTrustedDevice', idSchema, (i) => {
    auth.requireStage('authenticated')
    twoFactor.removeTrustedDevice(i.id)
  })

  // Accounts
  handleAuthed('accounts:list', null, () => accounts.listAccounts())
  handleAuthed('accounts:create', accountInputSchema, (i) => accounts.createAccount(i))
  handleAuthed('accounts:update', accountUpdateSchema, (i) => accounts.updateAccount(i.id, i.input))
  handleAuthed('accounts:remove', idSchema, (i) => accounts.deleteAccount(i.id))

  // Batches
  handleAuthed('batches:list', null, () => batches.listBatches())
  handleAuthed('batches:create', batchInputSchema, (i) => batches.createBatch(i))
  handleAuthed('batches:update', batchUpdateSchema, (i) => batches.updateBatch(i.id, i.input))
  handleAuthed('batches:remove', idSchema, (i) => batches.deleteBatch(i.id))

  // Students
  handleAuthed('students:list', studentFilterSchema, (i) => students.listStudents(i))
  handleAuthed('students:get', idSchema, (i) => students.getStudent(i.id))
  handleAuthed('students:create', studentInputSchema, (i) => students.createStudent(i))
  handleAuthed('students:update', studentUpdateSchema, (i) => students.updateStudent(i.id, i.input))
  handleAuthed('students:remove', idSchema, (i) => students.deleteStudent(i.id))
  handleAuthed('students:nextAdmissionNo', null, () => students.nextAdmissionNo())
}
