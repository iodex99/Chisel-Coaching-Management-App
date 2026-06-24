import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpCircle, X } from 'lucide-react'
import { api } from '../lib/api'

/** Thin banner shown when a newer version is available. */
export function UpdateBanner(): JSX.Element | null {
  const nav = useNavigate()
  const [latest, setLatest] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    api.update
      .check()
      .then((info) => {
        if (info.available && info.latest) setLatest(info.latest)
      })
      .catch(() => undefined)
  }, [])

  if (!latest || dismissed) return null

  return (
    <div className="flex items-center justify-between gap-4 bg-brand-700 px-6 py-2 text-sm text-white">
      <div className="flex items-center gap-2">
        <ArrowUpCircle size={16} />
        Version {latest} is available.
        <button className="ml-1 font-medium underline" onClick={() => nav('/settings')}>
          Update now
        </button>
      </div>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="text-white/70 hover:text-white">
        <X size={16} />
      </button>
    </div>
  )
}
