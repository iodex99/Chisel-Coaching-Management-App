# Security Model

## Authentication & data-at-rest

The master password **is** the database key:

1. On login, the app derives `key = scrypt(password, kdfSalt, params)`
   (N=32768, r=8, p=1, 32-byte key) — `src/main/db/crypto.ts`.
2. The encrypted database file is decrypted with that key (AES-256-GCM). A
   correct password decrypts it and the GCM **auth tag** validates; a wrong
   password (or a tampered file) makes decryption throw — so the auth tag *is*
   the password verifier, with no secret stored anywhere.
3. A non-secret sidecar `data/keyfile.json` stores `{ username, kdf: { salt,
   N, r, p, keylen }, failedAttempts, lockedUntil }` — **no key, no password**.
   It supplies the KDF parameters and holds lockout state.
4. **Change password** re-encrypts the database under a freshly-derived key and
   new salt (`Db.rekey`), updates the keyfile, and takes a backup first.

> ⚠️ Because encryption is bound to the password, a forgotten master password
> means the data cannot be decrypted. This is mitigated by recovery codes (for
> 2FA) and routine encrypted backups. This trade-off is surfaced during setup.

## Two-factor authentication (TOTP)

- Mandatory on untrusted devices. Implemented with `otplib`.
- Up to **3 authenticator apps** may be enrolled (e.g. Google Authenticator,
  Authy). Verification tries each enrolled secret.
- **Recovery codes:** ~10 single-use codes, stored as `scrypt` hashes, shown
  once at setup and re-generatable from Settings.
- **Brute-force protection:** failed attempts are counted and trigger an
  exponential lockout window stored against the account.

## Trusted devices (machine-bound, not data-bound)

A "trusted device" lets the user skip the TOTP step on a known machine, up to 3
devices — **without** that trust travelling when the portable data folder is
copied:

- A per-machine secret is stored in `app.getPath('userData')` (Windows AppData),
  which lives **outside** the portable `data/` folder.
- The portable DB stores only the device id + an HMAC keyed by that machine
  secret.
- A device is trusted only when the machine-local secret reproduces the stored
  HMAC. Copying `data/` to a new PC yields no matching secret → TOTP is required
  there. This keeps a stolen/copied drive from inheriting trust.

## Other controls

- **Renderer isolation:** `contextIsolation: true`, `nodeIntegration: false`;
  the renderer has no Node/DB access and reaches main only via the typed bridge.
- **Input validation:** every IPC payload is validated with Zod in main.
- **External links** open in the OS browser, never in-app.
- **Session:** held in main-process memory; idle-timeout auto-logout; explicit
  logout clears the key and closes the DB handle.
- **Audit log:** sensitive actions (login, payment, expense, settings, security
  changes) are recorded.

## Status

| Control | State |
|---|---|
| Renderer isolation, CSP | ✅ Phase 0 |
| Password-derived AES-256-GCM encryption, keyfile, lockout, change-password | ✅ Phase 1 |
| TOTP (≤3 apps), recovery codes, machine-bound trusted devices (≤3) | ✅ Phase 2 |
