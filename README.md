<div align="center">
  <img src="resources/logo.jpg" alt="Chisel Coaching Classes" width="420" />
  <h1>Chisel Coaching — Management Application</h1>
  <p><em>Enter to learn, grow and achieve</em></p>
</div>

A locally-hosted **desktop application** for Chisel Coaching Classes to manage
student fee collection, payment tracking, receipt generation, expense
management and financial reporting — with a secure 2FA login, encrypted local
storage, full portability, and one-click self-updates.

---

## Highlights

- **Portable** — the app and all its data live in a single folder. Copy that
  folder to a USB drive and run it on any Windows PC; it resumes exactly where
  it left off. No installer, no scattered files.
- **Secure** — credential login + mandatory TOTP two-factor authentication
  (up to 3 authenticator apps and 3 trusted devices). The database is encrypted
  at rest (SQLCipher / AES-256) with a key derived from the master password.
- **Self-updating** — the app checks GitHub for new versions, shows an
  "Update available" prompt, and on one click downloads, verifies, swaps and
  relaunches itself. Your data is never touched.
- **Two modules** — Student Fee Management and Expense Management, plus rich
  dashboards and reports.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Electron + electron-vite |
| UI | React 18 + TypeScript + Tailwind CSS |
| State / data | Zustand + TanStack Query (over typed IPC) |
| Database | sql.js (SQLite/WASM) + AES-256-GCM whole-file encryption |
| 2FA | otplib (TOTP) + qrcode |
| Receipts / PDF | Electron `printToPDF` over HTML templates |
| Packaging | electron-builder (portable Windows folder + zip) |
| Updates | Custom GitHub-Releases updater |
| Tests | Vitest (unit) + Playwright (E2E) |

## Quick start (development)

```bash
npm install      # installs deps and rebuilds the native DB module for Electron
npm run dev       # launches the app with hot reload
```

Other scripts:

```bash
npm run typecheck   # type-check main + renderer
npm test            # unit tests (Vitest)
npm run test:e2e    # end-to-end tests (Playwright)
npm run pack        # build an unpacked portable folder in release/
npm run dist        # build the distributable zip in release/
```

## Documentation

The `docs/` folder is the living source of truth and is updated every
iteration:

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Process model, IPC, project layout |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, migrations, encryption |
| [docs/SECURITY.md](docs/SECURITY.md) | Auth, 2FA, trusted devices, threat model |
| [docs/UPDATE_MECHANISM.md](docs/UPDATE_MECHANISM.md) | Release pipeline + in-app updater |
| [docs/MODULES.md](docs/MODULES.md) | Feature breakdown (fees, expenses) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Install, portable/USB use, backup/restore |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Dev setup, conventions, testing |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

## Project status

**v1.0.0 — feature-complete.** All modules are implemented and verified:

- ✅ Secure login + mandatory TOTP 2FA (3 apps, 3 trusted devices, recovery codes)
- ✅ Encrypted (AES-256-GCM) portable local database; copy the folder to a USB drive
- ✅ Students, guardians, batches, accounts
- ✅ Fee plans, installments, outstanding tracking
- ✅ Payment collection, allocation, unique receipts (PDF + print, reprint)
- ✅ Dashboard, due monitoring, expense management
- ✅ Reports (10 types) with CSV/PDF export
- ✅ Institute profile, backup/restore, security management
- ✅ One-click self-update from GitHub Releases + CI/CD

Verified with Vitest (service/business-logic suites) and a Playwright
end-to-end run, plus a packaged-app smoke test. See [CHANGELOG.md](CHANGELOG.md).
