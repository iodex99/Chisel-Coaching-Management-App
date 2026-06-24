import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { authenticator } from 'otplib'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let app: ElectronApplication
let page: Page
let dataDir: string

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-e2e-'))
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE // this machine sets it; it breaks Electron
  delete env.ELECTRON_RENDERER_URL
  env.CHISEL_DATA_DIR = dataDir
  app = await electron.launch({ args: ['.'], cwd: process.cwd(), env })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  rmSync(dataDir, { recursive: true, force: true })
})

test('first-run setup, 2FA, a UI write, then logout + login with 2FA', async () => {
  // --- First-run setup ---
  await expect(page.getByText('Create the administrator account')).toBeVisible()
  await page.getByPlaceholder('e.g. admin').fill('admin')
  await page.getByPlaceholder(/At least .* characters/).fill('password123')
  await page.locator('input[type="password"]').nth(1).fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()

  // --- Enroll an authenticator ---
  await expect(page.getByText('Set up two-factor authentication')).toBeVisible()
  const secret = (await page.getByTestId('totp-secret').textContent())?.trim() ?? ''
  expect(secret.length).toBeGreaterThan(0)
  await page.getByPlaceholder('000000').fill(authenticator.generate(secret))
  await page.getByRole('button', { name: /Verify & enable/ }).click()

  // --- Recovery codes ---
  await expect(page.getByText('Save your recovery codes')).toBeVisible()
  await page.getByRole('button', { name: 'Continue to the app' }).click()

  // --- Dashboard ---
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // --- Create a batch through the UI (renderer -> IPC -> service -> DB) ---
  await page.getByRole('link', { name: 'Batches' }).click()
  await page.getByRole('button', { name: 'New batch' }).click()
  await page.getByPlaceholder('e.g. NEET Morning 2026').fill('E2E Batch')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('E2E Batch')).toBeVisible()

  // The encrypted database and key file now exist in the portable data dir.
  expect(existsSync(join(dataDir, 'chisel.db'))).toBe(true)
  expect(existsSync(join(dataDir, 'keyfile.json'))).toBe(true)

  // --- Sign out ---
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

  // --- Sign back in (password then TOTP) ---
  await page.locator('input[type="password"]').first().fill('password123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Two-factor authentication')).toBeVisible()
  await page.getByPlaceholder('000000').fill(authenticator.generate(secret))
  await page.getByRole('button', { name: 'Verify', exact: true }).click()

  // Authenticated again (the app resumes on the last screen).
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  // The batch created earlier survived the relogin.
  await page.getByRole('link', { name: 'Batches' }).click()
  await expect(page.getByText('E2E Batch')).toBeVisible()
})
