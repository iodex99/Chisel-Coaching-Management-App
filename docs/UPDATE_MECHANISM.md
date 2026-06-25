# Update Mechanism

The app self-updates from **GitHub Releases** of the private repo
`iodex99/Chisel-Coaching-Management-App` using **electron-updater** driving the
NSIS installer. UX: check → "Update available" (with size) → one click →
download with a **progress bar** → the installer swaps files and relaunches.

## In-app flow (`src/main/services/update.ts`)

Built on `electron-updater`'s `autoUpdater`:

1. **Check** — `autoUpdater.checkForUpdates()` reads `latest.yml` from the latest
   release and compares versions (semver). `checkForUpdate()` returns the latest
   version, release notes and **download size**.
2. **Download** — `autoUpdater.downloadUpdate()`. `download-progress` events are
   forwarded to the renderer (`update:status`) with percent + transferred/total
   bytes, so the UI shows a live progress bar.
3. **Install + relaunch** — `autoUpdater.quitAndInstall(true, true)` runs the
   downloaded NSIS installer **silently** and relaunches. The installer handles
   replacing a running app's files and restarting reliably (the previous custom
   file-swap could not, because Windows locks a running exe). The portable
   `data/` folder lives in the install dir and is not managed by the installer,
   so it is preserved across updates.

Why electron-updater (replaced the hand-rolled swap in 1.0.6): the manual
"copy over the running app then relaunch" approach hit `Invalid package` (asar
interception) and then silent failures / `ENOTEMPTY` from locked files. The NSIS
installer path is the battle-tested solution and also gives progress/size.

## Private-repo authentication

`electron-builder.yml` sets `publish: { provider: github, private: true }`, which
embeds `app-update.yml` in the build. At runtime the updater needs a token: a
fine-grained, **read-only** (`contents:read`, this repo only) token is injected
at **build time** by CI from the `UPDATE_READ_TOKEN` secret and exposed to
electron-updater via `process.env.GH_TOKEN`. Dev/test builds have no token and
report "Updates are only available in release builds."

> The token is embedded in the shipped binary and is therefore extractable by
> anyone holding the app — accepted for an internal single-client tool
> (read-only, single-repo, rotatable).

## Release pipeline (`.github/workflows/release.yml`)

Triggered by pushing a tag `v*`. On `windows-latest`:

```
npm ci
npm run typecheck
npm test
npm run build                              # electron-vite (bakes UPDATE_READ_TOKEN)
npx electron-builder --win --publish always  # builds NSIS + uploads installer,
                                             # latest.yml and .blockmap (GH_TOKEN)
gh release edit <tag> --draft=false        # electron-builder creates a draft
```

- `GITHUB_TOKEN` (as `GH_TOKEN`) lets electron-builder upload the release assets.
- **Versioning:** bump `package.json` `version`, commit, tag `vX.Y.Z`, push tag.
- **Code signing:** not used; Windows SmartScreen may warn on first manual
  download. An OV/EV certificate can be added later.

## Required one-time setup (maintainer)

1. Fine-grained PAT with **Contents: Read** on this repo → repo Actions secret
   `UPDATE_READ_TOKEN`.
2. Release: bump `package.json` version, commit, `git tag vX.Y.Z && git push --tags`.

> Updater bugs can't self-heal (the broken code is in the *installed* build), so
> moving onto the electron-updater mechanism required a one-time **manual**
> install of the first build that contains it (1.0.6). In-app updates work from
> there on.

## Status

✅ electron-updater (1.0.6+). Earlier custom-swap implementation removed.
