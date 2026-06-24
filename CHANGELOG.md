# Changelog

All notable changes to the Chisel Coaching Management Application are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project uses semantic versioning.

## [Unreleased]

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
