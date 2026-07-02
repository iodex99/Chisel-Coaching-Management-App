import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { authenticator } from 'otplib'
import ExcelJS from 'exceljs'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

async function xlsx(sheet: string, header: string[], row: (string | number)[]): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheet)
  ws.addRow(header)
  ws.addRow(row)
  const path = join(tmpdir(), `e2e-${sheet}-${header.length}.xlsx`)
  writeFileSync(path, Buffer.from(await wb.xlsx.writeBuffer()))
  return path
}

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
  // Exercise the dd-mm-yyyy DateField (start date).
  await page.getByPlaceholder('dd-mm-yyyy').first().fill('01-06-2026')
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

  // --- Load sample data from Settings (auto-accept the confirm dialog) ---
  page.on('dialog', (d) => void d.accept())
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: /Load.*sample data/ }).click()
  await expect(page.getByText(/Loaded sample data/)).toBeVisible({ timeout: 20000 })

  // --- School Master and Post-dated Cheques screens render the seeded data ---
  await page.getByRole('link', { name: 'School Master' }).click()
  await expect(page.getByText(/Delhi Public School/)).toBeVisible()
  await page.getByRole('link', { name: 'Post-dated Cheques' }).click()
  await expect(page.getByText('HDFC Bank')).toBeVisible()

  // --- Students: a sortable header round-trips to the backend on the seeded list ---
  await page.getByRole('link', { name: 'Students' }).click()
  await expect(page.getByText('Aarav Sharma')).toBeVisible()
  await page.getByRole('button', { name: /^Name/ }).click()
  await expect(page.getByText('Aarav Sharma')).toBeVisible()

  // --- Fees now shows seeded plans, and "New fee plan" search finds students ---
  await page.getByRole('link', { name: 'Fees' }).click()
  await expect(page.getByText('Aarav Sharma')).toBeVisible()
  await page.getByRole('button', { name: 'New fee plan' }).click()
  await expect(page.getByPlaceholder(/Search by name, admission no/)).toBeVisible()
  await page.getByPlaceholder(/Search by name, admission no/).fill('Aarav')
  await expect(page.getByRole('button', { name: /Aarav Sharma/ })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  // --- Bulk import through the real UI (students template, then a fee plan) ---
  const stuPath = await xlsx(
    'Students',
    ['Admission No *', 'Admission Date (DD-MM-YYYY) *', 'First Name *', 'Last Name *', 'Gender *'],
    ['E2E-1', '01-06-2026', 'Import', 'Test', 'male']
  )
  await page.getByRole('link', { name: 'Students' }).click()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles(stuPath)
  await expect(page.getByText(/Imported 1 row/)).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByText('Import Test')).toBeVisible()

  const feePath = await xlsx(
    'Fees',
    ['Admission No', 'Total Fee (optional)', 'Installments (equal split)', 'First Due Date (DD-MM-YYYY)'],
    ['E2E-1', 12000, 2, '01-06-2026']
  )
  await page.getByRole('link', { name: 'Fees' }).click()
  await page.getByRole('button', { name: 'Import fee plans' }).click()
  await page.locator('input[type="file"]').setInputFiles(feePath)
  await expect(page.getByText(/Imported 1 row/)).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByText('Import Test')).toBeVisible()
})
