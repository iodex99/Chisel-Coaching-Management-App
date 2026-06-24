import { useEffect, useState } from 'react'
import logo from './assets/logo.jpg'

export default function App(): JSX.Element {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    window.api?.app
      .getVersion()
      .then(setVersion)
      .catch(() => setVersion(''))
  }, [])

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 p-6">
      <div className="card w-full max-w-lg p-8 text-center">
        <img src={logo} alt="Chisel Coaching Classes" className="mx-auto mb-6 w-72" />
        <h1 className="text-2xl font-semibold text-brand-700">
          Coaching Management
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Fees · Payments · Receipts · Expenses · Reports
        </p>
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          The application shell is ready. Secure login, the encrypted database
          and the first-run setup wizard arrive in the next iteration.
        </div>
        {version && (
          <p className="mt-6 text-xs text-slate-400">Version {version}</p>
        )}
      </div>
    </div>
  )
}
