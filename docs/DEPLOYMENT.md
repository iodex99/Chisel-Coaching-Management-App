# Deployment, Portability & Backup

## Delivery

CI (`release.yml`) produces a single **installer** — `Chisel-Coaching-Setup-<version>.exe`
— attached to the GitHub Release. Hand that one file to the client.

- It is a **per-user** install (no administrator rights needed) and lets the
  user pick the install folder.
- The app keeps all its data in a `data/` sub-folder **next to the installed
  executable** (a writable per-user location), so the whole folder remains
  copyable to a USB drive, and the in-app updater can swap program files in place
  while preserving `data/`.

The release also includes `chisel-<version>.zip` (the raw program folder) +
`latest.json`, which the in-app updater consumes — not needed for manual install.

## Portable folder model

The installed folder (or the zip) contains the executable plus a `data/`
sub-folder:

```
Chisel Coaching/
  Chisel Coaching.exe
  resources/ ...            program files (replaced on update)
  data/                     YOUR DATA (never replaced on update)
    chisel.db               encrypted database
    keyfile.json            non-secret KDF params + verifier
    receipts/               generated receipt PDFs
    backups/                timestamped DB backups
    updates/                transient update staging
    logs/                   application logs
```

### Run from a USB drive
1. Copy the whole `Chisel Coaching/` folder to the USB drive.
2. Run `Chisel Coaching.exe` from the drive on any Windows PC.
3. Log in with the master password. All data is present; the app resumes where
   it left off.

> On a **new** machine, 2FA will be required even if "trusted device" was set on
> the original PC — trust is bound to the machine, not the portable data (see
> [SECURITY.md](SECURITY.md)).

## Data path resolution

`src/main/paths.ts::resolveDataDir()`:
- **Packaged:** `<folder of the .exe>/data`.
- **Dev:** `<project root>/data` (git-ignored).

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
