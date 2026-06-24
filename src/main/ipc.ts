import { app, ipcMain } from 'electron'
import type { ZodSchema } from 'zod'
import * as auth from './services/auth'
import { setupSchema, loginSchema, changePasswordSchema } from '@shared/schemas'

/**
 * Register an IPC handler. If a Zod schema is supplied, the incoming payload is
 * validated in the main process before the handler runs; validation failures
 * reject the renderer's invoke with a readable message.
 */
function handle<I, O>(channel: string, schema: ZodSchema<I> | null, fn: (input: I) => Promise<O> | O): void {
  ipcMain.handle(channel, async (_event, raw) => {
    let input = raw as I
    if (schema) {
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join('; '))
      }
      input = parsed.data
    }
    return fn(input)
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
}
