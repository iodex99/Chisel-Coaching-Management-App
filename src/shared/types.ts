// Shared domain types used by both the main process and the renderer.

export interface User {
  id: number
  username: string
  displayName: string
}

/** Login stages. A session progresses login → (enroll | 2fa) → authenticated. */
export type AuthStage = 'pending-enroll' | 'pending-2fa' | 'authenticated'

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
  username: string | null
}

export type LoginStatus = 'ok' | '2fa_required' | 'enroll_required'

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

export interface VerifyTwoFactorInput {
  code: string
  trustDevice?: boolean
}

export interface TwoFactorAuthenticator {
  id: number
  label: string
  createdAt: string
  lastUsedAt: string | null
}

export interface TrustedDevice {
  id: number
  label: string
  createdAt: string
  lastSeenAt: string | null
  current: boolean
}

export interface TwoFactorStatus {
  enrolledCount: number
  authenticators: TwoFactorAuthenticator[]
  recoveryCodesRemaining: number
  deviceTrusted: boolean
  trustedDevices: TrustedDevice[]
}

// --- Accounts ---

export type AccountType = 'cash' | 'bank' | 'upi' | 'other'

export interface Account {
  id: number
  name: string
  type: AccountType
  openingBalance: number // paise
  isActive: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface AccountInput {
  name: string
  type: AccountType
  openingBalance: number
  isActive: boolean
  notes?: string
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
}

export interface StudentDetail extends Student {
  batchName: string | null
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
  admissionDate?: string
  status: StudentStatus
  notes?: string
  guardians: GuardianInput[]
}

export interface StudentFilter {
  search?: string
  batchId?: number | null
  status?: StudentStatus | 'all'
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
  search?: string
  includeCancelled?: boolean
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
  collectionTrend: { month: string; label: string; amount: number }[]
  recentPayments: PaymentListItem[]
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
  error?: string
}

export interface UpdateStatus {
  state: 'checking' | 'downloading' | 'verifying' | 'extracting' | 'installing' | 'ready' | 'error'
  percent?: number
  message?: string
}

// --- Backups ---

export interface BackupInfo {
  name: string
  createdAt: string
  sizeBytes: number
}

// --- Reports ---

export type ReportType =
  | 'collection-by-student'
  | 'outstanding'
  | 'collection-by-date'
  | 'collection-by-mode'
  | 'collection-by-batch'
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

export interface SetupInput {
  username: string
  password: string
  instituteName?: string
}

export interface LoginInput {
  username?: string
  password: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}
