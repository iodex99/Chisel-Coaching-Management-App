# Changelog

All notable changes to the Chisel Coaching Management Application are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses semantic versioning.

## [Unreleased]

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
