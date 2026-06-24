import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { useAuth } from './store/auth'
import { Logo } from './components/Logo'
import Setup from './screens/Setup'
import Login from './screens/Login'
import AppShell from './layout/AppShell'
import Dashboard from './screens/Dashboard'
import Settings from './screens/Settings'

function Splash(): JSX.Element {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900">
      <div className="text-center">
        <Logo className="mx-auto mb-4 w-64 rounded-lg bg-white p-3" />
        <p className="text-sm text-white/70">Loading…</p>
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  const loading = useAuth((s) => s.loading)
  const state = useAuth((s) => s.state)
  const user = useAuth((s) => s.user)
  const refresh = useAuth((s) => s.refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  let content: JSX.Element
  if (loading) {
    content = <Splash />
  } else if (!state?.initialized) {
    content = <Setup />
  } else if (!user) {
    content = <Login />
  } else {
    content = (
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    )
  }

  return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
}
