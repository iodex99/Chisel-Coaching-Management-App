# Update Mechanism

The app self-updates from **GitHub Releases** of the private repo
`iodex99/Chisel-Coaching-Management-App`. The UX is deliberately
non-technical: check → "Update available" → one click → done & relaunched.

## In-app flow (`src/main/services/update.ts`)

1. **Check** — `GET /repos/iodex99/Chisel-Coaching-Management-App/releases/latest`
   with an `Authorization: Bearer <token>` header (private repo). Compare the
   release tag against `app.getVersion()` using semver.
2. **Notify** — if a newer version exists, the renderer shows an "Update
   available" banner and a panel in **Settings → Updates** with the release
   notes.
3. **Download & verify** — fetch the release assets `chisel-<version>.zip` and
   `latest.json` (`{ version, url, sha256, notes, pubDate }`) into
   `data/updates/`, then verify the SHA-256.
4. **Swap & relaunch** — extract to `data/updates/staging/`, spawn a detached
   PowerShell **swap script** that waits for the app to exit, replaces the
   program files (everything **except** the `data/` folder), then launches the
   new executable. The app calls `app.quit()`.
   - The `data/` folder is never touched → **no data loss**.
   - The app boots itself afterwards → the user does nothing technical.
5. **Migrations** run on next launch, so schema changes ship safely.

## Private-repo authentication

Release assets on a private repo cannot be downloaded anonymously. A
fine-grained, **read-only** token (`contents:read`, scoped to this repo only)
is injected at **build time** by CI from the `UPDATE_READ_TOKEN` secret. It is
never committed to git, is rotatable, and grants only read access to this one
repo.

> The token is embedded in the shipped binary and is therefore extractable by
> anyone who has the app. For an internal single-client tool this is an accepted
> trade-off (read-only, single-repo, rotatable).

### Hardened alternative (documented, optional)

Keep the source private but publish **only built artifacts** (`chisel-*.zip` +
`latest.json`) to a **separate public** release-mirror repo. The client app then
needs no token at all. To switch: point the updater's API base at the public
mirror repo and have CI publish there.

## Release pipeline (`.github/workflows/release.yml`)

Triggered by pushing a tag `v*`. On `windows-latest`:

```
npm ci
npm test
npm run build                       # electron-vite build
npx electron-builder --win --dir    # produces release/win-unpacked
zip win-unpacked -> chisel-<version>.zip
compute SHA-256, write latest.json
create GitHub Release (tag = version) and upload chisel-<version>.zip + latest.json
```

- `GITHUB_TOKEN` publishes the release; `UPDATE_READ_TOKEN` is injected into the
  build for the updater.
- **Versioning:** bump `package.json` `version`, commit, tag `vX.Y.Z`, push the
  tag. The tag drives the release version.
- **Code signing:** not required for this custom (non-installer) flow. Without a
  certificate, Windows SmartScreen may warn on the first manual download only.
  An OV/EV certificate can be added later.

## Status

⏳ Implemented in Phase 10.
