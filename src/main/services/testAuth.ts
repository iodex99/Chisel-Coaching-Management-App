// Test-only helpers for the authenticator-code sign-in (imported by *.test.ts;
// nothing in the app imports this, so it is not bundled).
import { authenticator } from 'otplib'
import * as auth from './auth'

let lastSecret = ''

/** First-run setup the way the app does it: scan a fresh secret, enter its code.
 *  Leaves an authenticated session and returns the authenticator secret. */
export async function setupTestAuth(instituteName?: string): Promise<string> {
  const secret = authenticator.generateSecret()
  await auth.setup({ instituteName, secret, label: 'Test phone', code: authenticator.generate(secret) })
  lastSecret = secret
  return secret
}

/** The current 6-digit code for `secret` (default: the last one set up). */
export function testCode(secret = lastSecret): string {
  return authenticator.generate(secret)
}

/** Sign in with the current code of the last-set-up authenticator. */
export function testLogin(secret = lastSecret): ReturnType<typeof auth.login> {
  return auth.login({ code: authenticator.generate(secret) })
}
