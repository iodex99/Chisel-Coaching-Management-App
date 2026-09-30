# Changelog

All notable changes to the Chisel Coaching Management Application are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses semantic versioning.

## [1.0.24]

### Added
- **Fee receipts now show Batch, Course and School.** The receipt details grid
  gains three fields, all taken from the masters:
  - **Batch** — the batch name with its academic year in brackets, e.g.
    `IX-A Morning (2026-27)` (no brackets when the batch has no academic year).
  - **Course** — the batch's course, e.g. `IX ICSE`, `X CBSE`.
  - **School** — from the School Master.
  A detail that isn't set shows `—`. Long school names wrap within their column.
- These details are **saved with each payment**, so a reprinted receipt keeps
  showing the batch / academic year / school as they were when the fee was paid —
  even after the student is promoted, or a batch or school is renamed or deleted.
- The batch **Course** field now hints the expected format (`e.g. IX ICSE, X CBSE`).

### Upgrade & data safety
- Database migration **v10** only **adds** four new columns to payments; no
  existing value is changed. Receipts recorded before this update are filled once
  from each student's current batch and school.
- Before any update changes the database, the app now saves the untouched
  database as a **`pre-update-…` backup** (listed under Settings → Backups, and
  restorable from there).

### Tests
- Upgrade tests build a real v1.0.23 database (and a full sample dataset),
  sign in with the new version, and verify every existing row of every table is
  unchanged, the pre-update backup holds the original, and receipt numbering
  continues. The E2E flow now also exports a receipt PDF through the UI.

## [1.0.23]

### Changed
- **Financial-year dropdowns now go all the way up to `2050-51`**, so far-ahead
  batches and vendor limits can be planned. The list still starts a few years in
  the past (for legacy data) and always includes the current year, ordered
  newest-first.

## [1.0.22]

### Changed
- **Financial year is now always picked from a dropdown — never typed.** Every
  place a financial year is entered (the **Batches** "Academic year" field and
  the **Accounts** "Limits by financial year" rows) now offers a fixed list of
  canonical `YYYY-YY` values (e.g. `2026-27`), so there is no ambiguity between
  entries like `26-27` and `2026-27`.
- The list of years was widened to cover several past years (for older batches)
  and future years (for planning ahead), ordered newest-first.
- A saved value that predates this list is still shown and selectable when
  editing, so no existing data is lost.

## [1.0.21]

### Added
- **A much richer Reports section**, grouped into **Summary / Registers / Fees &
  collection / Accounts / Students / Expenses** (default opens on the Financial
  summary):
  - **Consolidated:** **Financial summary** (period collected, expenses, net,
    #payments, average payment, total outstanding, overdue, student counts in one
    view) and **Batch performance** (students, net, collected, outstanding and
    **collected %** per batch).
  - **Detailed registers:** **Payment register** and **Expense register**
    (every transaction with date/receipt/student-or-vendor/mode/account/amount),
    and a **Daybook** (money **in vs out**, chronological, with totals).
  - **Daily collection by mode** — a per-day pivot (Cash / UPI / Bank / Cheque /
    Other / Total).
  - **Quick date ranges:** This month · This FY · Last 30 days · All.
- Every report still supports click-to-sort columns, a row filter, and CSV /
  Excel / PDF export.

## [1.0.20]

### Changed
- **Sample data now covers the new modules.** “Load / refresh sample data” seeds
  students spread across sample **schools** (including one inactive), and
  **post-dated cheques in every state** — due-now, upcoming, future, deposited
  and bounced — so School Master, the cheque reminders + dashboard card, and the
  school/account reports all populate for a demo.

### Fixed
- Dashboard computed the post-dated-cheque summary query twice; now once.

### Tests
- Added edge-case tests: student school update/clear, PDC deposit-date boundary /
  settled-exclusion / delete, reports’ unassigned (No account/school/batch)
  buckets and date-range handling, and guardian-2-only import. 107 unit tests +
  E2E pass; a broad adversarial edge-case audit surfaced no real defects.

## [1.0.19]

### Added
- **School Master** — a new section to manage the schools your students come
  from. Students get a **School** field (dropdown), the Students list has a
  **School filter**, and the students import template gains a dynamic **School**
  dropdown column (auto-updates as you add/remove schools).
- **Two guardians in the import template** — Guardian 1 and Guardian 2
  (name/relation/phone each), so up to two guardians import per student.
- **Post-dated cheques (PDCs)** — a new section to record cheques received now
  for later deposit. You're reminded when the date arrives: a **“Cheques to
  deposit”** list in Due Monitoring and a **dashboard card**. Mark them
  deposited/bounced as you act on them.
- **More reports:** Collection by account, **Account summary (money in / out /
  balance)**, Collection by school, Students by school, Outstanding by batch,
  Discounts given, and Monthly collection vs expense (net).

### Changed
- **Receipts:** for **cash** payments the *Mode* now shows “—”, and the *Received
  in* (account) line has been removed from the printed/PDF receipt.

## [1.0.18]

### Fixed
- **Sample-data dashboard showed ₹0 for “today / this month”.** The demo data's
  “recent” payments/expenses were pinned to the day it was loaded, so once the
  month rolled over those cards (and the collection chart's latest month) went to
  zero, even though outstanding/overdue still showed. **“Load sample data” now
  refreshes** — it clears the old sample and reseeds with *today's* dates — so the
  dashboard always reflects the current period. Click it again any time to
  re-date the demo.

### Added
- **“Remove sample data”** button (Settings → Sample data) that deletes just the
  “(Sample)”-tagged records, leaving your real data intact.

## [1.0.17]

### Added
- **Custom installments in the fees import template.** New optional columns —
  **Installment 1 / 2 / 3** (Label, Amount, Date each). Fill them for an exact
  schedule (the amounts must add up to the net fee), or leave them blank and use
  “Installments (equal split)” + “First Due Date” as before. For more than 3
  installments, create the plan in the app.

### Fixed
- **Fees import silently ignored the “Total Fee” column.** After the header was
  renamed to “Total Fee (optional)” the importer stopped matching it, so a typed
  total was dropped (it fell back to the batch/derived fee). It's matched again.
  *(Found while testing imports end-to-end.)*
- **Students import now validates gender** — “Male” is normalised to “male”, and
  anything that isn't male/female/other is rejected with a clear message (so it
  matches the gender filter/dropdown).
- **Clearer date errors on import** — a present-but-invalid date (e.g. 31-02-2026)
  now says “not a valid date (use DD-MM-YYYY)” instead of “missing”, for both the
  admission date and installment/first-due dates.

### Tests
- Added a thorough import suite (students + fees, custom installments, batch base
  fee, Excel Date cells, shuffled/extra columns, duplicates, invalid dates,
  mismatched installment totals…), and the end-to-end test now imports a student
  and a fee plan through the **real file-picker UI**.

## [1.0.16]

### Changed
- **Payments cancelled filter is now a dropdown** — *Active only* (default),
  *Cancelled only*, or *All (incl. cancelled)*. Previously the “Show cancelled”
  checkbox merely *added* cancelled rows to the active list, so there was no way
  to see only cancelled ones; now there is.

### Added
- **Rows per page (10 / 25 / 50 / 100)** selector on the Students, Payments and
  Expenses lists, so you control how many rows show per page.

## [1.0.15]

### Added
- **“Import data from another computer” on the welcome screen.** Moving to a new
  PC no longer means signing up from scratch: install Chisel, click Import, pick
  the `data` folder you copied (USB), and the app brings your database + key
  across and reloads to the sign-in screen.

### Changed
- **Clearer “move to another PC” guidance.** Settings → Data & backups now spells
  out the steps (close the app first; import or paste the folder; sign in with
  the *original* PC's master password; 2FA uses your existing authenticator or a
  recovery code). The sign-in screen shows a hint after a failed login, and the
  welcome screen links the import flow.

### Notes
- This is a documentation/UX fix — the data was always portable. The database key
  comes only from your master password (no machine binding), so a copied `data`
  folder opens on any PC **with that password**. A new machine still asks for 2FA
  once (trust is machine-bound); your existing authenticator/recovery codes work.

## [1.0.14]

### Added
- **Filters, sorting and search across every module** — click any column header
  to sort (click again to reverse), plus the filters below:
  - **Students:** added a **gender** filter; sortable by Adm. No / Name / Batch;
    search now also matches email.
  - **Payments:** added an **account** filter; sortable by Receipt / Date /
    Student / Amount / Mode.
  - **Expenses:** added **vendor**, **account** and **mode** filters; sortable by
    Date / Category / Payee-Vendor / Amount / Account.
  - **Batches:** added **search** (batch / course / year) and a **status**
    filter; sortable on every column.
  - **Fees:** added **search**, a **batch** filter and a **status** filter
    (has outstanding / has overdue / fully paid); sortable on every column.
  - **Accounts:** added **search**, **type** and **status** filters; sortable on
    every column.
  - **Due Monitoring:** added **search** and a **batch** filter; both the overdue
    and upcoming tables are sortable.
  - **Reports:** every report table is now sortable, with a **“filter rows”**
    search box to narrow any report.

## [1.0.13]

### Added
- **“Load sample data” (Settings → Sample data)** for demos and training. One
  click fills the app with a realistic, varied dataset that exercises every
  screen: 5 courses/batches with base fees, 14 students across batches and
  statuses (active / inactive / completed) with guardians, fee plans covering
  fully-paid, partial, overdue and no-plan cases, payments in every mode
  (cash / UPI / bank / cheque / other) including an advance and a cancelled one,
  and expenses across categories, vendors and accounts — including one near an
  account’s per-vendor FY limit. Sample records are tagged “(Sample)”, a
  **“pre-demo” backup is taken first** so you can restore your earlier state, and
  it refuses to load twice.

## [1.0.12]

### Added / Changed
- **Batches now feed fee plans.** In the fee editor (and “New fee plan”), pick a
  **Course / Batch** and the base fee auto-fills from that batch’s default fee;
  you then just set the discount. When a student already has a batch it’s
  preselected and the fee pre-fills automatically.
- **Fees Excel template has a dynamic Course/Batch dropdown.** Leave **Total Fee**
  blank to use the batch’s base fee, or fill it to override. The dropdown lists
  your current batches (regenerate the template after adding/removing a batch and
  it updates), so there are no spelling mistakes.
- **“New fee plan” student picker is now a search box** — filter by name,
  admission number or phone instead of scrolling a dropdown.

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
