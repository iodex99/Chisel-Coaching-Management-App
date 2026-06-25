# Development Guide

## Prerequisites

- Node.js 20+ (developed on 24.x), npm 10+.
- Windows (the build target). **No C++ build tools required** — the stack is
  pure JS/WASM (the database is `sql.js`), so there are no native modules to
  compile and `npm install` never invokes node-gyp.

## Setup

```bash
npm install     # pure JS/WASM deps — no native compilation
npm run dev      # start the app with hot reload
```

> Dev note: this machine has `ELECTRON_RUN_AS_NODE=1` set globally, which makes
> Electron run as plain Node and crash on startup. When launching Electron
> manually (smoke tests, Playwright), clear it first:
> `Remove-Item Env:ELECTRON_RUN_AS_NODE`. `npm run dev` via electron-vite is
> unaffected. It is not set on end-user machines.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Run the app (electron-vite dev server + Electron) |
| `npm run build` | Type-aware build of main/preload/renderer into `out/` |
| `npm run typecheck` | `tsc --noEmit` for node + web configs |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright Electron) |
| `npm run pack` | Unpacked portable folder in `release/` |
| `npm run dist` | Distributable zip in `release/` |

## Conventions

- **Layers:** business logic lives in `src/main/services/`; the renderer is
  presentation only. This keeps rules unit-testable without Electron.
- **IPC:** add a method to `ChiselApi` (`src/shared/api.ts`), implement it in the
  preload, register the handler in `src/main/ipc.ts`, validate the payload with
  a Zod schema from `src/shared/schemas.ts`.
- **Money:** integer paise everywhere in main/DB; format only for display.
- **Dates:** stored as ISO `yyyy-mm-dd`; shown/entered/exported as `dd-mm-yyyy`
  (use `DateField` for inputs, `fmtDate` for display). Never build a date with
  `toISOString()` (it shifts by timezone) — use the local-parts helpers
  (`todayIso`, `todayISO`).
- **Imports:** `@shared/*`, `@main/*` (node side) and `@/*`, `@shared/*`
  (renderer side) path aliases.
- **Migrations:** append a new numbered file in `src/main/db/migrations/`; never
  edit a shipped one.
- **Docs:** update the relevant `docs/*.md` and `CHANGELOG.md` in the same
  change that ships a feature.

## Testing strategy

- **Unit (Vitest):** KDF/auth, TOTP across multiple secrets, recovery codes,
  trusted-device HMAC, receipt numbering, fee/outstanding math, payment
  allocation, report aggregation, migration runner — all against an in-memory or
  temp encrypted DB.
- **E2E (Playwright Electron):** launch the packaged app against a throwaway temp
  data dir and drive first-run setup → login → create student → fee plan →
  payment → receipt → expense → reports → logout.

## Packaging notes

- `npm run pack` produces `release/win-unpacked/` (the portable folder) and
  `npm run dist` adds the zip. On a dev machine **without Windows Developer Mode
  / admin**, electron-builder's `winCodeSign` cache extraction can fail on a
  symlink step *after* the app folder is written — the `win-unpacked` output is
  still valid. GitHub Actions (`release.yml`, windows-latest) has the privilege
  and builds cleanly; CI is the canonical release path.
- We do not code-sign; Windows SmartScreen may warn on first download.

## Status

✅ Complete (v1.0.0): all modules, encrypted DB, 2FA, receipts, reports,
backups, auto-update and CI/CD. Verified by Vitest (services) + a Playwright
end-to-end run (first-run → 2FA → UI write → relogin) and a packaged-app smoke
test.
