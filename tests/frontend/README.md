# Frontend verification

The fixtures render production Crystal/ECR templates without starting the app,
using PostgreSQL or contacting YouTube. Browser requests, providers and media are
intercepted locally; screenshots contain synthetic thumbnails and test video.
These tests exercise the shared interface used by production routes.

## Run

From the repository root, with Crystal, Shards, Node.js, FFmpeg and native/browser
dependencies installed:

```sh
git submodule update --init mocks
shards install --skip-postinstall --skip-executables
crystal scripts/fetch-player-dependencies.cr
crystal run tests/frontend/render_fixtures.cr -Dskip_videojs_download
crystal run tests/frontend/render_recovery_fixtures.cr -Dapi_only -Dskip_videojs_download
ffmpeg -f lavfi -i color=c=0x303a53:s=320x180:r=12 -t 4 -an -c:v libvpx -y tests/frontend/.generated/fixture.webm
ffmpeg -f lavfi -i color=c=0x303a53:s=320x180:r=12 -t 8 -an -c:v libvpx -y tests/frontend/.generated/clip-fixture.webm
node tests/frontend/generate_watch_media.cjs
npm ci --prefix tests/frontend --ignore-scripts
cd tests/frontend
npx playwright install --with-deps chromium firefox
npm test
```

The skip flag requires the fetched player assets. The media generator adds local
progressive, portrait, audio, two-quality/three-track DASH and HLS fixtures. The
API-only renderer adds recovery/login/native-bootstrap/error documents. Missing
media or stale fixtures can fail a browser run even when Node-only units pass.
`FRONTEND_BROWSERS` selects installed engines (default `chromium,firefox`). A
reduced engine selection or name filter is a focused run, not the full matrix.
For a constrained host, `npm test -- --test-concurrency=2` still runs the complete
declared suite. Screenshots under `artifacts/` require inspection; there is no
pixel-diff acceptance assertion. Generated fixtures, media and artifacts are
ignored by Git.

## Suite ownership

The `package.json` test command explicitly lists these 17 files. Commands below
assume the `tests/frontend` directory unless stated otherwise.

| Suite | Direct coverage |
| --- | --- |
| `required-login-admin.test.cjs` | Public/private instance forms, role visibility, category/admin separation, native account menu and inert historical bookmark bridge |
| `bot-protection.test.cjs` | Browser/native verification, media position/recovery, real fetch/XHR denial lifetimes and stale results across cached returns |
| `browser-storage.test.cjs` | Profile validation/migration, fallbacks, deletion, notification leases and stale response ownership |
| `channel-spoilers.test.cjs` | Inactive and batched DOM budgets without a browser |
| `playback-sync.test.cjs` | Acknowledged progress, serialization, lifecycle delivery, completion and retries |
| `clip-player.test.cjs` | Bounds, source changes and unavailable ranges |
| `clip-session.test.cjs` | Temporary same-player preview ownership, restoration and lifecycle cleanup |
| `clip-editor.test.cjs` | Timestamp parsing/formatting, defaults and range validation |
| `stream-menu.test.cjs` | Rendition grouping, codec/bitrate fallbacks, ties and audio identity |
| `ui.test.cjs` | Retained product capabilities migrated to current templates/controls, shared touch behavior, metadata and preference contracts |
| `qol.test.cjs` | Explicit navigation/filtering, Load more/Back, category saves, real-player docking and transcript following |
| `overhaul.test.cjs` | Desktop shell, categories, discovery, collections, watch, utilities, clips, dedicated editors, enhancement coexistence and repeated setup |
| `account-surfaces.test.cjs` | Ordinary account/consent/session/delete/TV and seven-source import/export forms |
| `verification-surfaces.test.cjs` | Challenge/admin/recovery forms, no-JS/API-only paths, confidentiality and cached/late callbacks |
| `status-surfaces.test.cjs` | Privacy/licenses/messages/errors, no-JS reading, safe reports, read-only recovery and vendor/LibreJS attribution |
| `embed-surfaces.test.cjs` | Actual shared player, progressive/audio/DASH/HLS decode, masking, captions, iframe geometry and private recovery |
| `embed-lifecycle.test.cjs` | Next-item ownership, exact decimal cursors, duplicate series, explicit read retry and cached/profile/disposal callbacks |

The full npm command is also used by
[frontend CI](../../.github/workflows/frontend.yml); it does not run every database
harness. [Documentation CI](../../.github/workflows/documentation.yml) needs no app.

## Desktop QoL interactions

The desktop matrix uses Chromium/Firefox at 1280×720, 1440×900 and 1920×1080,
Light/Dark/System, RTL/enlarged text, forced colors, focus, reduced motion and
long/incomplete content. Inspect generated screenshots alongside behavioral
results; generating a screenshot does not constitute review.
Mobile website redesign is deferred; existing touch/media/embed compatibility
checks remain in the retained suite.

Shell checks cover one sidebar toggle, profile collapse/watch drawer, role-aware
navigation, contained menus and keyboard help. Discovery checks use production
feeds/search/channel/post templates: explicit Apply, mixed rows/grids, core tabs
plus More, failed avatars, safe metadata, independent opaque reply cursors and
explicit read retry. Typing performs no result requests. GET Back/reload restores
bounded descriptors/scroll; private POST queries/HTML/media never enter that store.
Filtered-empty batches retain continuation and repeated videos remain occurrences.

Library checks cover cached subscription statistics, incoming new-upload notices
with explicit Refresh, notification permission/lease, loaded-only selection,
unselected appended rows, partial confirmed writes and ambiguous additions.
History merges date groups and retains unknown metadata. Owned/saved playlists
keep distinct semantics. The single row grip supports pointer/keyboard ordering,
scroll/cancel and exact decimal occurrence IDs; stale order offers Reload.
Real ownership/CSRF/transactions/concurrency are checked separately in the guarded
[account harness](../database/README.md), including `--qol-only` on an empty
`invidious_accounts_test` database.

## Settings, visibility and enhancements

Category checks cover local metadata/description/options search without private
playlist names, bounded in-memory drafts, Save/Discard, departure warnings and
ordinary no-JS forms. Saved requires valid canonical keys/types/profile and an
independent read-back; malformed/foreign/unconfirmed results retain drafts.
Legacy full-form POST/native compatibility runs in the fixture/backend harnesses;
the retired full-form browser controller and Diary UI are not current test targets.

Original-title, seek interval and preferred-audio fixtures cover defaults, strict
native validation, guest/account/JSON/YAML/export/import, older omitted fields,
query precedence and source identity. Seek checks include all four intervals,
0.5×/2× timeline jumps and shared touch/media-key behavior. Audio checks preserve
language/original/DRC identity with duplicate itags, fallback and buffer refresh.
Codec Auto still considers all playable renditions; manual menus abbreviate large
resolution/FPS groups. Synthetic tracks do not prove physical codec support.

Masking checks cover upload-age/null/unknown dates, guest cross-tab activation,
first-rule runtime updates, title/poster/thumbnail reveals, safe auxiliary labels,
no hidden hover-preview leak, pending/failed DeArrow and dynamic duplicates.
Inactive rules cause no masking scans/date reads. `channel-spoilers.test.cjs`
checks a batch of 1,000 nested insertions; `SPOILER_BASELINE_SCRIPT` optionally
selects an old script for a before/after budget comparison, not a runtime feature.

AI checks cover the master and eight actions, local list/status/fake-resolution
fixtures, converter precedence, overlap rules, disabled lookup budgets and
replacement-only library/channel/queues. Replacement images make no original
thumbnail request; hidden recommendations cannot become autoplay targets.
Manual blocking, member visibility and masking remain independent. Block/Undo
checks use canonical before/after owner DTOs and preserve personal occurrences.
Public API JSON stays unpersonalized; native sparse patches retain their scopes.

SponsorBlock checks cover eight modes/colors, master pause without lost choices,
channel inheritance/reset, literal native/future values, durable guest saves,
ambiguous writes and explicit saved-state reads. Runtime checks cover markers,
manual Enter/focus guards, dismissed/replayed segments, combined chapters and
one automatic skip per loaded player. Disabled lookups stay disabled.

DeArrow checks cover viewport-lazy reads, explicit title cycling without hover
reveal, safe text and failure fallback. Contributions load separately and require
explicit vote or reviewed Unicode proposal with renewed guideline acknowledgements.
Unknown outcomes block duplicate writes for that page lifetime. Dedicated identity
imports test conditional revisions, secret omission and native/account isolation.
All contribution writes are intercepted; no real upstream vote is sent.

## Account and security forms

Account tests cover ordinary login/signup and optional CAPTCHA, literal failed
usernames without password echoes, consent scopes/callbacks/full-width expiry,
private explicit token results, revocation, deletion and TV code comparison with
Approve/Deny. The optional duplicate-submit guard resets on cached return and
never stores credentials or retries writes. Data tests cover all seven import
sources, normal GET source selection, CSRF-first multipart uploads, grouped
exports and truthful partial-import failure guidance. No-JS forms carry the same
successful controls. Production scopes, roles, CSRF, account rotation/deletion,
TV redemption and import behavior run in the guarded database harness.

Verification tests use mocked providers, localized explicit Retry, late callback
rejection and private native bridge fields. Reading/error tests preserve legal
access, script-free embedded failures, escaped text, confidential reports and
no write replay. These do not establish live provider availability or deployment
proxy policy.

## Playback sync

Browser profiles use `iv:browser:v2:<opaque HMAC or guest>:<setting>`. Legacy
persistent values migrate only into guest state; login/logout never import them
into accounts. Logout preserves profiles and deletion purges only its account.
Denied/full storage reports failed durability. The guest → A → guest → B → A
journey covers captions, speed and watch/embed restoration. Keep HMAC stable.
Volume defaults to 100% per profile, mute is temporary, coarse-pointer sound uses
the device; guest speed uses PREFS and account speed uses CSRF-protected PATCH.

Progress units cover resume at 8:12, continued playback, acknowledged versus
failed writes, serialized ordinary requests, lifecycle delivery and the unchanged
15-second interval. Browser checks cover completion/seek-back and beacon fallback.
Thumbnail bars use one account snapshot per page (refreshed on return), retain
duplicate rows and unknown durations, and never import another profile's fallback.
Clearing history and disabling sync have their own production transaction checks.

Manual device check: resume at 8:12, play several minutes, background Firefox on
Android, let the OS unload it and reopen. Compare with the last acknowledged
progress request. Simulated lifecycle events cannot prove delivery after actual
OS process/network termination.

## Manual chapters

Chapters come from labeled description timestamps, with two distinct valid entries;
no required zero start or ten-second sections. Automatic chapters/comment links
do not supply them. Tests cover SponsorBlock/tick/hover coexistence, duration
changes, seeking, fullscreen/embed and existing touch scrubbing. Storyboard and
caption parser/route harnesses use synthetic upstream data. Caption errors and
unresolved loads expose bounded explicit retry. Stats for nerds is opt-in under
Settings → Advanced; its allowlisted Copy diagnostics performs no upload.

## Native clips

The side editor uses the existing watch player, with range handles, selected-boundary
capture, literal timestamp/title drafts, 5–120-second bounds, preview looping and
restoration of playhead/pause/loop/prior clip bounds. Preview excludes full-video
progress, history/completion, queue advancement and docking. Tests cover unknown
publication, one-attempt writes, profile/cache/disposal ownership, direct ordinary
forms, fallback assets, guest return, public/owner/library/unavailable states and
fractional native playback bounds. Published clips are immutable. No native clip
embed, extraction, federation or import/export is added. See the [clip guide](../../docs/native-clips.md).

## Embedded player surfaces

The real shared player is tested at desktop and 640×360 iframe sizes, including
Light/Dark/enlarged RTL, keyboard Settings, captions/speed, decoded synthetic
progressive/audio/DASH/HLS, buffer refresh, portrait/masked content and no-JS fallback.
Layout/tab/Settings changes retain media identity. Private iframe media failures
produce one local HEAD health probe and explicit new-window sign-in/verification,
retaining position/occurrence without reloading metadata or retrying writes.
Stale/unrelated denials cannot interrupt a returned page. Next-item units retain
exact large cursors/duplicate series and cancel late work. Actual private playlist
visibility/redirects are verified by the guarded backend, not browser stubs.

## Evidence, assets and limits

The UI asset inventory test writes `artifacts/ui-asset-report.json` with current
first-party CSS/JS file sizes and gzip sizes at level 9. Icons/fonts and required
vendor player assets have separate totals and inventories. These are file sums,
not per-page transfer, latency or deployed-server measurements. To compare
revisions, generate a report from each and measure representative request counts
alongside capability changes; there is no fixed byte threshold.

Historical parser fixtures remain local reduced records. The 2026-10-05 playlist
capture exposed 49 avatar-bearing cards previously ignored by extraction; its
reduced fixture retains two identities. The same day's `/next` observation had
26 cards, of which 25 had associated avatars and one ambiguous collaboration was
left unassigned. Current tests reuse those fixtures and make no fresh live call.
Avatar failure tests retain deterministic Unicode placeholders and existing
cache/request budgets. `UPDATE_FRONTEND_HTML_BASELINES=1` is an intentional
maintenance switch that refreshes HTML hashes only after original JSON hashes
pass; normal fixture generation does not rewrite the public JSON baseline.

Node/browser fixtures do not prove deployed TLS/cache/proxy policy, live YouTube,
Companion, Cloudflare, physical fullscreen/PiP, codec decoding or native apps.
PiP is tested only where exposed, and unsupported browsers retain their fallback
controls. WebKit is outside the declared default suite. Mobile website redesign
and real Android/iOS/TV acceptance are outside this suite. [Operations](../../docs/operations.md)
describes deployment smoke checks, cache refresh and rollback.
