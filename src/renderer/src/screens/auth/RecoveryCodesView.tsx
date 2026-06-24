import { useState } from 'react'
import { Copy, Check, Download } from 'lucide-react'

/** Displays a freshly-generated set of recovery codes with copy/download. */
export function RecoveryCodesView({
  codes,
  onDone,
  doneLabel = 'I have saved these codes'
}: {
  codes: string[]
  onDone: () => void
  doneLabel?: string
}): JSX.Element {
  const [copied, setCopied] = useState(false)

  const asText = codes.join('\n')

  function copy(): void {
    navigator.clipboard.writeText(asText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function download(): void {
    const blob = new Blob([`Chisel Coaching — recovery codes\n\n${asText}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'chisel-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h2 className="text-center text-lg font-semibold text-brand-700">Save your recovery codes</h2>
      <p className="mt-1 text-center text-sm text-slate-500">
        Each code can be used once to sign in if you lose your authenticator. Store them somewhere safe — they
        won’t be shown again.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-4 font-mono text-sm text-slate-700">
        {codes.map((c) => (
          <div key={c} className="text-center tracking-wider">
            {c}
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-outline flex-1" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn-outline flex-1" onClick={download}>
          <Download size={16} /> Download
        </button>
      </div>

      <button type="button" className="btn-primary mt-4 w-full" onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  )
}
