# Database

## Engine & encryption

- **Engine:** `sql.js` — SQLite compiled to WebAssembly. Pure JS/WASM, so there
  is **no native module to compile** (no Visual Studio build tools needed on dev
  machines or CI), which keeps the build reproducible and unit tests trivial.
- **Encryption:** the whole database file is encrypted with **AES-256-GCM**
  (application level). The in-memory SQLite image is exported, encrypted and
  written atomically on every committed transaction (`src/main/db/database.ts`).
  This is a clean fit for the portable model — the entire DB is one encrypted
  file that is useless without the password, and the GCM auth tag doubles as the
  password verifier and tamper check.
  > Rationale: the originally-planned SQLCipher (`better-sqlite3-multiple-ciphers`)
  > needs a C++ toolchain that is not available here and complicates CI; the
  > AES-256-GCM + scrypt approach delivers the same at-rest security guarantee.
- **Location:** `data/chisel.db` inside the portable data folder (see
  [DEPLOYMENT.md](DEPLOYMENT.md)).
- **Key:** derived from the admin's master password via `scrypt`
  (N=32768, r=8, p=1). The key is never written to disk. See
  [SECURITY.md](SECURITY.md).
- **Performance at scale:** writes persist **asynchronously and coalesced** —
  a transaction commits in memory and returns immediately, while the encrypt +
  whole-file write happens off the hot path (and bursts collapse into one
  write). So recording a payment never blocks the UI even as the database grows.
  Synchronous flushes happen at safe points (open, change-password/rekey, close,
  backup, and on app quit) so an acknowledged change is never lost on a graceful
  exit. Reads always see the latest state (it is in memory).
- **Large lists** (students, payments, expenses) are **paginated** at the query
  level (LIMIT/OFFSET, 50/page) so the UI never fetches or renders huge tables.
- **Money:** stored as integer **paise** (₹ × 100). Never floats.
- **Dates:** stored as ISO-8601 strings (`YYYY-MM-DD`) or full timestamps.

## Migrations

- SQL migration files live in `src/main/db/migrations/NNNN_name.sql`, applied in
  filename order on startup inside a transaction.
- Applied versions are tracked in a `schema_migrations(version, applied_at)`
  table. Only un-applied migrations run, so updates never lose or corrupt data.
- Migrations are **append-only**: never edit a shipped migration; add a new one.

## Schema (planned)

> Status: schema is created in Phase 1+ as each module lands.

| Table | Purpose |
|---|---|
| `schema_migrations` | applied migration tracking |
| `app_user` | the single admin account + lockout state |
| `two_factor` | up to 3 enrolled TOTP secrets |
| `recovery_codes` | hashed one-time recovery codes |
| `trusted_devices` | up to 3 machine-bound trusted devices |
| `batches` | course / batch definitions |
| `students` | student master + admission records |
| `guardians` | parent / guardian details per student |
| `accounts` | cash / bank / UPI accounts (money in & out) |
| `fee_plans` | per-student fee structure |
| `fee_installments` | installment schedule with due dates |
| `payments` | fee payments received (with unique receipt no) |
| `payment_allocations` | split a payment across installments |
| `expense_categories` | expense category master |
| `vendors` | payee / vendor master |
| `expenses` | recorded expenses |
| `settings` | institute profile, receipt format, preferences |
| `audit_log` | trail of sensitive actions |

## Receipt numbering

Configurable prefix + financial year + zero-padded sequence
(e.g. `CHISEL/2026-27/0001`), incremented atomically within the same
transaction that records the payment, guaranteeing uniqueness with no gaps from
concurrent writes (single-process, serialized).
