# Security Model

## Authentication & data-at-rest

The master password **is** the database key:

1. On login, the app derives `key = scrypt(password, kdfSalt, params)`.
2. The database is opened with `PRAGMA key = key`. A correct password decrypts
   it; a wrong password fails to read.
3. A non-secret sidecar `data/keyfile.json` stores `{ username, kdfSalt,
   kdfParams, verifier }`, where `verifier` is an HMAC over the derived key. It
   lets the app reject a wrong password quickly (and drive lockout) **without
   storing the key or the password**.
4. **Change password** re-encrypts the DB via SQLCipher `PRAGMA rekey` and
   rewrites the verifier, with a backup taken first.

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
| Password-derived encryption, keyfile, lockout | ⏳ Phase 1 |
| TOTP, recovery codes, trusted devices | ⏳ Phase 2 |
