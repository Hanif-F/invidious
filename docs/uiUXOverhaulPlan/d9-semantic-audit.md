# D9 semantic documentation audit

[Master plan](README.md) · [Coverage](coverage.md) · [Requirement audit](d9-requirement-audit.md) · [User handoff](user-handoff.md)

Reviewed on 1 November 2026 against the accepted D8 source and current handbook.
This is the second semantic pass required by D0/D9. It compares destinations,
controllers, persistence, failures and test instructions with implementation;
link/reference checks are separate. Pre-edit snapshots of 42 active documents and
workflows are retained under [D9 baseline](review/d9-pending/baseline/active-docs-sha256.json).
The D0 audit remains dated baseline history and is not rewritten to describe the
finished interface. Earlier stage checkpoint counts/caveats likewise remain history.

## Handbook reconciliation

Every top-level handbook page is accounted for below. A retained guide was checked
against its source/accepted production checks; retention is not an inference from
a link checker. Native client implementation details remain external contracts,
not a claim to have inspected or tested Android/TV source or devices.

| Current guide | Semantic comparison and outcome | Source / direct evidence |
| --- | --- | --- |
| [Index](../README.md) | Updated review date, shared styling/current gallery, accepted-plan context and user handoff | [Shell](../../src/invidious/views/overhaul/shell.ecr), [D8](d8-acceptance.md) |
| [Overview](../overview.md) | Replaced Diary product/asset claims; retained SSR, Companion, state and build boundaries | [Template](../../src/invidious/views/template.ecr), [startup](../../src/invidious.cr) |
| [Features](../features.md) | Corrected sidebar/home, shared modes, browser panel replay and native-only layout compatibility | [Desktop projection](../../src/invidious/frontend/desktop.cr), [D8 V01/V21/V28](d8-verification.md) |
| [Getting started](../getting-started.md) | Kept dependency/build/migrate/working-directory and development-compose setup; first use points to Settings | [Dockerfile](../../docker/Dockerfile), [Makefile](../../Makefile), [startup](../../src/invidious.cr) |
| [Architecture](../architecture.md) | Clarified request thin-mode scope; retained auth middleware, build variants, fibers and caches | [before_all](../../src/invidious/routes/before_all.cr), [routing](../../src/invidious/routing.cr) |
| [Configuration](../configuration.md) | Retained separate admin keys/YAML/environment ownership, required-login and recovery behavior; no new browser variant defaults invented | [Admin settings](../../src/invidious/admin_settings.cr), [D8 backend](d8-acceptance.md) |
| [Accounts/library](../accounts-and-library.md) | Checked ordinary security forms, subscriptions/notification lease, independent sync/history, exact occurrence grip/stale Reload and owned/saved semantics; retained current guidance | [Account routes](../../src/invidious/routes/account.cr), [library](../../assets/js/library.js), [D4](d4-acceptance.md), [D7](d7-account-data-checkpoint.md) |
| [Search/feeds](../search-and-feeds.md) | Checked explicit GET/POST scopes, private restoration boundary, channel More, opaque cursors, cache/statistics and RSS; retained | [Search](../../src/invidious/routes/search.cr), [browse](../../assets/js/browse.js), [D3 evidence](review/d3-evidence.json) |
| [Playback](../playback.md) | Removed browser overlay claim; clarified profile-local chat appearance, preserved raw native fields and unified player-style/query scope; retained source/audio/caption/progress/queue/recovery contracts | [Player Settings](../../assets/js/player-settings.js), [chat editor](../../assets/js/chat-preferences.js), [D5](d5-acceptance.md), [D6](d6-acceptance.md), [D7 embeds](d7-embed-checkpoint.md) |
| [Preferences](../preferences.md) | Removed transitional Diary/full-form-controller text; corrected search privacy, typed read-back and chat font/width ranges/ownership; native fields remain distinct | [Web manifest](../../src/invidious/web_preferences.cr), [settings](../../assets/js/settings.js), [ownership](settings-ownership.md) |
| [Frontend](../frontend.md) | Replaced movement buttons/automatic 409 refresh, whole-form preview/search and unaccepted coordinator claims with current grip/categories/canonical owner runtime | [Watch enhancements](../../assets/js/watch-enhancements.js), [owner projection](../../src/invidious/frontend/enhancement_state.cr), [D8](d8-verification.md) |
| [Shared styling](../theming.md) | Checked tokens/SVG/system modes/vendor/native compatibility; replaced D8-pending gate with accepted evidence | [Foundation](../../assets/css/foundation.css), [icon renderer](../../src/invidious/frontend/icons.cr), [D8 retirement](d8-acceptance.md) |
| [SponsorBlock](../sponsorblock.md) | Corrected category/dedicated destinations; retained modes, inheritance, opt-in/read-cache and no submission capability | [Channel editor](../../src/invidious/routes/sponsorblock_preferences.cr), [D6 editor](d6-sponsorblock-editor-checkpoint.md) |
| [Channel masking](../channel-spoilers.md) | Corrected editor destination/title icon and first-rule in-place activation; removed false no-assets/reload behavior for empty rules | [Presentation](../../src/invidious/frontend/channel_spoilers.cr), [runtime](../../assets/js/channel-spoilers.js), [D6 coexistence](d6-acceptance.md) |
| [AI filter](../ai-channel-filter.md) | Corrected category/Save and removed thin-mode browser-layout claim; retained eight actions/status, hide-vs-replace, disabled budgets and attribution | [AI form](../../src/invidious/views/overhaul/ai_filter_matrix.ecr), [D8 V27](d8-verification.md) |
| [DeArrow contributions](../dearrow-contributions.md) | Checked current More/identity destinations, review/vote and unknown-write semantics; retained confidentiality, lazy lifetime and exact compatibility guidance | [Dialog](../../assets/js/dearrow-contributions.js), [identity](../../src/invidious/routes/dearrow_contributions.cr), [D6 contribution checkpoint](d6-contributions-checkpoint.md) |
| [Native clips](../native-clips.md) | Replaced popup/second-player instructions with utility panel, selected-boundary capture, same-media restoration, draft/unknown-publish handling and standalone fallback; kept fractional native bounds/API | [Editor](../../assets/js/clip-editor.js), [session](../../assets/js/clip-session.js), [D6 clip checkpoint](d6-clips-checkpoint.md) |
| [API](../api.md) | Added supported `ui=desktop` HTML vs ordinary/native thin-mode boundary; retained JSON/scopes/CSRF/occurrences and status contracts | [API playlist handler](../../src/invidious/routes/api/v1/misc.cr), [authenticated routes](../../src/invidious/routes/api/v1/authenticated.cr), [D8 backend](d8-acceptance.md) |
| [Mobile API](../mobile-api.md) | Added overhaul compatibility/client-source boundary; checked native sparse/chat/identity/library/TV/verification contracts without changing schemas or claiming device acceptance | [Native preferences](../../src/invidious/native_preferences.cr), [mobile scopes](../../src/invidious/routes/api/v1/mobile.cr), [native round trips](../../tests/database/mobile_checks.cr) |
| [TV pairing](../tv-pairing.md) | Clarified browser approval scope; retained hashed codes, polling/atomic redemption, scopes and separate real-device acceptance | [TV routes](../../src/invidious/routes/tv_pairing.cr), [TV checks](../../tests/database/tv_pairing_checks.cr) |
| [Data import/export](../data-import-export.md) | Checked all seven source fields, CSRF-first processing, partial failures and omissions; retained portable-vs-backup distinction | [DataControl](../../src/invidious/frontend/data_control.cr), [import/export checks](../../tests/database/data_surface_checks.cr) |
| [Database](../database.md) | Checked tables/ownership/cascades, migration milestones and no new redesign migration; retained transaction/restore boundaries | [Migrations](../reference/migrations.md), [schema](../reference/schema.md), [D8 backend](d8-acceptance.md) |
| [Operations](../operations.md) | Retained all-writer maintenance/backup/restore/secrets and external proxy/upstream limits; added specific interface activation/cache handoff | [Static handler](../../src/invidious/http_server/static_assets_handler.cr), [user handoff](user-handoff.md) |
| [Security](../security.md) | Checked separate login/verification/roles/scopes/CSRF, no-store, secret/log and iframe recovery boundaries; retained current guidance | [Login gate](../../src/invidious/http_server/required_login_handler.cr), [security harness](../../tests/database/security_checks.cr), [D7 recovery](d7-verification-checkpoint.md) |
| [Bot protection](../bot-protection.md) | Checked independent gate order, API-only/admin/provider recovery, explicit retry and private native bridge; retained real-provider activation prerequisite | [Bot handler](../../src/invidious/http_server/bot_protection_handler.cr), [verification](../../assets/js/verification.js), [D7](d7-verification-checkpoint.md) |
| [Historical rollout pointer](../bot-protection-rollout.md) | Retained dated archive link and authoritative operating destinations; not a current remote result | [Archive index](../archive/README.md) |
| [Integrations](../integrations.md) | Checked fixed service/request boundaries, disabled failures, explicit contribution and Companion proxy distinction; retained attribution | [D8 V24–V27/V36](d8-verification.md), [dependency pins](../../videojs-dependencies.yml) |
| [Troubleshooting](../troubleshooting.md) | Added same-revision cache handoff and complete synthetic-media/recovery recipe; retained safe explicit failure/state checks | [Asset version](../../src/invidious.cr), [fixture/media recipe](../../tests/frontend/README.md) |
| [Development](../development.md) | Removed obsolete known spec failure and Diary layout claims; corrected full CI npm scope and added API recovery/media generation/documentation CI | [Frontend workflow](../../.github/workflows/frontend.yml), [D8 spec/build logs](d8-acceptance.md) |
| [Documentation](../documentation.md) | Replaced Diary/overlay maintenance rows; documented semantic audit, expanded checks and CI | [Checker](../tools/check_docs.py), [generator](../tools/generate_reference.py), [workflow](../../.github/workflows/documentation.yml) |

## Other active instructions and source accounting

The root README now describes the shared design and Saved playlists and points to
the current gallery/handoff. The gallery links all eight final Light/Dark screens
plus enlarged RTL/forced colors with exact accepted images, without modifying
those files. The frontend README was reconciled across all 17 declared suites,
current categories/media/editor controls, 902-case phase and physical/live limits.
Historical avatar captures remain explicitly dated. Database instructions retain
all guards/focused modes and distinguish them from the complete D8 account run.
The existing account-security procedure, root security/archive pointers,
SponsorBlock attribution and license/release history are preserved.

The ownership contract now describes current categories and server-only legacy
POST compatibility, not the retired browser controller. The design contract's
chat row matches the accepted profile-local appearance editor. Coverage corrects
misattributed AI/masking fragments and every stale D5–D8 pending row. It retains
65 baseline inventory rows (including the later identity addition) and enumerates
all **93** current templates with a surface, V IDs and direct feature evidence.
Dynamic runtime rows are reconciled separately; D8's 398-file runtime scan and
38-file retirement inventory remain frozen. Current source/API behavior is not
inferred from the names of templates alone.

## Documentation checks and limits

The new `documentation.yml` workflow runs on every push and pull request, including
doc-only changes. It needs only checkout and Python's standard library, starts no
app/database and performs no upstream request. The checker validates all handbook
Markdown plus seven active root/screenshot/test guides, local paths/fragments,
fences, handbook index reachability and all seven deterministic generated refs.
Explicit HTML anchor IDs are recognized alongside Markdown headings. Source-map
generation includes the new workflow. The workflow checks whitespace across the PR/push commit range (with first-commit fallback), rather than a clean checkout’s empty working diff. Git whitespace and new-file whitespace checks complete the local gates. No remote GitHub Actions execution is claimed.

[D9 acceptance](d9-acceptance.md) records actual final gate output and manifest
conservation. Every one of the 545 accepted D8 source/test hashes and 1,256 prior
review artifact hashes must remain unchanged; documentation/tooling changes do
not justify repeating or rewriting the accepted product evidence.
