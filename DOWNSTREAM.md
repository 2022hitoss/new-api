# Downstream Customizations

This repository is a downstream fork of QuantumNous/new-api.

Local customizations will be documented here.

## CI/CD (2026-09-21)

- `.github/workflows/release.yml` — reduced to Linux amd64/arm64 only; the macOS and Windows release jobs were removed.
- `.github/workflows/docker-build.yml` — publishes to `ghcr.io/<owner>/new-api` instead of Docker Hub; authenticates with the built-in `GITHUB_TOKEN` (no `DOCKERHUB_*` secrets needed).
- Disabled in repository settings (files kept unchanged for easier upstream merges): `electron-build.yml`, `sync-release-to-gitcode.yml`, `docker-image-branch.yml`.

## Upstream sync (2026-09-21)

- `.github/workflows/sync-upstream.yml` — daily (03:17 UTC) check of the latest
  `QuantumNous/new-api` release. When the release commit is not yet an ancestor of
  `main`, it pushes a `sync/<tag>` branch at that commit and opens a PR into `main`,
  then turns on auto-merge.
- Requires the `UPSTREAM_SYNC_PAT` secret (scopes: `repo`, `workflow`). The built-in
  `GITHUB_TOKEN` cannot push upstream changes to `.github/workflows/`, and PRs it
  opens do not trigger `ci.yml`.
- Sync PRs MUST be merged with a merge commit. Squash or rebase drops the upstream
  tag commit from `main`'s history, and the workflow would reopen the PR every day.

## Image builds follow branches, not tags (2026-09-21)

This fork does not maintain its own git tags, so `.github/workflows/docker-build.yml`
is now driven by branches:

- Triggers on every push to `main`, plus `workflow_dispatch` with no inputs — the
  branch is chosen in the "Use workflow from" dropdown. The tag-push trigger and the
  required `tag` input are gone.
- Tags published per build:
  - `main` push → `main`, `main-<YYYYMMDD>-<short sha>`, `latest`
  - other branch → `<branch slug>`, `<branch slug>-<YYYYMMDD>-<short sha>`, no `latest`
  - tag push (kept working, unused today) → `<tag>`, `latest`
- A `prepare` job resolves the image name and tag list once, so both architectures
  agree on the timestamp and the manifest job reuses the same list.
