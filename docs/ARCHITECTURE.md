# Architecture

## Process model

The app follows the standard secure Electron pattern: a privileged **main**
process owns all data and business logic, and a sandboxed **renderer** (React)
talks to it only through a typed, validated IPC bridge.

```
 main process                preload (contextBridge)        renderer (React)
 ─────────────               ───────────────────────        ────────────────
 SQLCipher database   <─IPC─   window.api.<domain>.*   <──   screens / hooks
 service layer                 (typed contract)              no Node / no DB
 auth · 2FA · fees ·           ipcRenderer.invoke            contextIsolation ✔
 payments · receipts ·                                       nodeIntegration �’
 expenses · reports ·                                        sandbox-friendly
 backup · updater
```

- **Main** (`src/main/`) — opens the encrypted database, runs migrations, and
  exposes feature **services**. It is the only place with filesystem/DB access.
- **Preload** (`src/preload/`) — implements the `window.api` contract from
  `src/shared/api.ts` using `ipcRenderer.invoke`, exposed via `contextBridge`.
  `contextIsolation: true`, `nodeIntegration: false`.
- **Renderer** (`src/renderer/`) — React UI. It calls `window.api.*` and never
  imports Node or database code. Data fetching/caching uses TanStack Query;
  light UI state uses Zustand.
- **Shared** (`src/shared/`) — TypeScript types, Zod schemas and constants
  imported by both sides. The `ChiselApi` interface is the single contract.

## IPC

- Channels are namespaced `domain:action` (e.g. `payment:record`).
- Handlers are registered in `src/main/ipc.ts` (delegating to services as the
  surface grows). Every payload crossing the boundary is validated with Zod in
  the main process before it reaches a service.
- The preload exposes one object per domain on `window.api`, matching
  `ChiselApi`.

## Project layout

```
src/
  main/
    index.ts          app bootstrap, window, logging
    paths.ts          portable data-dir resolution
    ipc.ts            IPC handler registration
    db/               connection, keyfile, migrations, schema  (Phase 1+)
    services/         auth, twoFactor, student, batch, guardian, account,
                      fee, payment, receipt, expense, category, vendor,
                      report, dashboard, backup, update, settings, audit
  preload/
    index.ts          contextBridge implementation of ChiselApi
  renderer/
    index.html
    src/
      main.tsx        React entry
      App.tsx         router + shell
      assets/         logo and static assets
      screens/        one folder per feature screen     (Phase 1+)
      components/     shared UI components               (Phase 1+)
      lib/            api hooks, query client            (Phase 1+)
  shared/
    api.ts            the ChiselApi contract
    constants.ts      enums (payment modes, account types, limits)
    types.ts          domain types
    schemas.ts        Zod validation schemas
docs/                 living documentation
resources/            logo + icons bundled into the build
build/                electron-builder build resources
.github/workflows/    release pipeline
```

## Key conventions

- The renderer is presentation-only; all rules (fee math, receipt numbering,
  outstanding calculation) live in main-process services so they are unit-
  testable without Electron.
- The database is opened **once** in the main process after the master password
  unlocks it; the handle is shared by all services.
- All money is stored in **integer paise** (₹ × 100) to avoid floating-point
  drift, and formatted for display in the renderer.

## Status

| Area | State |
|---|---|
| Scaffold, shell, branding, IPC bridge | ✅ Phase 0 |
| Encrypted DB (sql.js + AES), migrations, auth, first-run setup | ✅ Phase 1 |
| 2FA: TOTP, recovery codes, trusted devices; staged login | ✅ Phase 2 |
| Students, batches, guardians, accounts (CRUD services + UI) | ✅ Phase 3 |
| Fee plans, installments, outstanding/status, fees overview | ✅ Phase 4 |
| Payments, allocations, receipt numbering, PDF/print, history | ✅ Phase 5 |
| Dashboard (KPIs + collection chart), due monitoring | ✅ Phase 6 |
| Expenses: categories, vendors, records, expense dashboard | ✅ Phase 7 |
| Everything else | ⏳ see build plan |
