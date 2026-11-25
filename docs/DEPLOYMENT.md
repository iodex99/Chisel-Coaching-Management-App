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

The database key is stored in `keyfile.json` beside the database (no machine
binding), so the `data` folder is fully portable. Procedure:

1. **Close Chisel on both PCs first** — otherwise the running app re-writes the
   DB on exit and can clobber a freshly-pasted folder.
2. Copy the whole `data` folder from the old PC to a USB drive.
3. On the new PC, install Chisel and **do not complete sign-up**. On the welcome
   screen click **“Import data from another computer”** and pick the copied
   folder (this calls `app:importData`, which copies `keyfile.json` + `chisel.db`
   (+ `receipts`/`backups`) into the new PC's data dir, then the app reloads).
   Manual alternative: paste the folder into the new PC's own data path.
4. Sign in with a code from your **existing** authenticator app (or a recovery
   code) — their secrets travel inside the database. Any authenticator enrolled
   during a throw-away sign-up on the new PC is overwritten by the import.

> There is **no automatic sync** — repeat the copy whenever you want the other PC
> up to date.

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
- Each backup folder holds the database and its own `keyfile.json`, so it can
  be restored on any PC. Because the key travels with it, store backup copies
  somewhere only you can reach. A backup made by v1.0.24 or earlier asks once,
  when restored, for the master password that was in use then.

## Updates

See [UPDATE_MECHANISM.md](UPDATE_MECHANISM.md). Updates replace program files
only; `data/` is preserved and the app relaunches automatically.

## First run

On first launch the setup screen shows a QR code and collects the institute
name. Scanning it and entering the 6-digit code creates the encrypted database
with that authenticator enrolled — there is no username or password — and the
recovery codes are shown next.

## Status

⏳ Packaging finalized in Phase 10–11; the portable data path is live from
Phase 0/1.
