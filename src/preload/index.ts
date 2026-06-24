import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ChiselApi } from '@shared/api'
import type { UpdateStatus } from '@shared/types'

/**
 * The concrete implementation of the `window.api` contract. Each method is a
 * thin wrapper over an `ipcRenderer.invoke` call to a main-process handler.
 * The renderer never gets direct access to Node, the filesystem or the DB.
 */
const api: ChiselApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => process.platform
  },
  auth: {
    getState: () => ipcRenderer.invoke('auth:getState'),
    setup: (input) => ipcRenderer.invoke('auth:setup', input),
    login: (input) => ipcRenderer.invoke('auth:login', input),
    logout: () => ipcRenderer.invoke('auth:logout'),
    changePassword: (input) => ipcRenderer.invoke('auth:changePassword', input)
  },
  twoFactor: {
    beginEnroll: (input) => ipcRenderer.invoke('twofactor:beginEnroll', input),
    confirmEnroll: (input) => ipcRenderer.invoke('twofactor:confirmEnroll', input),
    verify: (input) => ipcRenderer.invoke('twofactor:verify', input),
    generateRecoveryCodes: () => ipcRenderer.invoke('twofactor:generateRecoveryCodes'),
    status: () => ipcRenderer.invoke('twofactor:status'),
    removeAuthenticator: (input) => ipcRenderer.invoke('twofactor:removeAuthenticator', input),
    removeTrustedDevice: (input) => ipcRenderer.invoke('twofactor:removeTrustedDevice', input)
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    create: (input) => ipcRenderer.invoke('accounts:create', input),
    update: (input) => ipcRenderer.invoke('accounts:update', input),
    remove: (input) => ipcRenderer.invoke('accounts:remove', input)
  },
  batches: {
    list: () => ipcRenderer.invoke('batches:list'),
    create: (input) => ipcRenderer.invoke('batches:create', input),
    update: (input) => ipcRenderer.invoke('batches:update', input),
    remove: (input) => ipcRenderer.invoke('batches:remove', input)
  },
  students: {
    list: (filter) => ipcRenderer.invoke('students:list', filter),
    get: (input) => ipcRenderer.invoke('students:get', input),
    create: (input) => ipcRenderer.invoke('students:create', input),
    update: (input) => ipcRenderer.invoke('students:update', input),
    remove: (input) => ipcRenderer.invoke('students:remove', input),
    nextAdmissionNo: () => ipcRenderer.invoke('students:nextAdmissionNo')
  },
  fees: {
    getPlan: (input) => ipcRenderer.invoke('fees:getPlan', input),
    savePlan: (input) => ipcRenderer.invoke('fees:savePlan', input),
    deletePlan: (input) => ipcRenderer.invoke('fees:deletePlan', input),
    summaries: () => ipcRenderer.invoke('fees:summaries')
  },
  settings: {
    getProfile: () => ipcRenderer.invoke('settings:getProfile'),
    updateProfile: (input) => ipcRenderer.invoke('settings:updateProfile', input)
  },
  payments: {
    record: (input) => ipcRenderer.invoke('payments:record', input),
    list: (filter) => ipcRenderer.invoke('payments:list', filter),
    get: (input) => ipcRenderer.invoke('payments:get', input),
    cancel: (input) => ipcRenderer.invoke('payments:cancel', input)
  },
  receipts: {
    exportPdf: (input) => ipcRenderer.invoke('receipts:exportPdf', input),
    print: (input) => ipcRenderer.invoke('receipts:print', input)
  },
  dashboard: {
    get: () => ipcRenderer.invoke('dashboard:get')
  },
  dues: {
    overdue: () => ipcRenderer.invoke('dues:overdue'),
    upcoming: (input) => ipcRenderer.invoke('dues:upcoming', input)
  },
  expenseCategories: {
    list: () => ipcRenderer.invoke('expenseCategories:list'),
    create: (input) => ipcRenderer.invoke('expenseCategories:create', input),
    update: (input) => ipcRenderer.invoke('expenseCategories:update', input),
    remove: (input) => ipcRenderer.invoke('expenseCategories:remove', input)
  },
  vendors: {
    list: () => ipcRenderer.invoke('vendors:list'),
    create: (input) => ipcRenderer.invoke('vendors:create', input),
    update: (input) => ipcRenderer.invoke('vendors:update', input),
    remove: (input) => ipcRenderer.invoke('vendors:remove', input)
  },
  expenses: {
    list: (filter) => ipcRenderer.invoke('expenses:list', filter),
    create: (input) => ipcRenderer.invoke('expenses:create', input),
    update: (input) => ipcRenderer.invoke('expenses:update', input),
    remove: (input) => ipcRenderer.invoke('expenses:remove', input),
    summary: () => ipcRenderer.invoke('expenses:summary')
  },
  reports: {
    get: (input) => ipcRenderer.invoke('reports:get', input),
    exportPdf: (input) => ipcRenderer.invoke('reports:exportPdf', input)
  },
  backups: {
    list: () => ipcRenderer.invoke('backups:list'),
    create: () => ipcRenderer.invoke('backups:create'),
    remove: (input) => ipcRenderer.invoke('backups:remove', input),
    restore: (input) => ipcRenderer.invoke('backups:restore', input),
    getAuto: () => ipcRenderer.invoke('backups:getAuto'),
    setAuto: (input) => ipcRenderer.invoke('backups:setAuto', input)
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (cb) => {
      const handler = (_e: IpcRendererEvent, data: UpdateStatus): void => cb(data)
      ipcRenderer.on('update:status', handler)
      return () => ipcRenderer.removeListener('update:status', handler)
    }
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
