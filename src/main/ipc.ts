import { app, ipcMain } from 'electron'

/**
 * Register all IPC handlers. Each feature domain adds its handlers here as it
 * lands. Channel names are namespaced `domain:action`.
 */
export function registerIpc(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())
}
