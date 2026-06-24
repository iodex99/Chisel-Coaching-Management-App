/// <reference types="vite/client" />
import type { ChiselApi } from '@shared/api'

declare global {
  interface Window {
    api: ChiselApi
  }
}

export {}
