import { z } from 'zod'

/** Minimum master-password length. Surfaced in the UI too. */
export const MIN_PASSWORD_LENGTH = 8

// Dates are stored as ISO yyyy-mm-dd (the renderer's DateField always emits this
// or an empty string). Validate the format so a malformed date can never reach
// the date math (financial-year, ranges) and produce NaN.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isoDateRequired = (msg: string) => z.string().trim().refine((v) => ISO_DATE.test(v), msg)
const isoDateOptional = z
  .string()
  .trim()
  .refine((v) => v === '' || ISO_DATE.test(v), 'Enter a valid date')
  .optional()

export const setupSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(40),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
  instituteName: z.string().trim().max(120).optional()
})

export const loginSchema = z.object({
  username: z.string().trim().max(40).optional(),
  password: z.string().min(1, 'Password is required').max(200)
})

export const verifyPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required').max(200)
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200)
})

// --- Two-factor authentication ---

export const beginEnrollSchema = z.object({
  label: z.string().trim().max(40).optional()
})

export const confirmEnrollSchema = z.object({
  secret: z.string().min(8).max(128),
  label: z.string().trim().max(40).optional().default('Authenticator'),
  code: z.string().trim().min(6).max(10)
})

export const verifyTwoFactorSchema = z.object({
  code: z.string().trim().min(6).max(20),
  trustDevice: z.boolean().optional()
})

export const idSchema = z.object({
  id: z.number().int().positive()
})

// --- Accounts ---

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  type: z.enum(['cash', 'bank', 'upi', 'other']),
  openingBalance: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
  vendorFyLimit: z.number().int().min(0).default(0),
  vendorFyLimits: z
    .array(
      z.object({
        fy: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Financial year must look like 2026-27'),
        limit: z.number().int().min(0)
      })
    )
    .max(30)
    .optional()
})
export const accountUpdateSchema = z.object({ id: z.number().int().positive(), input: accountInputSchema })

// --- Batches ---

export const batchInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  courseName: z.string().trim().max(80).optional(),
  academicYear: z.string().trim().max(20).optional(),
  defaultFee: z.number().int().min(0).default(0),
  startDate: isoDateOptional,
  endDate: isoDateOptional,
  status: z.enum(['active', 'inactive']).default('active'),
  notes: z.string().trim().max(500).optional()
})
export const batchUpdateSchema = z.object({ id: z.number().int().positive(), input: batchInputSchema })

// --- Students & guardians ---

export const guardianInputSchema = z.object({
  name: z.string().trim().min(1, 'Guardian name is required').max(80),
  relation: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(120).optional(),
  occupation: z.string().trim().max(80).optional()
})

export const studentInputSchema = z.object({
  admissionNo: z.string().trim().min(1, 'Admission number is required').max(40),
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  gender: z.string().trim().min(1, 'Gender is required').max(10),
  dob: isoDateOptional,
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  batchId: z.number().int().positive().nullable().optional(),
  admissionDate: isoDateRequired('Admission date is required'),
  status: z.enum(['active', 'inactive', 'dropped', 'completed']).default('active'),
  notes: z.string().trim().max(1000).optional(),
  guardians: z.array(guardianInputSchema).max(5).default([])
})
export const studentUpdateSchema = z.object({ id: z.number().int().positive(), input: studentInputSchema })

const pageFields = {
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional()
}

export const studentFilterSchema = z.object({
  search: z.string().trim().max(80).optional(),
  batchId: z.number().int().positive().nullable().optional(),
  status: z.enum(['active', 'inactive', 'dropped', 'completed', 'all']).optional(),
  ...pageFields
})

// --- Fees ---

export const feeInstallmentInputSchema = z.object({
  label: z.string().trim().max(60).optional(),
  dueAmount: z.number().int().min(0),
  dueDate: isoDateOptional
})

export const feePlanInputSchema = z.object({
  name: z.string().trim().min(1, 'Plan name is required').max(80),
  totalAmount: z.number().int().positive('Total fee must be greater than zero'),
  discount: z.number().int().min(0).default(0),
  notes: z.string().trim().max(500).optional(),
  installments: z.array(feeInstallmentInputSchema).min(1, 'Add at least one installment').max(60)
})

export const feePlanSaveSchema = z.object({
  studentId: z.number().int().positive(),
  input: feePlanInputSchema
})

export const studentIdSchema = z.object({ studentId: z.number().int().positive() })

// --- Settings ---

export const instituteProfileSchema = z.object({
  name: z.string().trim().min(1, 'Institute name is required').max(120),
  address: z.string().trim().max(400).default(''),
  phone: z.string().trim().max(60).default(''),
  email: z.string().trim().max(120).default(''),
  receiptPrefix: z.string().trim().max(20).default('CHISEL'),
  receiptFooter: z.string().trim().max(300).default('')
})

// --- Payments ---

const paymentAllocationSchema = z.object({
  installmentId: z.number().int().positive(),
  amount: z.number().int().min(0)
})

export const paymentInputSchema = z.object({
  studentId: z.number().int().positive(),
  amount: z.number().int().positive('Amount must be greater than zero'),
  paymentDate: isoDateRequired('Payment date is required'),
  mode: z.enum(['cash', 'upi', 'bank_transfer', 'cheque', 'other']),
  accountId: z.number().int().positive().nullable().optional(),
  referenceNo: z.string().trim().max(60).optional(),
  remarks: z.string().trim().max(300).optional(),
  allocations: z.array(paymentAllocationSchema).max(60).optional()
})

export const paymentFilterSchema = z.object({
  studentId: z.number().int().positive().nullable().optional(),
  dateFrom: z.string().trim().max(10).optional(),
  dateTo: z.string().trim().max(10).optional(),
  mode: z.enum(['cash', 'upi', 'bank_transfer', 'cheque', 'other', 'all']).optional(),
  search: z.string().trim().max(80).optional(),
  includeCancelled: z.boolean().optional(),
  ...pageFields
})

export const cancelPaymentSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().max(200).optional()
})

export const paymentIdSchema = z.object({ paymentId: z.number().int().positive() })

// --- Dues ---

export const upcomingSchema = z.object({ days: z.number().int().min(1).max(365).default(30) })

// --- Expenses ---

const PAYMENT_MODE = z.enum(['cash', 'upi', 'bank_transfer', 'cheque', 'other'])

export const expenseCategoryInputSchema = z.object({ name: z.string().trim().min(1, 'Name is required').max(60) })
export const expenseCategoryUpdateSchema = z.object({ id: z.number().int().positive(), input: expenseCategoryInputSchema })

export const vendorInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  contact: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(300).optional()
})
export const vendorUpdateSchema = z.object({ id: z.number().int().positive(), input: vendorInputSchema })

export const expenseInputSchema = z.object({
  expenseDate: isoDateRequired('Expense date is required'),
  categoryId: z.number().int().positive().nullable().optional(),
  vendorId: z.number().int().positive().nullable().optional(),
  payee: z.string().trim().max(120).optional(),
  amount: z.number().int().positive('Amount must be greater than zero'),
  mode: PAYMENT_MODE,
  accountId: z.number().int().positive().nullable().optional(),
  referenceNo: z.string().trim().max(60).optional(),
  remarks: z.string().trim().max(300).optional()
})
export const expenseUpdateSchema = z.object({ id: z.number().int().positive(), input: expenseInputSchema })

export const vendorLimitInfoSchema = z.object({
  accountId: z.number().int().positive(),
  vendorId: z.number().int().positive(),
  date: z.string().trim().min(1).max(10),
  excludeId: z.number().int().positive().optional()
})

export const expenseFilterSchema = z.object({
  dateFrom: z.string().trim().max(10).optional(),
  dateTo: z.string().trim().max(10).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  vendorId: z.number().int().positive().nullable().optional(),
  accountId: z.number().int().positive().nullable().optional(),
  mode: z.enum(['cash', 'upi', 'bank_transfer', 'cheque', 'other', 'all']).optional(),
  search: z.string().trim().max(80).optional(),
  ...pageFields
})

// --- Reports ---

export const reportRequestSchema = z.object({
  type: z.enum([
    'collection-by-student',
    'outstanding',
    'collection-by-date',
    'collection-by-mode',
    'collection-by-batch',
    'expense-by-date',
    'expense-by-category',
    'expense-by-vendor',
    'expense-by-account',
    'expense-by-month'
  ]),
  from: z.string().trim().max(10).optional(),
  to: z.string().trim().max(10).optional()
})

// --- Backups ---

export const backupNameSchema = z.object({ name: z.string().trim().min(1).max(160) })
export const autoBackupSchema = z.object({ enabled: z.boolean() })
