# Overhaul user handoff

[Master plan](README.md) · [D8 acceptance](d8-acceptance.md) · [Documentation audit](d9-semantic-audit.md) · [Operations](../operations.md)

The repository contains the shared desktop interface across browsing, watch,
library, Settings, account, administration, reading/recovery and embeds. The
[gallery](../../screenshots/README.md) shows inspected synthetic views. TV work
updates the signed-in browser's code approval form for the existing Tividious
protocol; it does not implement or modify a native TV application.

## Delivery state and verification

The implementation is uncommitted in this checkout at HEAD
`0f8703fd66e58be7c2001cabe55eddc091aabd04`; the original planning baseline is
`22fc2a66`. Git metadata is read-only in this workspace. Review and commit the
complete change, including new files, before producing a deployment revision.
The accepted source/evidence hashes preserve the reviewed contents independently
of that unchanged HEAD. No release tag, remote push, deployment, live upstream
submission or production configuration change was performed.

D8 records one complete frontend run of **902/902**, **300 Spectator + 137 standard
spec examples**, fresh linked normal/API-only builds, production fixtures and the
complete guarded PostgreSQL account harness. Images, gzip/request comparisons,
failed phases, native compatibility checks and exact commands remain in
[the acceptance record](d8-acceptance.md). The disposable database finished empty
with no other clients and was cleaned up. D9 checks documentation/source
consistency without starting a server or repeating the product suite.

## Build the reviewed revision

Use the complete checkout, its Git metadata, runtime directories and locked
shards. Review all tracked and untracked changes before committing; do not build
a deployment by copying only `src/` or a binary. From the committed revision:

```sh
git submodule update --init mocks
shards install --skip-postinstall --skip-executables
crystal scripts/fetch-player-dependencies.cr
crystal build src/invidious.cr --release -Dskip_videojs_download -o invidious
```

The asset fetch needs network access; the skip flag alone does not install its
pinned dependencies. Node/FFmpeg/Playwright are test tools, not a serving runtime.
Use `-Dapi_only` only for an intentionally API-only installation: the complete
browser overhaul and TV approval require a normal build. The [development guide](../development.md)
and [frontend README](../../tests/frontend/README.md) give reproducible verification
commands, including recovery fixtures and synthetic progressive/DASH/HLS media.

Keep the binary/image, `assets/`, `locales/` and `config/sql/` from the same
revision. Preserve the existing protected deployment configuration and secrets
separately. ECR templates are compiled into the binary. Relative runtime paths
require the correct installation working directory. An operator can instead
build a versioned image using the existing Dockerfile; the example compose file
has development credentials/placeholders and is not a production configuration.

## Assets and browser caches

`ASSET_COMMIT` is compiled from the most recent Git commit that changes `assets/`.
It is not a hash of uncommitted files. Serving edited assets under an unchanged
asset suffix can reuse old cached scripts. Commit the complete asset changes
before building; confirm generated page CSS/JS URLs carry that asset revision.
The static handler uses `Cache-Control: max-age=2629800` (about one month).

Deploy the matching binary/assets together and restart the process. With multiple
instances, avoid mixing revisions during activation. Purge applicable proxy/CDN
asset entries if their query-key policy could reuse an older response, then
reload a browser with cache bypass and confirm the requested versioned assets
are successful. Verify that no retired Diary/Pure/Ionicons or old full Preferences
controller URL is requested. Cached pre-upgrade HTML can still name old files;
reload it before diagnosing those requests as current-template references.

Do not clear all site data as the routine cache refresh: that can remove profile
settings and sign-in. Preserve HMAC so account browser-profile identities remain
stable. Existing guest/account preferences, sidebar/layout, captions and fallback
progress keep their ownership boundaries; sign-in does not import guest state.
The browser no longer edits density/thin/player-skin/chat-overlay options, while
native/legacy values round-trip. The four separately retired fields (`theme`, `theme_random`,
`theme_random_interval_hours`, `theme_random_next_at`) are ignored/omitted and
removed on later saves; no schema migration is needed for the
shared design. Other unknown preference fields remain preserved.

## Activation and smoke checks

The user performs activation on their host. Follow the [existing backup/upgrade
procedure](../operations.md#backup-and-upgrade): stop all writers, retain the
previous complete release/configuration and a verified PostgreSQL backup, restore
it into isolated staging, run the new migrator there and verify before production
activation. This interface work adds no new numbered SQL migration; existing
installations must still be current through the repository's migration inventory.
User JSON exports omit clips, identities and other persistent state and do not
replace a database/key backup. Keep HMAC, DeArrow and Companion keys unchanged.

Use a controlled account in staging to check the committed release:

- Browse/search/Apply/Load more/Back, channel tabs and direct pagination; check
  Light/Dark/System, keyboard focus and the expected versioned asset URLs.
- Watch progressive/adaptive/audio content through the real Companion/proxy;
  check captions, source/audio identity, Theater/tabs and opt-in mini player.
- Verify subscriptions/notifications, history/progress, owned/saved/private
  playlists and same-player clip preview without repeating an uncertain publish.
- Save separate Settings categories and check canonical persistence across reload;
  check guest/account switching and dedicated enhancement editors. Optional reads
  should fail independently of playback. Real contributions need a deliberate vote.
- Check login/session/CSRF, private cache isolation, legal/recovery pages, admin
  persistence and an iframe's explicit sign-in/verification recovery.

These are deployment-specific checks to perform, not results claimed by the local
acceptance. Actual YouTube/Companion/Cloudflare responses, reverse-proxy TLS/SSE/
cache policy, OS termination, physical fullscreen/PiP and codec support remain
outside intercepted tests. If those native clients are used, optionally check
Android account refresh/old preference values and Tividious QR/code approval
against the configured HTTPS origin. Their source and devices were not accessed.
Mobile website redesign, native app changes and native clip embeds are outside
this plan.

## Rollback

Retain the previous binary/image and its matching assets/locales/config SQL and
protected configuration. Stop all new writers before changing releases. Restore
the backed-up database to a **new empty database** and use the matching previous
release/configuration there, as described in [operations](../operations.md#restore-and-rollback).
Never run an old schema checker against the upgraded database. Preserve the new
database for reconciliation if traffic resumed; restoring a backup loses later
writes. There is no automatic down-migration.

Activate the complete previous release, restart and refresh caches for that
revision. Keep the original secrets; changing a key is not a rollback. Recheck
login, ownership/private data and media before reopening traffic. A rollback does
not recreate preference keys intentionally removed by a subsequent save; use the
protected database backup if the exact older state is required. No rollback or
remote action was executed during development.
