# Security Model

## Sign-in: authenticator code only (since v1.0.25)

There is **no username and no password**. Signing up and signing in both use a
TOTP authenticator app (Google Authenticator, Microsoft Authenticator, Authy, …):

- **Sign-up (first run):** the app shows a QR code; the user scans it and enters
  the 6-digit code. Only when that code verifies is anything written — the
  encrypted database, the authenticator and the keyfile are created together
  (`auth.beginSetup` → `auth.setup`). One-time recovery codes are shown next.
- **Sign-in:** one field — the current 6-digit code from any enrolled app, or a
  one-time recovery code (`auth.login`). Every sign-in needs a code; there is no
  "trusted device" skip.
- **Re-authentication:** sensitive actions (adding an authenticator) ask for a
  current code (or a recovery code) — `auth.verifyCode`.

## Data at rest

1. The database file is encrypted with **AES-256-GCM** under a random 256-bit
   key generated at setup (`src/main/db/crypto.ts`). The GCM auth tag detects a
   wrong key or a tampered file.
2. With no password to derive a key from, the key is stored in
   `data/keyfile.json` (version 2: `{ dataKey, failedAttempts, lockedUntil, … }`).
   Keeping it beside the database makes the data folder — and every backup
   folder, which holds its own `keyfile.json` — self-contained: copy it to
   another PC and it opens with the same authenticator app.

> ⚠️ **Trade-off:** because the key sits next to the data, the encryption no
> longer protects against someone who copies the whole `data` folder (or a
> backup) — they hold both. Protection against that relies on Windows account
> security / disk encryption (e.g. BitLocker) and on keeping backups somewhere
> safe. In exchange, there is no password to forget: losing a password used to
> mean losing the data permanently.

## Two-factor (TOTP) details

- Implemented with `otplib`; ±1 time step (30 s) tolerance for clock skew.
- Up to **3 authenticator apps**; verification tries each enrolled secret. The
  last one cannot be removed.
- **Recovery codes:** 10 single-use codes (`XXXXX-XXXXX`), stored only as
  `scrypt` hashes, shown once and re-generatable from Settings.
- **Brute-force protection:** wrong codes (and, during the one-time upgrade,
  wrong passwords) share a counter persisted in `keyfile.json`. After 5 failures
  sign-in is locked for 30 s, doubling with each further failure (capped at
  ~8.5 h). The lock survives restarts; a successful sign-in clears it.

## Upgrading from a password-based version (≤ v1.0.24)

Older data is encrypted under `scrypt(master password)` with a version-1
keyfile holding only the salt + KDF parameters. On the first launch after the
update the sign-in screen asks **once** for that password plus an authenticator
code (`auth.unlockLegacy`). Then the keyfile is rewritten as version 2 holding
**the same key** — the database file itself is not re-encrypted, so no record
changes. Data that never finished 2FA enrollment enrolls an authenticator first
and is converted only after that succeeds.

Restoring a backup made by an older version brings back its version-1 keyfile,
so that backup is unlocked the same way, once, with the password in use when it
was made.

## Other controls

- **Renderer isolation:** `contextIsolation: true`, `nodeIntegration: false`;
  the renderer has no Node/DB access and reaches main only via the typed bridge.
- **Input validation:** every IPC payload is validated with Zod in main.
- **External links** open in the OS browser, never in-app.
- **Session:** held in main-process memory; sign-out closes the database.
- **Audit log:** sensitive actions (setup, login, the password removal, payment,
  expense, settings, security changes) are recorded.

## Status

| Control | State |
|---|---|
| Renderer isolation, CSP | ✅ Phase 0 |
| AES-256-GCM encryption, keyfile, persisted lockout | ✅ Phase 1 |
| TOTP (≤3 apps), recovery codes | ✅ Phase 2 |
| Authenticator-only sign-in (no username/password), legacy one-time unlock | ✅ v1.0.25 |
