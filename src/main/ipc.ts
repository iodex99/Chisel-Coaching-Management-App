import { app, ipcMain, shell } from 'electron'
import { z, type ZodTypeAny } from 'zod'
import { resolveDataDir } from './paths'
import * as auth from './services/auth'
import * as twoFactor from './services/twoFactor'
import * as accounts from './services/account'
import * as batches from './services/batch'
import * as students from './services/student'
import * as fees from './services/fee'
import * as settings from './services/settings'
import * as payments from './services/payment'
import * as receipts from './services/receipt'
import * as dashboard from './services/dashboard'
import * as expenses from './services/expense'
import * as reports from './services/report'
import * as backup from './services/backup'
import * as updater from './services/update'
import * as importer from './services/import'
import {
  setupSchema,
  loginSchema,
  verifyPasswordSchema,
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
  studentFilterSchema,
  feePlanSaveSchema,
  studentIdSchema,
  instituteProfileSchema,
  paymentInputSchema,
  paymentFilterSchema,
  cancelPaymentSchema,
  paymentIdSchema,
  upcomingSchema,
  expenseCategoryInputSchema,
  expenseCategoryUpdateSchema,
  vendorInputSchema,
  vendorUpdateSchema,
  expenseInputSchema,
  expenseUpdateSchema,
  expenseFilterSchema,
  reportRequestSchema,
  backupNameSchema,
  autoBackupSchema
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
  handle('app:getDataDir', null, () => resolveDataDir())
  handle('app:openDataDir', null, () => shell.openPath(resolveDataDir()))

  // Authentication & session
  handle('auth:getState', null, () => auth.getAuthState())
  handle('auth:setup', setupSchema, (i) => auth.setup(i))
  handle('auth:login', loginSchema, (i) => auth.login(i))
  handle('auth:logout', null, () => auth.logout())
  handleAuthed('auth:verifyPassword', verifyPasswordSchema, (i) => auth.verifyPassword(i.password))
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

  // Fees
  handleAuthed('fees:getPlan', studentIdSchema, (i) => fees.getFeePlan(i.studentId))
  handleAuthed('fees:savePlan', feePlanSaveSchema, (i) => fees.saveFeePlan(i.studentId, i.input))
  handleAuthed('fees:deletePlan', studentIdSchema, (i) => fees.deleteFeePlan(i.studentId))
  handleAuthed('fees:summaries', null, () => fees.listFeeSummaries())

  // Settings (institute profile)
  handleAuthed('settings:getProfile', null, () => settings.getInstituteProfile())
  handleAuthed('settings:updateProfile', instituteProfileSchema, (i) => settings.updateInstituteProfile(i))

  // Payments
  handleAuthed('payments:record', paymentInputSchema, (i) => payments.recordPayment(i, auth.currentUser()?.id ?? 1))
  handleAuthed('payments:list', paymentFilterSchema, (i) => payments.listPayments(i))
  handleAuthed('payments:get', paymentIdSchema, (i) => payments.getPayment(i.paymentId))
  handleAuthed('payments:cancel', cancelPaymentSchema, (i) => payments.cancelPayment(i.id, i.reason))

  // Receipts
  handleAuthed('receipts:exportPdf', paymentIdSchema, (i) => receipts.exportPdf(i.paymentId))
  handleAuthed('receipts:print', paymentIdSchema, (i) => receipts.printReceipt(i.paymentId))

  // Dashboard & due monitoring
  handleAuthed('dashboard:get', null, () => dashboard.getDashboard())
  handleAuthed('dues:overdue', null, () => dashboard.listOverdue())
  handleAuthed('dues:upcoming', upcomingSchema, (i) => dashboard.listUpcoming(i.days))

  // Expense categories
  handleAuthed('expenseCategories:list', null, () => expenses.listCategories())
  handleAuthed('expenseCategories:create', expenseCategoryInputSchema, (i) => expenses.createCategory(i.name))
  handleAuthed('expenseCategories:update', expenseCategoryUpdateSchema, (i) => expenses.updateCategory(i.id, i.input.name))
  handleAuthed('expenseCategories:remove', idSchema, (i) => expenses.deleteCategory(i.id))

  // Vendors
  handleAuthed('vendors:list', null, () => expenses.listVendors())
  handleAuthed('vendors:create', vendorInputSchema, (i) => expenses.createVendor(i))
  handleAuthed('vendors:update', vendorUpdateSchema, (i) => expenses.updateVendor(i.id, i.input))
  handleAuthed('vendors:remove', idSchema, (i) => expenses.deleteVendor(i.id))

  // Expenses
  handleAuthed('expenses:list', expenseFilterSchema, (i) => expenses.listExpenses(i))
  handleAuthed('expenses:create', expenseInputSchema, (i) => expenses.createExpense(i, auth.currentUser()?.id ?? 1))
  handleAuthed('expenses:update', expenseUpdateSchema, (i) => expenses.updateExpense(i.id, i.input))
  handleAuthed('expenses:remove', idSchema, (i) => expenses.deleteExpense(i.id))
  handleAuthed('expenses:summary', null, () => expenses.getExpenseSummary())

  // Reports
  handleAuthed('reports:get', reportRequestSchema, (i) => reports.getReport(i.type, { from: i.from, to: i.to }))
  handleAuthed('reports:exportPdf', reportRequestSchema, (i) => reports.exportReportPdf(i.type, { from: i.from, to: i.to }))
  handleAuthed('reports:exportExcel', reportRequestSchema, (i) => reports.exportReportExcel(i.type, { from: i.from, to: i.to }))

  // Backups
  handleAuthed('backups:list', null, () => backup.listBackups())
  handleAuthed('backups:create', null, () => backup.createBackup('manual'))
  handleAuthed('backups:remove', backupNameSchema, (i) => backup.deleteBackup(i.name))
  handleAuthed('backups:restore', backupNameSchema, (i) => backup.restoreBackup(i.name))
  handleAuthed('backups:getAuto', null, () => backup.getAutoBackup())
  handleAuthed('backups:setAuto', autoBackupSchema, (i) => backup.setAutoBackup(i.enabled))

  // Updates
  handleAuthed('update:check', null, () => updater.checkForUpdate())
  handleAuthed('update:install', null, () => updater.downloadAndInstall())

  // Bulk import (binary xlsx payloads, so no Zod schema)
  handleAuthed('bulk:studentTemplate', null, () => importer.generateStudentTemplate())
  handleAuthed('bulk:importStudents', null, (raw) => importer.importStudents(Buffer.from(raw as Uint8Array)))
  handleAuthed('bulk:feeTemplate', null, () => importer.generateFeeTemplate())
  handleAuthed('bulk:importFees', null, (raw) => importer.importFees(Buffer.from(raw as Uint8Array)))
}
