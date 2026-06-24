# Database

## Engine & encryption

- **Engine:** `better-sqlite3-multiple-ciphers` — synchronous SQLite with
  SQLCipher (AES-256) page-level encryption.
- **Location:** `data/chisel.db` inside the portable data folder (see
  [DEPLOYMENT.md](DEPLOYMENT.md)).
- **Key:** derived from the admin's master password via `scrypt`. The key is
  never written to disk. See [SECURITY.md](SECURITY.md).
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
