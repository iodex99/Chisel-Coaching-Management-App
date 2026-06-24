import type { AuthState, SetupInput, LoginInput, ChangePasswordInput, User } from './types'

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
    setup(input: SetupInput): Promise<User>
    login(input: LoginInput): Promise<User>
    logout(): Promise<void>
    changePassword(input: ChangePasswordInput): Promise<void>
  }
}
