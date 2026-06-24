import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { useAuth } from './store/auth'
import { Logo } from './components/Logo'
import AuthGate from './screens/auth/AuthGate'
import AppShell from './layout/AppShell'
import Dashboard from './screens/Dashboard'
import Settings from './screens/Settings'
import Students from './screens/Students'
import StudentForm from './screens/StudentForm'
import StudentDetail from './screens/StudentDetail'
import Batches from './screens/Batches'
import Accounts from './screens/Accounts'

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
  const user = useAuth((s) => s.user)
  const refresh = useAuth((s) => s.refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  let content: JSX.Element
  if (loading) {
    content = <Splash />
  } else if (!user) {
    content = <AuthGate />
  } else {
    content = (
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="students" element={<Students />} />
            <Route path="students/new" element={<StudentForm />} />
            <Route path="students/:id" element={<StudentDetail />} />
            <Route path="students/:id/edit" element={<StudentForm />} />
            <Route path="batches" element={<Batches />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    )
  }

  return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
}
