# Deployment, Portability & Backup

## Delivery

CI (`release.yml`) produces a single **installer** — `Chisel-Coaching-Setup-<version>.exe`
— attached to the GitHub Release. Hand that one file to the client.

- It is a **per-user** install (no administrator rights needed) and lets the
  user pick the install folder.
- The app keeps all its data in a `data/` folder under the per-user **userData**
  location (`%APPDATA%\chisel-coaching-management\data`) — **separate from the
  install folder** so auto-updates can never wipe it. electron-builder also
  uploads `latest.yml` + the installer's blockmap, which the in-app updater
  consumes.

## Data folder

All data lives in one folder (path + an **Open folder** button are in
**Settings → Data & backups**):

```
%APPDATA%\chisel-coaching-management\data\
  chisel.db        encrypted database
  keyfile.json     non-secret KDF params + lockout state
  receipts/        generated receipt PDFs
  backups/         timestamped DB backups
  exports/         report/CSV/Excel exports + import templates
  logs/            application logs
```

### Moving to another PC
Install the app on the other PC, then either copy this `data` folder across, or
use **Backup → Restore**.

> On a **new** machine, 2FA is required even if "trusted device" was set on the
> original PC — trust is bound to the machine, not the data (see
> [SECURITY.md](SECURITY.md)).

## Data path resolution

`src/main/paths.ts::resolveDataDir()`:
- **Packaged:** `%APPDATA%\chisel-coaching-management\data` (Electron `userData`).
  This is **outside** the install folder, so NSIS auto-updates — which clean and
  replace the install directory — never touch your data. (Earlier builds stored
  data next to the .exe, inside the install folder, which caused data loss on
  update; `migrateLegacyData()` copies any such old data into the new location on
  first launch.)
- **Dev:** `<project root>/data` (git-ignored).

To move data to another PC: copy the `data` folder (its path + an **Open folder**
button are in **Settings → Data & backups**), or use **Backup → Restore**.

## Backup & restore

- **Automatic backups:** timestamped copies of the encrypted DB are written to
  `data/backups/` (rotated). Configurable in Settings.
- **Manual backup/restore:** available from Settings.
- Backups are encrypted with the same key as the live DB, so keep the master
  password safe.

## Updates

See [UPDATE_MECHANISM.md](UPDATE_MECHANISM.md). Updates replace program files
only; `data/` is preserved and the app relaunches automatically.

## First run

On first launch the setup wizard collects the institute name, creates the admin
account + master password (which initializes the encrypted DB), enrolls the
first authenticator app, and shows the recovery codes.

## Status

⏳ Packaging finalized in Phase 10–11; the portable data path is live from
Phase 0/1.
