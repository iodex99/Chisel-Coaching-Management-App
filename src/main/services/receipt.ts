import { app, shell } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { dataPath } from '../paths'
import { getReceiptData } from './payment'
import { htmlToPdf, printHtml } from './pdf'
import type { ReceiptData, PaymentMode } from '@shared/types'

const MODE_LABEL: Record<PaymentMode, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  other: 'Other'
}

function logoDataUri(): string {
  try {
    const p = join(app.getAppPath(), 'resources', 'logo.jpg')
    return 'data:image/jpeg;base64,' + readFileSync(p).toString('base64')
  } catch {
    return ''
  }
}

function money(paise: number): string {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

function renderHtml(data: ReceiptData): string {
  const { institute, payment, amountInWords } = data
  const logo = logoDataUri()
  const rows = (payment.allocations.length
    ? payment.allocations
    : [{ label: 'Fee payment', amount: payment.amount, installmentId: null }]
  )
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.label ?? 'Fee payment')}</td><td class="r">${money(a.amount)}</td></tr>`
    )
    .join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; padding: 28px; font-size: 13px; }
  .receipt { border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; max-width: 720px; margin: 0 auto; }
  .head { display: flex; align-items: center; gap: 16px; background: #1e1b8c; color: #fff; padding: 16px 20px; }
  .head img { height: 54px; background:#fff; border-radius:6px; padding:4px; }
  .head .name { font-size: 20px; font-weight: 700; }
  .head .addr { font-size: 11px; opacity: .9; }
  .title { text-align:center; font-weight:700; letter-spacing:2px; color:#1e1b8c; padding:10px; border-bottom:1px solid #e5e7eb; }
  .meta { display:grid; grid-template-columns: 1fr 1fr; gap:6px 24px; padding:16px 20px; }
  .meta div span { color:#6b7280; display:inline-block; min-width:110px; }
  table { width:100%; border-collapse: collapse; }
  th, td { padding:8px 20px; text-align:left; }
  thead th { background:#f3f4f6; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; }
  tbody td { border-top:1px solid #f1f5f9; }
  .r { text-align:right; }
  .total { display:flex; justify-content:space-between; padding:12px 20px; font-weight:700; border-top:2px solid #1e1b8c; }
  .words { padding:0 20px 12px; font-style:italic; color:#374151; }
  .foot { display:flex; justify-content:space-between; align-items:flex-end; padding:24px 20px 16px; }
  .sign { text-align:center; border-top:1px solid #9ca3af; padding-top:4px; width:180px; color:#6b7280; }
  .note { padding:0 20px 16px; font-size:11px; color:#6b7280; }
  .cancel { color:#c0392b; border:2px solid #c0392b; display:inline-block; padding:2px 10px; font-weight:700; transform:rotate(-6deg); }
</style></head>
<body>
  <div class="receipt">
    <div class="head">
      ${logo ? `<img src="${logo}" alt="logo"/>` : ''}
      <div>
        <div class="name">${escapeHtml(institute.name)}</div>
        ${institute.address ? `<div class="addr">${escapeHtml(institute.address)}</div>` : ''}
        <div class="addr">${[institute.phone, institute.email].filter(Boolean).map(escapeHtml).join(' · ')}</div>
      </div>
    </div>
    <div class="title">FEE RECEIPT ${payment.isCancelled ? '<span class="cancel">CANCELLED</span>' : ''}</div>
    <div class="meta">
      <div><span>Receipt No</span><b>${escapeHtml(payment.receiptNo)}</b></div>
      <div><span>Date</span>${fmtDate(payment.paymentDate)}</div>
      <div><span>Student</span>${escapeHtml(payment.studentName)}</div>
      <div><span>Admission No</span>${escapeHtml(payment.admissionNo)}</div>
      <div><span>Mode</span>${MODE_LABEL[payment.mode]}${payment.referenceNo ? ` (${escapeHtml(payment.referenceNo)})` : ''}</div>
      <div><span>Received in</span>${escapeHtml(payment.accountName ?? '—')}</div>
    </div>
    <table>
      <thead><tr><th>Particulars</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total"><span>Total received</span><span>${money(payment.amount)}</span></div>
    <div class="words">Amount in words: ${escapeHtml(amountInWords)}</div>
    ${payment.remarks ? `<div class="note">Remarks: ${escapeHtml(payment.remarks)}</div>` : ''}
    <div class="foot">
      <div class="note">${escapeHtml(institute.receiptFooter || 'Thank you. This is a computer-generated receipt.')}</div>
      <div class="sign">Authorised Signatory</div>
    </div>
  </div>
</body></html>`
}

/** Render the receipt to a PDF in data/receipts and open it. Returns the path. */
export async function exportPdf(paymentId: number): Promise<string> {
  const data = getReceiptData(paymentId)
  const file = dataPath('receipts', `${data.payment.receiptNo.replace(/[\\/:*?"<>|]/g, '-')}.pdf`)
  await htmlToPdf(renderHtml(data), file)
  await shell.openPath(file)
  return file
}

/** Open the system print dialog for the receipt. */
export async function printReceipt(paymentId: number): Promise<void> {
  await printHtml(renderHtml(getReceiptData(paymentId)))
}
