import { create } from 'zustand'
import type { AuthState, User } from '@shared/types'
import { api } from '../lib/api'

interface AuthStore {
  loading: boolean
  state: AuthState | null
  /** The renderer-side logged-in user for this window session. */
  user: User | null
  refresh: () => Promise<void>
  setUser: (user: User) => void
  logout: () => Promise<void>
}

export const useAuth = create<AuthStore>()((set) => ({
  loading: true,
  state: null,
  user: null,
  refresh: async () => {
    const state = await api.auth.getState()
    set({ state, loading: false })
  },
  setUser: (user) => set({ user }),
  logout: async () => {
    await api.auth.logout()
    const state = await api.auth.getState()
    set({ user: null, state })
  }
}))
