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
