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
