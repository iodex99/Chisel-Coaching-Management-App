// Shared constants used by both the main process and the renderer.

/** Maximum number of TOTP authenticator apps a user may enroll. */
export const MAX_AUTHENTICATORS = 3

/** Number of one-time recovery codes generated per set. */
export const RECOVERY_CODE_COUNT = 10

/** Issuer label shown in authenticator apps. */
export const TOTP_ISSUER = 'Chisel Coaching'

/** Payment modes with display labels. */
export const PAYMENT_MODES: { value: 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'other'; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' }
]
