import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { authenticator } from 'otplib'
import ExcelJS from 'exceljs'
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'crypto'

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

let secret = ''
let recoveryCode = ''

async function launch(): Promise<void> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.ELECTRON_RUN_AS_NODE // this machine sets it; it breaks Electron
  delete env.ELECTRON_RENDERER_URL
  env.CHISEL_DATA_DIR = dataDir
  app = await electron.launch({ args: ['.'], cwd: process.cwd(), env })
  page = await app.firstWindow()
}

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'chisel-e2e-'))
  await launch()
})

test.afterAll(async () => {
  await app?.close().catch(() => undefined)
  rmSync(dataDir, { recursive: true, force: true })
})

test('first-run setup is QR + code only, a UI write, then sign out + sign in with a code', async () => {
  // --- First-run setup: no username, no password ---
  await expect(page.getByText('Welcome — let’s get set up')).toBeVisible()
  await expect(page.getByText(/no username or password/)).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.getByAltText('Authenticator QR code')).toBeVisible()
  secret = (await page.getByTestId('totp-secret').textContent())?.trim() ?? ''
  expect(secret.length).toBeGreaterThan(0)
  expect(existsSync(join(dataDir, 'keyfile.json'))).toBe(false) // nothing stored until the code is verified

  // A wrong code is refused and creates nothing.
  await page.getByPlaceholder('000000').fill('000000')
  await page.getByRole('button', { name: 'Verify & create' }).click()
  await expect(page.getByText(/That code is not valid/)).toBeVisible()
  expect(existsSync(join(dataDir, 'keyfile.json'))).toBe(false)

  await page.getByPlaceholder('000000').fill(authenticator.generate(secret))
  await page.getByRole('button', { name: 'Verify & create' }).click()

  // --- Recovery codes ---
  await expect(page.getByText('Save your recovery codes')).toBeVisible()
  const allText = await page.locator('body').innerText()
  recoveryCode = allText.match(/\b[0-9A-F]{5}-[0-9A-F]{5}\b/)?.[0] ?? ''
  expect(recoveryCode).not.toBe('')
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

  // keyfile v2: a stored random key, nothing password-related.
  const kf = JSON.parse(readFileSync(join(dataDir, 'keyfile.json'), 'utf8'))
  expect(kf.version).toBe(2)
  expect(kf.kdf).toBeUndefined()
  expect(kf.username).toBeUndefined()

  // --- Sign out ---
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

  // --- Sign-in screen: a single code field, no username / password ---
  await expect(page.getByText('Enter the 6-digit code from your authenticator app.')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.locator('input')).toHaveCount(1)
  await page.getByLabel('Authenticator code').fill('000000')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid authentication code')).toBeVisible()

  // --- A recovery code signs in too ---
  await page.getByRole('button', { name: /Use a recovery code/ }).click()
  await page.getByLabel('Recovery code').fill(recoveryCode)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()

  // --- Sign back in with the authenticator code ---
  await page.getByLabel('Authenticator code').fill(authenticator.generate(secret))
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Authenticated again (the app resumes on the last screen).
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  // The batch created earlier survived the relogin.
  await page.getByRole('link', { name: 'Batches' }).click()
  await expect(page.getByText('E2E Batch')).toBeVisible()

  // --- Settings: no password / trusted-device sections; adding an app is gated by a code ---
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByText('Authenticator app code (no username or password)')).toBeVisible()
  await expect(page.getByText(/Change master password/)).toHaveCount(0)
  await expect(page.getByText(/Trusted devices/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Confirm to add authenticator')).toBeVisible()
  await page.getByLabel('Authenticator code').fill('000000')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('That code is not valid')).toBeVisible()
  await page.getByLabel('Authenticator code').fill(authenticator.generate(secret))
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Add authenticator' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  // --- Load sample data from Settings (auto-accept the confirm dialog) ---
  page.on('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: /Load.*sample data/ }).click()
  await expect(page.getByText(/Loaded sample data/)).toBeVisible({ timeout: 20000 })

  // --- School Master and Post-dated Cheques screens render the seeded data ---
  await page.getByRole('link', { name: 'School Master' }).click()
  await expect(page.getByText(/Delhi Public School/)).toBeVisible()
  await page.getByRole('link', { name: 'Post-dated Cheques' }).click()
  await expect(page.getByText('HDFC Bank')).toBeVisible()

  // --- Reports: the default consolidated "Financial summary" renders ---
  await page.getByRole('link', { name: 'Reports' }).click()
  await expect(page.getByText('Net (collection − expense)')).toBeVisible()

  // --- Receipt PDF through the real pipeline (IPC -> render -> printToPDF) ---
  await app.evaluate(({ shell }) => {
    shell.openPath = async () => '' // don't launch a PDF viewer during the test
  })
  await page.getByRole('link', { name: 'Payments' }).click()
  await page.getByTitle('Save & open PDF').first().click()
  await expect
    .poll(() => readdirSync(join(dataDir, 'receipts')).filter((f) => f.endsWith('.pdf')).length)
    .toBeGreaterThan(0)

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

/** Rewrite the data folder into the exact format v1.0.24 used: the database
 *  encrypted under scrypt(master password) and a v1 keyfile (salt + KDF only). */
function convertToPasswordFormat(password: string): Buffer {
  const kf = JSON.parse(readFileSync(join(dataDir, 'keyfile.json'), 'utf8'))
  const blob = readFileSync(join(dataDir, 'chisel.db'))
  const d = createDecipheriv('aes-256-gcm', Buffer.from(kf.dataKey, 'base64'), blob.subarray(0, 12))
  d.setAuthTag(blob.subarray(12, 28))
  const plain = Buffer.concat([d.update(blob.subarray(28)), d.final()])

  const salt = randomBytes(16)
  const kdf = { N: 32768, r: 8, p: 1, keylen: 32 }
  const key = scryptSync(password.normalize('NFKC'), salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 })
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([c.update(plain), c.final()])
  writeFileSync(join(dataDir, 'chisel.db'), Buffer.concat([iv, c.getAuthTag(), enc]))
  const ts = new Date().toISOString()
  writeFileSync(
    join(dataDir, 'keyfile.json'),
    JSON.stringify({ version: 1, username: 'admin', kdf: { salt: salt.toString('base64'), ...kdf }, failedAttempts: 0, lockedUntil: null, createdAt: ts, updatedAt: ts }, null, 2)
  )
  return key
}

test('existing password-based data: one-time unlock with the old password, then code-only', async () => {
  await app.close()
  const legacyKey = convertToPasswordFormat('oldpass123')
  await launch()

  // The old data asks for its password once (plus a code) — never a username.
  await expect(page.getByText('One-time upgrade')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(1)

  await page.locator('input[type="password"]').fill('wrong-password')
  await page.getByLabel('Authenticator code').fill(authenticator.generate(secret))
  await page.getByRole('button', { name: /Unlock/ }).click()
  await expect(page.getByText('Incorrect password')).toBeVisible()
  expect(JSON.parse(readFileSync(join(dataDir, 'keyfile.json'), 'utf8')).version).toBe(1)

  await page.locator('input[type="password"]').fill('oldpass123')
  await page.getByLabel('Authenticator code').fill(authenticator.generate(secret))
  await page.getByRole('button', { name: /Unlock/ }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  // Everything is still there.
  await page.getByRole('link', { name: 'Batches' }).click()
  await expect(page.getByText('E2E Batch')).toBeVisible()
  await page.getByRole('link', { name: 'Students' }).click()
  await expect(page.getByText('Import Test')).toBeVisible()
  await expect(page.getByText('Aarav Sharma')).toBeVisible()

  // Converted in place: same key, now stored; no password state left.
  const kf = JSON.parse(readFileSync(join(dataDir, 'keyfile.json'), 'utf8'))
  expect(kf.version).toBe(2)
  expect(kf.kdf).toBeUndefined()
  expect(Buffer.from(kf.dataKey, 'base64').equals(legacyKey)).toBe(true)

  // From now on the sign-in screen is the code only.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByText('Enter the 6-digit code from your authenticator app.')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await page.getByLabel('Authenticator code').fill(authenticator.generate(secret))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

  // ...and stays that way after a restart.
  await app.close()
  await launch()
  await expect(page.getByText('Enter the 6-digit code from your authenticator app.')).toBeVisible()
  await page.getByLabel('Authenticator code').fill(authenticator.generate(secret))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('link', { name: 'Batches' }).click()
  await expect(page.getByText('E2E Batch')).toBeVisible()
})

test('a damaged data file (power cut while saving): the right code is recognised and a backup restores it', async () => {
  await app.close() // the exit auto-backup holds everything so far
  const size = readFileSync(join(dataDir, 'chisel.db')).length
  writeFileSync(join(dataDir, 'chisel.db'), Buffer.alloc(size)) // what a power cut can leave behind
  await launch()

  await page.getByLabel('Authenticator code').fill(authenticator.generate(secret))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Your code is correct — but the data file is damaged.')).toBeVisible()
  await expect(page.getByText(/Invalid authentication code|Incorrect/)).toHaveCount(0)

  await page.getByRole('button', { name: 'Restore this backup and sign in' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.getByRole('link', { name: 'Batches' }).click()
  await expect(page.getByText('E2E Batch')).toBeVisible()
  await page.getByRole('link', { name: 'Students' }).click()
  await expect(page.getByText('Import Test')).toBeVisible()

  // The damaged file was kept aside, not deleted.
  const aside = readdirSync(join(dataDir, 'backups')).filter((n) => n.startsWith('damaged-'))
  expect(aside).toHaveLength(1)
  expect(readFileSync(join(dataDir, 'backups', aside[0], 'chisel.db')).every((b) => b === 0)).toBe(true)
})
