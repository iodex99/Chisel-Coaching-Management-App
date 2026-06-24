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
  TwoFactorStatus
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
}
