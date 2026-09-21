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

## GHCR retention (2026-09-21)

`.github/workflows/ghcr-retention.yml` prunes the container package weekly
(Sunday 07:23 UTC) and on demand, keeping the 3 most recent
`main-<YYYYMMDD>-<sha>` indexes plus whatever `main` and `latest` point at.

The plan is built from the registry, not from age: every kept index is inspected
with `imagetools inspect --raw`, and its child manifests (per-architecture
images, provenance and SBOM attestations) and cosign signatures are protected
alongside it. Anything outside that set is deleted. The job aborts without
deleting if no index matches the rules or if an index cannot be inspected.

- Requires the `GHCR_CLEANUP_PAT` secret with `read:packages` and
  `delete:packages`; `GITHUB_TOKEN` cannot manage user-owned packages.
- `workflow_dispatch` defaults to `dry_run: true`; the schedule always applies.

## Retention waits for image builds (2026-09-21)

A `guard` job now skips the retention run whenever `docker-build.yml` has a run
that is not `completed`. Between pushing the per-architecture digests and
creating the index, a build's manifests are untagged and referenced by nothing,
which is exactly the delete condition — a retention run landing in that window
would delete the image being built. The weekly schedule also moved to 07:23 UTC,
about four hours after the 03:17 UTC upstream sync check and the build its
auto-merged PR triggers.

## Monthly quota reset & self refill (2026-09-21)

Internal-use wallet features layered on upstream mechanisms (system task
framework, `config.GlobalConfig` settings, `AdjustUserQuota`). All quota values
are stored in internal quota units; the admin UI converts from the site's
display currency.

- **Monthly reset**: every enabled user in a configured group has `quota` set to
  the group's configured balance once per calendar month. Implemented as a
  scheduled system task (`monthly_quota_reset`): `Enabled()` is true only while
  `monthly_reset_last_period != current YYYY-MM`, so exactly one task row is
  created per month (retries every 10 minutes after a failed run) and enabling
  the feature mid-month runs it immediately. Re-enabling within the same month is
  a no-op; clear `quota_refill_setting.monthly_reset_last_period` via
  `PUT /api/option/` to force another run. The month boundary follows the
  server/container time zone — set `TZ` (e.g. `Asia/Shanghai`) in deployment.
- **Self refill**: `GET/POST /api/user/self/refill`. While `quota < threshold`
  the user can set their balance to the configured target (idempotent; checked
  inside the row-locked transaction). Wallet page shows a card when enabled.
- Option keys (`quota_refill_setting.*`): `monthly_reset_enabled`,
  `monthly_reset_group_quota` (JSON group → quota), `monthly_reset_last_period`
  (written by the task), `self_refill_enabled`, `self_refill_threshold`,
  `self_refill_target`.
- New files: `setting/operation_setting/quota_refill_setting.go`,
  `model/quota_refill.go` (+ `_test.go`), `controller/quota_refill.go`,
  `web/src/features/wallet/hooks/use-self-refill.ts`,
  `web/src/features/wallet/components/self-refill-card.tsx`,
  `web/src/features/system-settings/billing/{quota-refill-settings-section,group-quota-visual-editor,group-quota-dialog}.tsx`
  and their `__tests__/`.
- Upstream files touched (append-only, keep small on merges):
  `model/system_task.go` (task type const), `controller/system_task_handlers.go`
  (handler registration), `model/option.go` (`validateOptionValue` hook),
  `router/api-router.go` (2 routes), `i18n/keys.go` + `i18n/locales/*.yaml`
  (1 message key), `web/src/features/system-settings/{types.ts,billing/index.tsx,billing/section-registry.tsx}`,
  `web/src/features/wallet/index.tsx`, `web/src/features/system-info/constants.ts`,
  `web/src/i18n/locales/*.json`.
