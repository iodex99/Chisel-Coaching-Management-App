# Changelog

All notable changes to the Chisel Coaching Management Application are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses semantic versioning.

## [1.0.11]

### Added
- **“New fee plan” button on the Fees screen.** Pick a student and build their
  fee structure (total, discount, installments, “generate equal split”) inline,
  without first opening the student’s page. If the student already has a plan it
  loads for editing. The per-student “Create fee plan” on the student detail page
  remains — this is just a faster manual entry point from the Fees overview.

## [1.0.10]

A correctness/hardening release driven by a full system test pass and a
multi-agent adversarial audit. Unit tests grew from 49 to 73 (a full dummy-data
integration scenario incl. an Excel upload, plus edge-case and service-guard
suites).

### Fixed
- **Persistence race:** `flush()` could capture a stale database during a
  backup, password change, restore, or quit — a coalesced async write firing
  mid-flush cleared the dirty flag and swapped in a write that `flush()` never
  awaited, so the most recent transaction could be missing from the snapshot.
  Flushing is now deterministic (sync write + drain).
- **Month-end due dates:** imported fee installments now clamp to the last day
  of the month (Jan 31 + 1 month → Feb 28/29) instead of rolling into March.
- **Invalid dates rejected:** impossible calendar dates (Feb 31, Apr 31) are now
  rejected by the date field and the Excel import, not stored.
- **Fee import validation:** rejects non-positive totals, negative discounts and
  a present-but-invalid first due date (instead of silently importing).
- **Account deletion:** deleting an account still referenced by payments or
  expenses now shows a clear message instead of a raw database error.
- **Expense edit / fee plan:** editing an expense validates a positive amount;
  a fee plan requires a positive total.

### Security
- **2FA brute-force guard:** the authenticator gate now allows at most 5 wrong
  codes per session before dropping it (you must re-enter the password) — the
  password step was already rate-limited; this closes the gap after it.
- **Lockout backoff cap:** the exponential login lockout can no longer overflow
  to an invalid date.
- **Defensive validation:** dates and financial-year strings are format-checked
  in the IPC layer so a malformed value can't reach the date math.

## [1.0.9]

### Changed
- **Required student fields:** Admission No, Admission Date, First Name, Last
  Name and Gender are now mandatory — in the student form, the IPC validation,
  and the import (rows missing any are reported and skipped).
- **Students import template** now includes **Guardian Name / Relation / Phone**
  columns (imported as the student's guardian), and required columns are marked
  with `*`.
- **Dates are `dd-mm-yyyy` everywhere** — on-screen, receipts, reports, CSV/Excel
  exports, and the import templates + parsing. A new date field shows and accepts
  `dd-mm-yyyy` (with a calendar button); internally dates remain ISO for sorting.
- Manual fee-structure entry is retained (per student, on the student page);
  import is an optional extra.

### Fixed
- A timezone bug where dates built via UTC (`toISOString`) could land a day off
  (e.g. installment due dates, "today"); dates are now computed from local parts.

## [1.0.8]

### Fixed — data was lost on update
- The data folder used to live **inside the install directory**, which the NSIS
  auto-update cleans/replaces — wiping or orphaning the data and forcing a fresh
  sign-up. Data now lives in a per-user location **outside** the install folder
  (`%APPDATA%\chisel-coaching-management\data`) that updates never touch.
- Added a one-time **migration** that copies data from the old install-folder
  location into the new safe location on first launch — so existing data is
  recovered, not lost.

## [1.0.7]

### Changed
- **Per-financial-year vendor limits on accounts.** The account form now takes a
  *default* per-vendor limit plus an editable list of **year-specific limits**
  (e.g. 2026-27 → ₹50,000). When recording an expense, the cap is resolved for
  the expense's own financial year (the year's override if set, otherwise the
  default). The accounts list shows the limit in effect for the current year.
  Migration `0007_account_fy_limits`.

## [1.0.6]

### Fixed / Changed — auto-update reworked
- Replaced the hand-rolled file-swap updater (which couldn't reliably overwrite a
  running app on Windows — it failed to restart, then errored with `ENOTEMPTY`)
  with **electron-updater** driving the NSIS installer. Updates now install and
  relaunch reliably; the `data/` folder is preserved.
- The Updates panel now shows the **download size** and a **live progress bar**
  (percent + MB transferred).
- Release pipeline switched to `electron-builder --publish` (uploads the
  installer + `latest.yml` + blockmap that electron-updater reads).

> One-time note: because the old updater is baked into installed 1.0.2–1.0.5
> builds, those can't self-update to 1.0.6 — install **1.0.6 manually** once
> (download the Setup .exe). In-app updates work from 1.0.6 onward.

## [1.0.5]

### Added
- **Per-vendor spending limit on accounts.** When adding/editing an account you
  can set a *max payable to any single vendor per financial year (Apr–Mar)*
  (0 = no limit). When recording an expense paid from that account to a vendor,
  the form shows how much has already gone to that vendor this FY and the
  **remaining headroom**, **warns** when you're close, and **blocks** (with a
  clear message) if the entry would exceed it. Enforced in the service so it
  can't be bypassed; the accounts list shows each account's limit.
  Migration `0006_account_limits`.

## [1.0.4]

### Fixed
- **Auto-update install failed** with `Invalid package … app.asar`. Electron's
  `fs` treats any path containing `.asar` as an archive, so extracting the new
  `app.asar` into the staging folder was intercepted and rejected. The updater
  now disables that interception (`process.noAsar`) around extraction.
  > Note: because the broken updater code lives in the *installed* build, the
  > in-app update from 1.0.2/1.0.3 cannot self-heal — install 1.0.4 manually
  > once (download the Setup .exe). In-app updates work from 1.0.4 onward.

## [1.0.3]

### Added
- **Bulk import** for students and fees via Excel (`.xlsx`) templates. The
  students template includes **dropdowns** (data validation) for Batch, Gender
  and Status — the Batch list is generated from the batches you've created, so
  there are no spelling mistakes. Import validates every row and reports
  per-row errors; fee rows are split into equal monthly installments. Available
  from the **Students** and **Fees** screens.
- **Excel (.xlsx) report export** that opens in Excel (alongside CSV/PDF).
- **Settings → Data & backups** now shows the exact data-folder path with an
  **Open folder** button.

### Changed / Fixed
- **Fixed payment Cancel**: it relied on `window.prompt`, which Electron does not
  support, so nothing happened. It now uses a proper confirmation dialog (with an
  optional reason) and refreshes the list/dashboard.
- **Security**: adding a new authenticator now requires re-entering the master
  password.

## [1.0.2]

- First release built with the `UPDATE_READ_TOKEN` secret configured, so the
  in-app "Check for updates" works against the private repo. No code changes
  from 1.0.1.

## [1.0.1]

### Delivery & scale
- **Installer:** the Windows build is now a single per-user **NSIS installer**
  (`Chisel-Coaching-Setup-<version>.exe`) — no admin rights, choose-your-folder,
  desktop/Start-menu shortcuts. Data still lives in `data/` next to the exe, so
  the folder stays portable and the in-app updater keeps working. CI publishes
  the installer + the updater's zip/manifest on each release.
- **Non-blocking saves:** database persistence is now asynchronous and coalesced
  (with synchronous flushes at open/rekey/close/backup/quit), so recording a
  payment never blocks the UI as the database grows over the years.
- **Paginated lists:** students, payments and expenses are paged (50/row) at the
  query level so the UI never fetches or renders huge tables.

## [1.0.0]

First complete release: Student Fee Management and Expense Management modules,
secure 2FA login, encrypted portable local storage, receipts, reporting,
backups and one-click self-update.

### Phase 11 — Testing, packaging & release
- **Playwright end-to-end** test driving the real app: first-run setup → TOTP
  enrollment → recovery codes → dashboard → create a batch (renderer→IPC→DB) →
  sign out → sign in with password + TOTP → data persisted.
- Verified the **packaged** Windows app boots and creates its portable `data/`
  folder next to the executable, and that the encrypted-DB WASM ships inside the
  asar.
- Bumped to **v1.0.0**; docs finalized across `README` and `docs/`.

### Phase 10 — Auto-update & CI/CD
- In-app updater (`update.ts`): checks the private repo's latest GitHub Release,
  compares versions (semver), downloads + SHA-256-verifies the package, extracts
  it, and spawns a detached PowerShell helper that swaps the program files
  (preserving `data/`) and relaunches — with progress events to the UI.
- Read-only update token baked at build time via electron-vite `define`
  (`UPDATE_READ_TOKEN` CI secret); dev builds report "release builds only".
- GitHub Actions: `ci.yml` (typecheck + tests on push/PR) and `release.yml`
  (tag `v*` → build → zip + `latest.json` → GitHub Release).
- UI: "Update available" banner and **Settings → Updates** (check + install with
  live status).

### Phase 9 — Settings: backup & restore
- Backup service: each backup is a folder containing both the encrypted database
  **and** its key file, so restores survive later password changes.
- Create / list / delete backups; **restore** snapshots current data first, drops
  the in-memory DB without persisting (so it can't overwrite the restored file),
  swaps the files, and forces re-login.
- Automatic backup on exit (keeps the last 10), toggleable.
- UI: Settings → **Data & backups** (create, auto toggle, restore/delete list).
  Institute profile (Phase 5) and security (Phase 2) complete the Settings page.
- Vitest backup/restore test verifying a true rollback (39 total passing).

### Phase 8 — Reports & analytics
- Report service with 10 reports: collection by student / date / mode / batch,
  outstanding fees; expenses by date / category / vendor / account / month —
  each with date-range filtering and totals.
- Shared `pdf.ts` helper (HTML→PDF and print) reused by receipts and reports;
  receipts refactored onto it.
- Report PDF export (branded HTML table → PDF, opened) and renderer-side **CSV**
  export.
- UI: **Reports** screen (grouped report picker, date range, generic table,
  CSV/PDF export). Reports sidebar enabled.
- Vitest report tests (37 total passing).

### Phase 7 — Expense management
- Migration `0005_expenses` (`expense_categories` with starter categories,
  `vendors`, `expenses`).
- Expense service: categories & vendors CRUD (delete guarded when referenced),
  expense record/update/delete, filtered listing, and a summary (month total,
  all-time, this-month by-category, 6-month trend).
- Dashboard extended with month expenses and net (collection − expenses).
- UI: **Expenses** screen (KPIs, top categories, filterable history, record
  modal, manage-categories and manage-vendors modals). Expenses sidebar enabled.
- Vitest expense tests (32 total passing).

### Phase 6 — Dashboard & due monitoring
- Dashboard service: today/month collection, total outstanding, overdue student
  count + amount, upcoming-dues count, 6-month collection trend, recent payments.
- Due lists: overdue and upcoming (configurable window) installments with
  outstanding, joined to students/batches.
- UI: data-driven **Dashboard** (KPI cards, recharts collection bar chart,
  overdue/upcoming quick cards, recent payments) and a **Due Monitoring** screen
  (overdue + upcoming tables, window selector). Due Monitoring sidebar enabled.

### Phase 5 — Payments & receipts
- Payment service: record a payment with allocations across installments,
  **atomic per-financial-year receipt numbering** (`PREFIX/FY/0001`), validation
  that allocations don't exceed installment outstanding, and cancellation (which
  excludes the payment from totals and restores outstanding).
- Receipt service: branded HTML receipt → **PDF** (Electron `printToPDF`, saved
  to `data/receipts` and opened) and **print** (system dialog); rupees-in-words
  (Indian numbering). `printToPDF` verified working in this environment.
- Settings service + **Institute profile** editor (name/address/phone/email +
  receipt prefix/footer) used on receipts.
- UI: **Payments** screen (record modal with auto-allocation, filterable
  history, reprint, cancel), payment history + collect-payment on the student
  page, reusable receipt actions. Payments sidebar item enabled.
- Vitest payment tests: receipt numbering, allocation limits, cancel restores
  outstanding, receipt data (29 total passing).

### Phase 4 — Fee structure & outstanding tracking
- Migration `0004_fees` (`fee_plans`, `fee_installments`, plus the `payments`
  and `payment_allocations` tables that the payments phase will populate).
- Fee service: one fee plan per student (total − discount = net), installment
  schedule that must sum to net, derived per-installment status
  (pending/partial/paid/overdue) and outstanding from non-cancelled payment
  allocations; guard against restructuring a plan once payments exist.
- Per-student fee summaries (net/paid/outstanding, overdue count, next due) for
  the overview and later reports.
- UI: fee-plan panel on the student page (installment table with status badges +
  totals), a fee-plan editor with an "equal split" generator, and a **Fees**
  overview screen with collection KPIs. Fees sidebar item enabled.
- Vitest fee tests (23 total passing).

### Phase 3 — Core data: students, batches, guardians, accounts
- Migration `0003_core` (`accounts`, `batches`, `students`, `guardians`);
  foreign keys enabled per connection for guardian cascade.
- Services with CRUD for accounts, batches (with live student counts + delete
  guard), and students (search/batch/status filters, guardian replace,
  unique-admission-no enforcement, next-admission-no suggestion).
- IPC `handle`/`handleAuthed` helpers with proper Zod output-type inference; all
  data domains require an authenticated session.
- UI: **Students** (searchable/filterable list, profile detail, create/edit with
  a guardians repeater and batch assignment), **Batches** and **Accounts**
  management screens; sidebar items enabled.
- Money stored as integer paise; rupee↔paise helpers in the renderer.
- Vitest core-CRUD tests (19 total passing).

### Phase 2 — Two-factor authentication
- TOTP 2FA with `otplib` + QR enrollment (`qrcode`); up to **3** authenticator
  apps; verification tries each enrolled secret.
- One-time **recovery codes** (10 per set, scrypt-hashed, single-use) with
  copy/download UI.
- **Machine-bound trusted devices** (up to 3): the trust secret lives in the OS
  user-data folder (outside the portable `data/`), so copying the data folder to
  another PC does not carry trust — verified by a "new machine" test.
- Staged login model (`pending-enroll` → `pending-2fa` → `authenticated`); 2FA
  is mandatory and enforced at the service layer.
- First-run flow now: setup → enroll authenticator → save recovery codes → app.
- Settings → Security: manage authenticators (add/remove, keep ≥1), regenerate
  recovery codes, view/remove trusted devices.
- Migration `0002_two_factor` (`two_factor`, `recovery_codes`, `trusted_devices`).
- Vitest coverage extended to the full 2FA flow (15 tests passing).

### Phase 1 — Encrypted database & authentication
- Database layer on `sql.js` (SQLite/WASM) with whole-file **AES-256-GCM**
  encryption; key derived from the master password via `scrypt`. Replaces the
  planned native SQLCipher module to avoid a C++ build toolchain — same at-rest
  security, simpler builds and tests.
- Atomic, encrypted persistence on every committed transaction; timestamped
  backups helper.
- Migration runner (`schema_migrations`) with the initial schema (`app_user`,
  `settings`, `audit_log`).
- Non-secret `keyfile.json` sidecar holding KDF params + lockout state.
- Auth service: first-run setup, login with master password, logout,
  failed-attempt lockout (escalating), and change-password (re-encrypt/rekey).
- Audit logging of setup/login/logout/change-password.
- IPC `auth` domain with Zod-validated payloads; renderer auth store.
- Renderer flow: first-run **Setup wizard**, **Login**, authenticated **app
  shell** (branded sidebar) with a placeholder Dashboard and a **Settings**
  screen (account info + change password).
- Vitest unit tests for crypto and the full auth/DB flow (6 passing).
- `CHISEL_DATA_DIR` override to point the app at a throwaway data folder.

### Phase 0 — Scaffold & foundation
- Initialized the Electron + electron-vite + React + TypeScript project.
- Tailwind CSS configured with the Chisel brand palette (navy + red) sampled
  from the logo.
- Secure window defaults: context isolation on, node integration off, external
  links open in the OS browser, single-instance lock.
- Typed IPC bridge (`window.api`) scaffolded via `contextBridge`, backed by the
  `ChiselApi` contract in `src/shared/api.ts`.
- Portable data-directory resolution (`src/main/paths.ts`) — data lives next to
  the executable in production, in the project root during development.
- Application logging routed to `data/logs/` via `electron-log`.
- Branded landing screen and project documentation skeleton
  (`README.md` + `docs/`).
