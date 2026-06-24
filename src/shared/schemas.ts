import { z } from 'zod'

/** Minimum master-password length. Surfaced in the UI too. */
export const MIN_PASSWORD_LENGTH = 8

export const setupSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(40),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
  instituteName: z.string().trim().max(120).optional()
})

export const loginSchema = z.object({
  username: z.string().trim().max(40).optional(),
  password: z.string().min(1, 'Password is required').max(200)
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200)
})

// --- Two-factor authentication ---

export const beginEnrollSchema = z.object({
  label: z.string().trim().max(40).optional()
})

export const confirmEnrollSchema = z.object({
  secret: z.string().min(8).max(128),
  label: z.string().trim().max(40).optional().default('Authenticator'),
  code: z.string().trim().min(6).max(10)
})

export const verifyTwoFactorSchema = z.object({
  code: z.string().trim().min(6).max(20),
  trustDevice: z.boolean().optional()
})

export const idSchema = z.object({
  id: z.number().int().positive()
})
