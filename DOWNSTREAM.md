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

## Global service_tier rejection (2026-09-21)

Codex CLI Fast mode sends `service_tier: "priority"` (OpenAI treats `fast` and
`priority` as the same tier). Upstream only strips `service_tier` per channel
(`RemoveDisabledFields`, channel setting `allow_service_tier`); it never tells
the client. This fork adds a global request policy that rejects such requests
with HTTP 400 `invalid_request` before a channel is selected, so no retry,
no pre-consume and no channel-health impact.

- **Check point**: top of `relay.PrepareRequestBilling` (`relay/request_billing.go`),
  reached by `controller.Relay` for Chat Completions, Responses, Responses
  compact, Claude Messages and the playground, and by the Responses WebSocket
  runner. The incoming DTO is inspected before any protocol conversion, so
  pass-through mode and Chat→Responses conversion are covered. Claude
  `speed: "fast"` is out of scope.
- **Setting**: `setting/operation_setting/service_tier_policy_setting.go`,
  section `service_tier_policy` with `reject_enabled` (default `false`) and
  `blocked_tiers` (newline separated, case-insensitive, default
  `fast\npriority`). Both keys are request-policy options
  (`model/request_policy.go` allowlist + boolean validation) and are saved
  through `PATCH /api/option/request_policy`.
- **UI**: System settings → Request policies → new "Service tier" sub-page
  (`web/src/features/system-settings/request-policies/service-tier-section.tsx`,
  registered in `section-registry.tsx`, defaults in `defaults.ts`).
- Upstream files touched (append-only): `model/request_policy.go`,
  `relay/request_billing.go`, `web/src/features/system-settings/request-policies/{defaults.ts,section-registry.tsx}`,
  `web/src/i18n/locales/*.json`, plus the corresponding existing test files.

## User usage statistics (2026-09-21)

Admin page that lists every user's consume totals for a time range (default:
the current calendar month in the browser's local time zone) and exports the
table as CSV. Sidebar entry "User Usage Statistics" in the Admin group, route
`/user-usage-stats?startTime=<ms>&endTime=<ms>`.

- **Data source**: the `logs` table on the log database (`LOG_DB`), rows with
  `type = consume` only, grouped by `user_id` with `MAX(username)` so a renamed
  user still yields one row. Sums `quota`, `prompt_tokens`, `completion_tokens`
  and counts requests. It does not depend on the data dashboard
  (`DataExportEnabled` / `quota_data`) and works with ClickHouse log databases
  because every non-aggregated column is in `GROUP BY`.
- **Endpoint**: `GET /api/data/users/usage?start_timestamp=<s>&end_timestamp=<s>`
  (admin only). Bounds are inclusive unix seconds; `0` leaves that side open;
  `end < start` is rejected. Returns `[{user_id, username, request_count,
  prompt_tokens, completion_tokens, total_tokens, quota}]` sorted by `user_id`.
- **CSV** is built in the browser from the currently displayed rows (after
  sorting and username filtering, all pages): UTF-8 BOM, CRLF, RFC 4180 quoting,
  raw numbers plus a currency-formatted cost column.
- New files: `model/user_usage_stats.go` (+ `_test.go`),
  `controller/user_usage_stats.go`,
  `web/src/routes/_authenticated/user-usage-stats/index.tsx`,
  `web/src/features/user-usage-stats/**` (api, types, `lib/{csv,time-range}.ts`,
  `hooks/use-user-usage-stats.ts`, components, `__tests__/`).
- Upstream files touched (append-only, keep small on merges):
  `router/api-router.go` (1 route), `web/src/hooks/use-sidebar-data.ts`
  (1 icon import + 1 menu item), `web/src/routeTree.gen.ts` (generated),
  `web/src/i18n/locales/*.json` (4 new keys). The page reuses
  `CompactDateTimeRangePicker` from `features/usage-logs` via a cross-feature
  import instead of moving it.

## Custom API key prefix (2026-09-21)

Admins can require every newly generated user API key to carry a fixed
segment: `sk-<prefix>-<48 random chars>` instead of `sk-<48 random chars>`.
System settings → Site & Branding → new "API key format" page.

- **Storage**: the prefix is part of the stored `tokens.key` value
  (`<prefix>-<random>`, fits the existing `varchar(128)` column), so the
  frontend keeps displaying `sk-` + key unchanged, lookups by full key keep
  working, and keys issued under an older prefix stay valid forever. Changing
  the prefix only affects keys generated afterwards. Both `POST /api/token/`
  and the registration default token use `operation_setting.GenerateTokenKey`.
- **Setting**: `setting/operation_setting/token_key_setting.go`, section
  `token_key_setting`, key `custom_prefix` (default empty = legacy shape).
  Validated in `model.validateOptionValue`: letters, digits and underscores
  only, at most 32 characters. Hyphens are rejected on purpose (see below).
  Saved through the generic `PUT /api/option/`.
- **Auth parsing change** (`middleware/auth.go`, `splitTokenChannelHint`):
  upstream split the credential on the first `-` and used the second segment
  as the admin-only channel pin (`sk-<key>-<channel id>`). The parser now takes
  the channel id from the *last* `-` and only when that segment is numeric, so
  `sk-abc`, `sk-abc-12`, `sk-team_1-abc` and `sk-team_1-abc-12` all resolve
  correctly. Behaviour change: a non-numeric trailing segment (`sk-abc-xyz`)
  is now treated as part of the key and yields 401 instead of the previous
  400 "invalid channel id".
- Upstream files touched (append-only, keep small on merges):
  `controller/token.go`, `controller/user.go` (1 line each), `model/option.go`
  (validation hook), `middleware/auth.go` (3 call sites + 1 helper),
  `middleware/auth_test.go` (1 test),
  `web/src/features/system-settings/{types.ts,site/index.tsx,site/section-registry.tsx}`,
  `web/src/i18n/locales/*.json` (8 keys).
- New files: `setting/operation_setting/token_key_setting.go` (+ `_test.go`),
  `web/src/features/system-settings/site/token-key-prefix-section.tsx`
  (+ `__tests__/`).

## Automatic upstream price sync (2026-09-24)

The upstream price sync (Model Pricing → Upstream sync) could only be run by
hand, so models newly served by a channel stayed unpriced until an admin
synced. A scheduled system task (`pricing_auto_sync`) now runs the same fetch
and applies the result.

- **Scope**: only models served by enabled channels (`abilities`, via
  `model.GetEnabledModels`). Models that exist only upstream are never imported.
- **Overwrite**: the chosen upstream price replaces the model's local price,
  including manually set prices, the same way a manual sync replaces it (fields the
  upstream does not provide, e.g. a local cache ratio, are dropped). Plugin
  billing expressions (`billing_setting.plugin_billing_expr`) are kept.
- **Sources** are ordered by priority. For each model, the first source with a
  price wins. The `37.5 / 1` placeholder that unpriced self-use deployments
  expose is skipped, as in the manual diff. Channel sources use their base URL
  and the same endpoint options as the manual dialog. The official preset
  (`-100`) and models.dev preset (`-101`) are supported.
- **Safety**: every change goes through `model.ValidateModelPricing` (invalid
  upstream entries are skipped and listed in the task result) and then
  `model.UpdateModelPricing` with the snapshot version, so a concurrent admin
  edit makes the run fail with a conflict instead of being overwritten. The next
  interval retries. A run where every source fails is marked failed.
- **Result**: each run is one system task row (System info → System tasks). It
  holds per-source status, `updated` (model → source), `invalid`, and
  `unpriced`.
- **Option keys** (`pricing_auto_sync_setting.*`): `enabled` (default
  `false`), `interval_minutes` (default 360, 10–10080), and `sources` (JSON array
  `[{id, endpoint}]`, max 20, unique ids). Values are validated in
  `model.validateOptionValue`.
- **API**: `POST /api/ratio_sync/auto/run` (root) enqueues an immediate run with
  the saved sources, even while the schedule is off. It returns 409 if a run is
  already active.
- **UI**: System settings → Billing → "Automatic Price Sync". It has a switch,
  the interval, an ordered source list (reuses `ChannelSelectorDialog` and
  `AutoGroupOrderItem`), and "Sync now".
- New files: `setting/operation_setting/pricing_auto_sync_setting.go`,
  `controller/pricing_auto_sync.go`,
  `web/src/features/system-settings/billing/pricing-auto-sync-settings-section.tsx`
  and `billing/__tests__/pricing-auto-sync-settings.test.tsx`.
- Upstream files touched: `controller/ratio_sync.go` (the per-upstream fetch
  loop moved into `fetchUpstreamPricing`, which returns results in source order.
  `FetchUpstreamRatios` behaves as before), `controller/ratio_sync_test.go`,
  `controller/system_task_handlers.go`, `model/system_task.go`, `model/option.go`,
  and `router/api-router.go` (1 route each). Also `i18n/keys.go` +
  `i18n/locales/*.yaml` (2 keys), and
  `web/src/features/system-settings/{api.ts,types.ts,billing/index.tsx,billing/section-registry.tsx}`.
  `models/upstream-ratio-sync{,-helpers}.ts(x)` changed because
  `getDefaultEndpointForChannel` moved into the helpers. Plus
  `web/src/features/system-info/constants.ts` and `web/src/i18n/locales/*.json`.
