// Shared domain types used by both the main process and the renderer.

export interface User {
  id: number
  username: string
  displayName: string
}

/** Session stages. Sign-in is a single authenticator-code step; 'pending-enroll'
 * only occurs for data that has no authenticator yet (an old install). */
export type AuthStage = 'pending-enroll' | 'authenticated'

export interface AuthState {
  /** Has first-run setup been completed? */
  initialized: boolean
  /** Is the session fully authenticated (past any 2FA / enrollment gate)? */
  authenticated: boolean
  /** Current session stage, or null if logged out. */
  stage: AuthStage | null
  /** Is login temporarily locked due to failed attempts? */
  locked: boolean
  lockedUntil: string | null
  /** The data was created by a version that used a master password. It needs a
   * one-time unlock with that password (plus an authenticator code), after
   * which sign-in is authenticator-code only. */
  legacyPassword: boolean
}

export type LoginStatus = 'ok' | 'enroll_required'

export interface LoginResult {
  status: LoginStatus
  user: User
}

export interface EnrollStart {
  secret: string
  otpauthUrl: string
  qrDataUrl: string
}

export interface ConfirmEnrollInput {
  secret: string
  label: string
  code: string
}

export interface TwoFactorAuthenticator {
  id: number
  label: string
  createdAt: string
  lastUsedAt: string | null
}

export interface TwoFactorStatus {
  enrolledCount: number
  authenticators: TwoFactorAuthenticator[]
  recoveryCodesRemaining: number
}

// --- Accounts ---

export type AccountType = 'cash' | 'bank' | 'upi' | 'other'

export interface AccountFyLimit {
  fy: string // e.g. '2026-27'
  limit: number // paise; 0 = no limit for that year
}

export interface Account {
  id: number
  name: string
  type: AccountType
  openingBalance: number // paise
  isActive: boolean
  notes: string | null
  /** Default per-vendor FY limit (paise) for years without a specific override; 0 = no limit. */
  vendorFyLimit: number
  /** Per-financial-year overrides of the per-vendor limit. */
  vendorFyLimits: AccountFyLimit[]
  createdAt: string
  updatedAt: string
}

export interface AccountInput {
  name: string
  type: AccountType
  openingBalance: number
  isActive: boolean
  notes?: string
  vendorFyLimit?: number
  vendorFyLimits?: AccountFyLimit[]
}

export interface VendorLimitInfo {
  limit: number
  spent: number
  remaining: number
  fy: string
}

// --- Batches ---

export type BatchStatus = 'active' | 'inactive'

export interface Batch {
  id: number
  name: string
  courseName: string | null
  academicYear: string | null
  defaultFee: number // paise
  startDate: string | null
  endDate: string | null
  status: BatchStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface BatchSummary extends Batch {
  studentCount: number
}

export interface BatchInput {
  name: string
  courseName?: string
  academicYear?: string
  defaultFee: number
  startDate?: string
  endDate?: string
  status: BatchStatus
  notes?: string
}

// --- Guardians & students ---

export interface Guardian {
  id: number
  name: string
  relation: string | null
  phone: string | null
  email: string | null
  occupation: string | null
}

export interface GuardianInput {
  name: string
  relation?: string
  phone?: string
  email?: string
  occupation?: string
}

export type StudentStatus = 'active' | 'inactive' | 'dropped' | 'completed'

export interface Student {
  id: number
  admissionNo: string
  firstName: string
  lastName: string | null
  gender: string | null
  dob: string | null
  phone: string | null
  email: string | null
  address: string | null
  batchId: number | null
  schoolId: number | null
  admissionDate: string | null
  status: StudentStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface StudentListItem {
  id: number
  admissionNo: string
  firstName: string
  lastName: string | null
  phone: string | null
  status: StudentStatus
  batchId: number | null
  batchName: string | null
  schoolName: string | null
}

export interface StudentDetail extends Student {
  batchName: string | null
  schoolName: string | null
  guardians: Guardian[]
}

export interface StudentInput {
  admissionNo: string
  firstName: string
  lastName?: string
  gender?: string
  dob?: string
  phone?: string
  email?: string
  address?: string
  batchId?: number | null
  schoolId?: number | null
  admissionDate?: string
  status: StudentStatus
  notes?: string
  guardians: GuardianInput[]
}

// --- Schools (school master) ---

export interface School {
  id: number
  name: string
  area: string | null
  contact: string | null
  isActive: boolean
}

export interface SchoolSummary extends School {
  studentCount: number
}

export interface SchoolInput {
  name: string
  area?: string
  contact?: string
  isActive: boolean
}

export type SortDir = 'asc' | 'desc'

export interface StudentFilter {
  search?: string
  batchId?: number | null
  schoolId?: number | null
  status?: StudentStatus | 'all'
  gender?: string
  sortBy?: 'name' | 'admissionNo' | 'admissionDate' | 'createdAt' | 'batch'
  sortDir?: SortDir
  limit?: number
  offset?: number
}

// --- Fees ---

export type InstallmentStatus = 'pending' | 'partial' | 'paid' | 'overdue'

export interface FeeInstallmentView {
  id: number
  seqNo: number
  label: string | null
  dueAmount: number
  dueDate: string | null
  paid: number
  outstanding: number
  status: InstallmentStatus
}

export interface FeePlanView {
  id: number
  studentId: number
  name: string
  totalAmount: number
  discount: number
  netAmount: number
  notes: string | null
  installments: FeeInstallmentView[]
  totals: { net: number; paid: number; outstanding: number }
}

export interface FeeInstallmentInput {
  label?: string
  dueAmount: number
  dueDate?: string
}

export interface FeePlanInput {
  name: string
  totalAmount: number
  discount: number
  notes?: string
  installments: FeeInstallmentInput[]
}

export interface StudentFeeSummary {
  studentId: number
  admissionNo: string
  firstName: string
  lastName: string | null
  batchName: string | null
  net: number
  paid: number
  outstanding: number
  overdueCount: number
  nextDueDate: string | null
}

// --- Settings ---

export interface InstituteProfile {
  name: string
  address: string
  phone: string
  email: string
  receiptPrefix: string
  receiptFooter: string
}

// --- Payments & receipts ---

export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'other'

export interface PaymentAllocationInput {
  installmentId: number
  amount: number
}

export interface PaymentInput {
  studentId: number
  amount: number
  paymentDate: string
  mode: PaymentMode
  accountId?: number | null
  referenceNo?: string
  remarks?: string
  allocations?: PaymentAllocationInput[]
}

export interface PaymentAllocationView {
  installmentId: number | null
  label: string | null
  amount: number
}

export interface PaymentRecord {
  id: number
  receiptNo: string
  studentId: number
  studentName: string
  admissionNo: string
  paymentDate: string
  amount: number
  mode: PaymentMode
  accountId: number | null
  accountName: string | null
  referenceNo: string | null
  remarks: string | null
  /** Student's batch / course / school as of this payment (shown on the receipt). */
  batchName: string | null
  academicYear: string | null
  courseName: string | null
  schoolName: string | null
  isCancelled: boolean
  cancelReason: string | null
  createdAt: string
  allocations: PaymentAllocationView[]
}

export interface PaymentListItem {
  id: number
  receiptNo: string
  studentId: number
  studentName: string
  paymentDate: string
  amount: number
  mode: PaymentMode
  accountName: string | null
  isCancelled: boolean
}

export interface PaymentFilter {
  studentId?: number | null
  dateFrom?: string
  dateTo?: string
  mode?: PaymentMode | 'all'
  accountId?: number | null
  search?: string
  /** Legacy: true = include cancelled alongside active. Prefer `cancelled`. */
  includeCancelled?: boolean
  /** active = hide cancelled (default), cancelled = only cancelled, all = both. */
  cancelled?: 'active' | 'cancelled' | 'all'
  sortBy?: 'date' | 'amount' | 'receiptNo' | 'student' | 'mode'
  sortDir?: SortDir
  limit?: number
  offset?: number
}

export interface ReceiptData {
  institute: InstituteProfile
  payment: PaymentRecord
  amountInWords: string
}

// --- Dashboard & due monitoring ---

export interface DueItem {
  studentId: number
  studentName: string
  admissionNo: string
  batchName: string | null
  installmentId: number
  label: string | null
  dueDate: string
  dueAmount: number
  paid: number
  outstanding: number
}

export interface DashboardData {
  todayCollection: number
  monthCollection: number
  monthExpenses: number
  monthNet: number
  totalOutstanding: number
  overdueStudents: number
  overdueAmount: number
  upcomingCount: number
  pdcDueCount: number
  pdcDueAmount: number
  collectionTrend: { month: string; label: string; amount: number }[]
  recentPayments: PaymentListItem[]
}

// --- Post-dated cheques (PDCs) ---

export type PdcStatus = 'pending' | 'deposited' | 'bounced' | 'cancelled'

export interface PostDatedCheque {
  id: number
  studentId: number | null
  studentName: string | null
  amount: number
  chequeNo: string | null
  bank: string | null
  depositDate: string
  status: PdcStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface PdcInput {
  studentId?: number | null
  amount: number
  chequeNo?: string
  bank?: string
  depositDate: string
  notes?: string
}

export interface PdcFilter {
  status?: PdcStatus | 'all'
  search?: string
}

// --- Expenses ---

export interface ExpenseCategory {
  id: number
  name: string
  isActive: boolean
}

export interface Vendor {
  id: number
  name: string
  contact: string | null
  notes: string | null
  isActive: boolean
}

export interface ExpenseInput {
  expenseDate: string
  categoryId?: number | null
  vendorId?: number | null
  payee?: string
  amount: number
  mode: PaymentMode
  accountId?: number | null
  referenceNo?: string
  remarks?: string
}

export interface ExpenseRecord {
  id: number
  expenseDate: string
  categoryId: number | null
  categoryName: string | null
  vendorId: number | null
  vendorName: string | null
  payee: string | null
  amount: number
  mode: PaymentMode
  accountId: number | null
  accountName: string | null
  referenceNo: string | null
  remarks: string | null
  createdAt: string
}

export interface ExpenseFilter {
  dateFrom?: string
  dateTo?: string
  categoryId?: number | null
  vendorId?: number | null
  accountId?: number | null
  mode?: PaymentMode | 'all'
  search?: string
  sortBy?: 'date' | 'amount' | 'category' | 'vendor' | 'account'
  sortDir?: SortDir
  limit?: number
  offset?: number
}

export interface ExpenseSummary {
  monthTotal: number
  allTimeTotal: number
  byCategory: { category: string; total: number }[]
  trend: { month: string; label: string; amount: number }[]
}

// --- Updates ---

export interface UpdateInfo {
  current: string
  latest: string | null
  available: boolean
  notes: string
  /** Size of the update download in bytes, if known. */
  sizeBytes?: number
  error?: string
}

export interface UpdateStatus {
  state: 'checking' | 'downloading' | 'verifying' | 'extracting' | 'installing' | 'ready' | 'error'
  percent?: number
  transferred?: number
  total?: number
  message?: string
}

// --- Bulk import ---

export interface ImportResult {
  imported: number
  errors: { row: number; message: string }[]
}

// --- Backups ---

export interface BackupInfo {
  name: string
  createdAt: string
  sizeBytes: number
}

// --- Reports ---

export type ReportType =
  | 'financial-summary'
  | 'monthly-net'
  | 'batch-performance'
  | 'daybook'
  | 'payment-register'
  | 'expense-register'
  | 'daily-collection-mode'
  | 'collection-by-student'
  | 'outstanding'
  | 'collection-by-date'
  | 'collection-by-mode'
  | 'collection-by-batch'
  | 'collection-by-account'
  | 'collection-by-school'
  | 'account-summary'
  | 'outstanding-by-batch'
  | 'students-by-school'
  | 'discounts-by-student'
  | 'expense-by-date'
  | 'expense-by-category'
  | 'expense-by-vendor'
  | 'expense-by-account'
  | 'expense-by-month'

export interface ReportColumn {
  key: string
  label: string
  type?: 'money' | 'date' | 'text' | 'number'
  align?: 'left' | 'right'
}

export interface ReportRange {
  from?: string
  to?: string
}

export interface ReportResult {
  type: ReportType
  title: string
  columns: ReportColumn[]
  rows: Record<string, string | number | null>[]
  totals?: Record<string, string | number | null>
}

/** First-run setup: the authenticator secret shown as a QR code, plus a code
 * from the app proving it was scanned. No username or password. */
export interface SetupInput {
  instituteName?: string
  secret: string
  label?: string
  code: string
}

/** Sign in with a 6-digit authenticator code or a one-time recovery code. */
export interface LoginInput {
  code: string
}

/** One-time unlock of data created by a password-based version. `code` is
 * required whenever the data already has an authenticator enrolled. */
export interface LegacyUnlockInput {
  password: string
  code?: string
}
