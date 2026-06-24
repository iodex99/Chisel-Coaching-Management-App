# Development Guide

## Prerequisites

- Node.js 20+ (developed on 24.x), npm 10+.
- Windows (the build target). Native modules build for the Electron ABI via
  `electron-builder install-app-deps` (runs automatically on `postinstall`).

## Setup

```bash
npm install     # installs deps + rebuilds better-sqlite3-multiple-ciphers for Electron
npm run dev      # start the app with hot reload
```

If the native module fails to load (`ERR_DLOPEN_FAILED` / ABI mismatch):

```bash
npx electron-builder install-app-deps
```

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

## Status

✅ Phase 0 scaffold builds and runs. Subsequent phases extend services and
screens; this guide is updated as conventions solidify.
