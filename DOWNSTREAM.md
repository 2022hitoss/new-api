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

## Build cache scoped per architecture (2026-09-21)

The first real GHCR build failed on amd64 with
`error writing layer blob: not_found` while exporting to the GitHub Actions
cache, after the image itself had already been pushed. Both matrix legs wrote
to the same default `type=gha` scope concurrently and evicted each other's
blobs. `.github/workflows/docker-build.yml` now uses
`scope=<arch>` on both `cache-from` and `cache-to`, plus `ignore-error=true`
so a cache export failure cannot fail a build whose image push succeeded.

## Images pushed by digest (2026-09-21)

Two builds had already produced 25 package versions in GHCR, six of them
single-architecture tags (`main-amd64`, `latest-arm64`, …) that nothing ever
pulls. `.github/workflows/docker-build.yml` now follows the upstream Docker
multi-arch pattern:

- Each architecture pushes by digest only (`push-by-digest=true`, no tags) and
  passes its digest to the manifest job through a build artifact.
- `create_manifests` builds the index once with every tag attached, so the
  registry only ever shows the tags that are meant to be pulled.
- Only the final index is signed. The per-architecture cosign signatures were
  dropped: they signed intermediate manifests nobody references by name and cost
  two extra package versions per build.

This removes the single-arch tags, not the underlying versions — the
per-architecture manifests and the provenance/SBOM attestations stay in the
registry because the index references them. Bounding total growth is the job of
the retention policy, not of this change.
