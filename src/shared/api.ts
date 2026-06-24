import type {
  AuthState,
  SetupInput,
  LoginInput,
  ChangePasswordInput,
  LoginResult,
  User,
  EnrollStart,
  ConfirmEnrollInput,
  VerifyTwoFactorInput,
  TwoFactorAuthenticator,
  TwoFactorStatus,
  Account,
  AccountInput,
  Batch,
  BatchSummary,
  BatchInput,
  StudentListItem,
  StudentDetail,
  StudentInput,
  StudentFilter,
  FeePlanView,
  FeePlanInput,
  StudentFeeSummary,
  InstituteProfile,
  PaymentInput,
  PaymentRecord,
  PaymentListItem,
  PaymentFilter,
  DashboardData,
  DueItem,
  ExpenseCategory,
  Vendor,
  ExpenseInput,
  ExpenseRecord,
  ExpenseFilter,
  ExpenseSummary,
  ReportType,
  ReportResult
} from './types'

/**
 * The typed surface exposed to the renderer as `window.api`.
 *
 * This interface is the single contract between the renderer and the main
 * process. It is implemented in the preload (`src/preload/index.ts`) and
 * backed by `ipcMain.handle` routes in the main process. It grows one domain
 * at a time as features land.
 */
export interface ChiselApi {
  app: {
    getVersion(): Promise<string>
    getPlatform(): NodeJS.Platform
  }
  auth: {
    getState(): Promise<AuthState>
    setup(input: SetupInput): Promise<LoginResult>
    login(input: LoginInput): Promise<LoginResult>
    logout(): Promise<void>
    changePassword(input: ChangePasswordInput): Promise<void>
  }
  twoFactor: {
    /** Begin enrolling a new authenticator app — returns the secret + QR. */
    beginEnroll(input: { label?: string }): Promise<EnrollStart>
    /** Confirm enrollment by verifying a code from the authenticator. */
    confirmEnroll(input: ConfirmEnrollInput): Promise<TwoFactorAuthenticator>
    /** Verify a TOTP or recovery code during the 2FA login gate. */
    verify(input: VerifyTwoFactorInput): Promise<User>
    /** Generate (and replace) the set of one-time recovery codes. */
    generateRecoveryCodes(): Promise<string[]>
    status(): Promise<TwoFactorStatus>
    removeAuthenticator(input: { id: number }): Promise<void>
    removeTrustedDevice(input: { id: number }): Promise<void>
  }
  accounts: {
    list(): Promise<Account[]>
    create(input: AccountInput): Promise<Account>
    update(input: { id: number; input: AccountInput }): Promise<Account>
    remove(input: { id: number }): Promise<void>
  }
  batches: {
    list(): Promise<BatchSummary[]>
    create(input: BatchInput): Promise<Batch>
    update(input: { id: number; input: BatchInput }): Promise<Batch>
    remove(input: { id: number }): Promise<void>
  }
  students: {
    list(filter: StudentFilter): Promise<StudentListItem[]>
    get(input: { id: number }): Promise<StudentDetail | undefined>
    create(input: StudentInput): Promise<StudentDetail>
    update(input: { id: number; input: StudentInput }): Promise<StudentDetail>
    remove(input: { id: number }): Promise<void>
    nextAdmissionNo(): Promise<string>
  }
  fees: {
    getPlan(input: { studentId: number }): Promise<FeePlanView | null>
    savePlan(input: { studentId: number; input: FeePlanInput }): Promise<FeePlanView>
    deletePlan(input: { studentId: number }): Promise<void>
    summaries(): Promise<StudentFeeSummary[]>
  }
  settings: {
    getProfile(): Promise<InstituteProfile>
    updateProfile(input: InstituteProfile): Promise<InstituteProfile>
  }
  payments: {
    record(input: PaymentInput): Promise<PaymentRecord>
    list(filter: PaymentFilter): Promise<PaymentListItem[]>
    get(input: { paymentId: number }): Promise<PaymentRecord | undefined>
    cancel(input: { id: number; reason?: string }): Promise<void>
  }
  receipts: {
    exportPdf(input: { paymentId: number }): Promise<string>
    print(input: { paymentId: number }): Promise<void>
  }
  dashboard: {
    get(): Promise<DashboardData>
  }
  dues: {
    overdue(): Promise<DueItem[]>
    upcoming(input: { days?: number }): Promise<DueItem[]>
  }
  expenseCategories: {
    list(): Promise<ExpenseCategory[]>
    create(input: { name: string }): Promise<ExpenseCategory>
    update(input: { id: number; input: { name: string } }): Promise<void>
    remove(input: { id: number }): Promise<void>
  }
  vendors: {
    list(): Promise<Vendor[]>
    create(input: { name: string; contact?: string; notes?: string }): Promise<Vendor>
    update(input: { id: number; input: { name: string; contact?: string; notes?: string } }): Promise<void>
    remove(input: { id: number }): Promise<void>
  }
  expenses: {
    list(filter: ExpenseFilter): Promise<ExpenseRecord[]>
    create(input: ExpenseInput): Promise<ExpenseRecord>
    update(input: { id: number; input: ExpenseInput }): Promise<ExpenseRecord>
    remove(input: { id: number }): Promise<void>
    summary(): Promise<ExpenseSummary>
  }
  reports: {
    get(input: { type: ReportType; from?: string; to?: string }): Promise<ReportResult>
    exportPdf(input: { type: ReportType; from?: string; to?: string }): Promise<string>
  }
}
