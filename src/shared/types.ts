// Shared domain types used by both the main process and the renderer.

export interface User {
  id: number
  username: string
  displayName: string
}

export interface AuthState {
  /** Has first-run setup been completed? */
  initialized: boolean
  /** Is a session currently active in the main process? */
  authenticated: boolean
  /** Is login temporarily locked due to failed attempts? */
  locked: boolean
  lockedUntil: string | null
  username: string | null
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
