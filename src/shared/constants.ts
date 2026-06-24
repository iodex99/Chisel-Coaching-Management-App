// Shared constants used by both the main process and the renderer.

/** Maximum number of TOTP authenticator apps a user may enroll. */
export const MAX_AUTHENTICATORS = 3

/** Maximum number of trusted devices that may skip 2FA. */
export const MAX_TRUSTED_DEVICES = 3

/** Number of one-time recovery codes generated per set. */
export const RECOVERY_CODE_COUNT = 10

/** Issuer label shown in authenticator apps. */
export const TOTP_ISSUER = 'Chisel Coaching'
