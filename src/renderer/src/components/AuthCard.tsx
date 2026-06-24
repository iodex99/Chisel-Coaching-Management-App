import type { ReactNode } from 'react'
import { Logo } from './Logo'

/** Branded full-screen card used by all pre-authenticated screens. */
export function AuthCard({
  children,
  width = 'max-w-md'
}: {
  children: ReactNode
  width?: string
}): JSX.Element {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900 p-6">
      <div className={`card w-full ${width} p-8`}>
        <Logo className="mx-auto mb-6 w-56" />
        {children}
      </div>
    </div>
  )
}
