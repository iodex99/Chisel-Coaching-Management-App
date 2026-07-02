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
    getPlatform: () => process.platform,
    getDataDir: () => ipcRenderer.invoke('app:getDataDir'),
    openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
    importData: () => ipcRenderer.invoke('app:importData')
  },
  auth: {
    getState: () => ipcRenderer.invoke('auth:getState'),
    setup: (input) => ipcRenderer.invoke('auth:setup', input),
    login: (input) => ipcRenderer.invoke('auth:login', input),
    logout: () => ipcRenderer.invoke('auth:logout'),
    verifyPassword: (input) => ipcRenderer.invoke('auth:verifyPassword', input),
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
    summary: () => ipcRenderer.invoke('expenses:summary'),
    vendorLimitInfo: (input) => ipcRenderer.invoke('expenses:vendorLimitInfo', input)
  },
  reports: {
    get: (input) => ipcRenderer.invoke('reports:get', input),
    exportPdf: (input) => ipcRenderer.invoke('reports:exportPdf', input),
    exportExcel: (input) => ipcRenderer.invoke('reports:exportExcel', input)
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
  },
  bulk: {
    studentTemplate: () => ipcRenderer.invoke('bulk:studentTemplate'),
    importStudents: (bytes) => ipcRenderer.invoke('bulk:importStudents', bytes),
    feeTemplate: () => ipcRenderer.invoke('bulk:feeTemplate'),
    importFees: (bytes) => ipcRenderer.invoke('bulk:importFees', bytes)
  },
  demo: {
    seedSample: () => ipcRenderer.invoke('demo:seed'),
    removeSample: () => ipcRenderer.invoke('demo:clear')
  },
  schools: {
    list: () => ipcRenderer.invoke('schools:list'),
    create: (input) => ipcRenderer.invoke('schools:create', input),
    update: (input) => ipcRenderer.invoke('schools:update', input),
    remove: (input) => ipcRenderer.invoke('schools:remove', input)
  },
  pdc: {
    list: (filter) => ipcRenderer.invoke('pdc:list', filter),
    create: (input) => ipcRenderer.invoke('pdc:create', input),
    setStatus: (input) => ipcRenderer.invoke('pdc:setStatus', input),
    remove: (input) => ipcRenderer.invoke('pdc:remove', input),
    due: (input) => ipcRenderer.invoke('pdc:due', input)
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
