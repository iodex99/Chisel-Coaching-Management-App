import { contextBridge, ipcRenderer } from 'electron'
import type { ChiselApi } from '@shared/api'

/**
 * The concrete implementation of the `window.api` contract. Each method is a
 * thin wrapper over an `ipcRenderer.invoke` call to a main-process handler.
 * The renderer never gets direct access to Node, the filesystem or the DB.
 */
const api: ChiselApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => process.platform
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose preload API:', error)
  }
} else {
  // Fallback for the (non-default) case where context isolation is disabled.
  // @ts-ignore — define on window
  window.api = api
}
