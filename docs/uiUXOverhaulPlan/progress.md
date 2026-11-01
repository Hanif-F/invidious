# Decisions, progress and evidence

[Master plan](README.md) · [Coverage](coverage.md) · [Tasks](tasks.md) · [Verification](verification.md)

## Current status

[Completed repository/user handoff](user-handoff.md) · [Final requirements audit](d9-requirement-audit.md).

**D0–D9 are locally complete. Implementation was authorized on 26 October 2026 and the user approved D1’s visual direction that day. [D8 acceptance](d8-acceptance.md) retains the complete product checks; [D9 acceptance](d9-acceptance.md) records final documentation/coverage/CI/handoff. No remote deployment or native app/device work was performed.**

Baseline: commit 22fc2a66. The plan includes the agreed design decisions, all 64 ECR templates, dynamic surfaces, feature and state contracts, task dependencies, verification requirements, and documentation cleanup before and after the overhaul.

Before this implementation run, premature implementation and handbook cleanup changes had been reverted on 26 October 2026 after the user clarified the planning scope. At that planning checkpoint only this package and its tracking exception remained. The implementation authorized afterward is recorded below. Earlier implementation artifacts are not evidence of an approved or completed overhaul.

## Authoritative user decisions

- Familiar YouTube-inspired conventions, light and focused, consistency over decoration.
- Personal desktop use, 1280–1920px primary range; mobile website is unused/deferred. Keep Android API contracts.
- Preserve major features; consolidate/remove minor duplicate actions.
- Dark/Light/System; neutral surfaces and blue accent; useful icons in menus/settings/player and elsewhere.
- Normal HTML navigation plus focused JS; Popular/Trending entry experience.
- Header-owned single sidebar toggle and collapsible labeled sidebar.
- Grids for discovery, rows for search/history/playlists; explicit Load more.
- Standard watch + one tabbed right panel; remember theater mode by browser across videos/sessions.
- Automatic docking optional/off; primary player controls + Settings hierarchy; current per-field playback persistence preserved.
- Category Save/Discard, dedicated enhancement destinations.
- Notifications inside Subscriptions, no global bell.
- Panel-only replay chat; retire browser overlay.
- Same-player side-panel clip creation; compact visible comments below video.
- Keep title click-to-cycle through a simple icon; Subscribe/Save/Share/Clip visible, other actions in More.
- Playlist subtle row grip, no Move up/down; one balanced layout without Compact/reduced-image modes.
- Core channel tabs + More; no floating action text, particularly watch-page channel-setting links.
- Archive useful history/remove stale guidance; documentation pass before and after overhaul.
- Representative screen review before propagation; staged repository work, coherent release; user alone deploys/activates remotely.

## Implementation decisions and rationale

| Decision | Reason/status |
| --- | --- |
| Keep the package under docs/uiUXOverhaulPlan/ | Exact user-requested path; supersedes the earlier proposed folder name |
| Unignore plan/archive documentation directories | Existing /docs/* rule excluded new subfolders from version control |
| Keep useful current account-upgrade instructions | Operational/security material remains applicable; not every old document is stale |
| Separate historical rollout/release reports | Old measurements and deployed-state claims must not appear current |
| Fix semantics despite green link checks | Existing checks verify references/links, not actual behavior |
| Retain API preference values for removed browser options | Android/legacy/export compatibility must survive desktop simplification |
| Keyboard dragging uses the same grip | Retains keyboard access without reintroducing rejected movement buttons/commands |
| Static local SVG icon subset | Consistent useful icons without another client framework/font/network dependency |

## Historical planning evidence and limits (before implementation authorization)

| Check | Result |
| --- | --- |
| Plan saved at requested path | Master plan plus design, coverage, tasks, verification, progress and current-version audit documents |
| Scope inventory | All 64 ECR templates and the identified dynamic UI surfaces are assigned to future tasks in coverage.md |
| Current-version documentation audit | Findings and proposed corrections recorded; actual handbook cleanup is deferred to D0 |
| Updated compiler | /usr/bin/crystal 1.22.1 is available; the baseline frontend fixture renderer and its existing preference/API checks passed |
| Implementation status | Premature code and handbook edits reverted; D0–D9 not started |
| Visual approval | No overhaul design has been approved; representative screen review remains a future checkpoint |
| Remote/native verification | Not performed; deployment and Android UI changes remain outside scope |

## Continuation instructions

The new explicit user instruction authorizes D0–D9. Follow the staged dependencies, keep evidence current, and request the D1 representative visual review before broad visual propagation. Do not deploy remotely. Earlier reverted artifacts remain historical, not current implementation evidence.

## D0 — completed 26 October 2026

Reconciled the handbook with the source baseline before any interface edits. Corrected actual web occurrence reordering versus absent native reorder API, import status/partial-write behavior, migration/cache/policy coverage, gate precedence and generic configuration examples. Added current full-form draft/read-back, continuation/restoration/selection and automatic docking/layout behavior. Kept Diary/compact/thin/chat-overlay/popup descriptions accurate for the current implementation.

Archived dated rollout/security reports with rebased links and retained compatibility pointers. Consolidated root SponsorBlock guidance while preserving data attribution. Replaced the active historical screenshot collage with an explicit historical label; preserved the original images. Added archive/plan reachability and a source asset baseline in `asset-baseline.json`.

Validation: `python3 docs/tools/generate_reference.py --check` passed all seven references; `python3 docs/tools/check_docs.py` passed 48 Markdown files and 1,477 local links/anchors; `git diff --check` passed. The inventory accounts for all 64 ECR files plus the listed dynamic modules through S01–S16 and V01–V36. No deployment, upstream, media or database execution is claimed for D0.

## D1 — implementation approach

Build the new shared foundation and representative production-template fixtures behind an internal fixture context flag. The shipped runtime retains its current shell until the full migration can switch coherently. This lets the user review the actual proposed shared components before broad propagation. No public preview endpoint or second browser preference is introduced. Temporary legacy shell support must be removed at D8.

## D1 — initial candidate submission (subsequently approved)

The [visual checkpoint](visual-checkpoint.md) contains the eight representative Light/Dark screenshots and [evidence manifest](review/evidence.json). Implemented the neutral token foundation, pinned local 45-symbol Lucide subset/renderer with ISC and Feather MIT attribution, one header/sidebar shell, structured account menus/dialogs/tabs, video grid/rows, row-grip pointer/keyboard ordering, actual watch player with queue/transcript/recommendation tabs, and Appearance preview/Discard. The candidate suite is included in the normal frontend npm/CI command.

Validation on 26 October 2026:

- `CRYSTAL_CACHE_DIR=/tmp/invidious-ui-crystal-cache crystal build tests/frontend/render_fixtures.cr -Dskip_videojs_download -o /tmp/invidious-overhaul-fixture-renderer` and running that renderer passed the existing model/API/preference/parser checks and emitted all candidate fixtures. One existing `Time.monotonic` deprecation warning remains.
- `node --test tests/frontend/overhaul.test.cjs`: 12 passed, 0 failed, Chromium and Firefox; 48 standard desktop images plus 16 RTL/enlarged/forced-color images. Actual sampled token pairs meet 4.5:1 text and 3:1 meaningful-control thresholds. The same actual media element retains time/rate/volume/paused state through utility tab changes.
- `node --test --test-name-pattern='System follows live appearance|signed-in theme' tests/frontend/ui.test.cjs`: 2 passed, 0 failed. Existing runtime behavior remains compatible.
- New JavaScript syntax checks, Crystal formatting, all seven generated references, handbook links/reachability and `git diff --check` pass. Sprite IDs, trusted renderer names and pinned manifest match.

Manual inspection found and repaired player-container spacing inherited from the legacy feature sheet, current playlist navigation, long-text containment and enlarged search geometry. Browser failures exposed and repaired focus-transition timing, native form-reset timing and differing native button-drag behavior. Pointer capture now owns grip dragging; keyboard use shares the same occurrence-aware write. A failed/ambiguous move preserves displayed content, marks order unconfirmed, disables further moves and offers explicit reload rather than asserting server order or automatically retrying.

These are D1-specific checks, not completion of V01–V36. The browser responses for ordering are synthetic; real DB transactions, full feature/native parity, all other screens, normal/API-only final builds and final documentation remain required. At initial submission D1 remained pending visual review. The explicit approval recorded below completes that checkpoint and allows propagation while later behavior/verification requirements remain in force.

## D1 visual approval — 26 October 2026

The user explicitly answered **“Approve this visual direction”** to the eight-screen D1 checkpoint. D1 is complete. This approves the shared visual direction; it does not waive any later behavior, native compatibility, testing or documentation requirement. Continue D2 in dependency order and retain the coherent repository release/no remote deployment boundary.

## D2 — completed

Implemented [category ownership and validation](settings-ownership.md) in `web_preferences.cr`, raw latest-document account transactions in `Database::Users.merge_preferences`, category application/service logic, and a raw JSON guest-cookie helper. The category HTTP handlers, all nine server forms, page-memory category drafts/search and canonical read-back are connected. The separate administrator page and safe cached-form/header/timezone paths are implemented; their expanded regression checks are still running. The application-wide shell switch remains a later coherent migration step.

Verified:

- `crystal spec spec/web_preferences_spec.cr`: 10 examples passed, covering ownership, checkbox scope, invalid categories/types/ranges, null clearing, sparse array edits and unknown enhancement map keys.
- The guarded accounts harness `--settings-only` passed on a newly created empty local PostgreSQL 18 database in the disposable container `invidious-ui-overhaul-01a176a0`. It applied all 25 existing migrations, then verified raw/native/unknown preservation, another account’s isolation, transaction rollback, real row-lock concurrency, nullable values and independent position cleanup. No production/remote database was accessed. The test container is temporary and must be removed when the current database work finishes.
- `node tests/frontend/browser-storage.test.cjs`: 22 tests passed, including the two new layout/docking profile/denial cases. New keys are `watch_layout` (`standard`/`theater`) and `player_dock_enabled` (boolean). Consumers will default to standard/off; D5 has not yet changed player behavior.

Decisions: retain future keys inside SponsorBlock maps as well as top-level unknown/native keys; represent cleared nullable values explicitly even when the typed serializer omits them; use a strict category manifest rather than rebuilding whole preferences from a partial form. All serialized model fields (77 present in the default fixture plus nullable `timezone`/`default_playlist`) have an editable, dedicated or preserved-only owner.

### D2 category/UI checks and compatibility extension

The initial category HTTP run passed JSON/HTML redirect/read-back, private/no-store, CSRF and profile rejection, malformed categories, typed failed drafts, guest raw-cookie preservation, ignored admin keys, another account's isolation and native/web round trips. The initial Chromium/Firefox D2 run passed all 22 foundation/category tests, including no typing requests, category draft retention, Save/Discard, unchecked fields, duplicate-submit protection, field/read-back/session/profile failures, nine no-JavaScript forms and appended primitives. These runs precede the current expanded component/admin/legacy checks; they are not a final D2 acceptance claim.

Implemented the remaining administrator manifest/handler and transactional compatibility paths. The larger fixture run exposed render-only setup in old persistence tests; those now seed real cookies/database rows and retain their original preservation assertions. Legacy AI checkbox ownership is explicit. Known retired theme fields keep their existing cleanup, while native display/chat and future fields remain preserved. The admin harness uses only a temporary YAML and disposable test database; an already-enabled policy with unavailable deployment credentials is seeded in that test database to exercise recovery access without weakening production enablement validation.

The bounded Settings fragment navigation is deliberate: it retains category drafts within this one document, keeps real GET/HTML fallbacks, and does not intercept navigation elsewhere in the application. No draft values or identities enter durable browser state/history. Final results for the expanded checks, admin form review, normal/API-only compilation and the remaining stages are still pending.

### D2 acceptance — 26 October 2026

D2 is complete. [Evidence snapshot](review/d2-evidence.json) records working-tree source hashes, exact check scope and retained [Playback](review/d2-settings-playback-1440.png), [AI filter](review/d2-settings-ai-filter-1440.png) and [administrator](review/d2-admin-settings-1440.png) views. The D1 approved originals remain unchanged.

- Ten preference specs and 22 browser-storage cases pass.
- All 25 Chromium/Firefox desktop foundation/Settings/admin cases pass. This includes local category failure/retry, retained drafts, canonical category verification, parent-lifetime cancellation without late output, repeated appended initialization, detached/reinserted menus, multiple dialog openers and no-JavaScript category/admin forms. Text/option-label review caught and fixed the audio/codec/seek display labels.
- The full fixture generator and its existing persistence/metadata/AI/masking/playback-selection regressions pass. Persistence fixtures now seed actual cookies/rows, and raw-versus-canonical assertions respect sparse storage without dropping the value assertions.
- Guarded PostgreSQL `--settings-only` passes real row locking and CAS races, JSON/HTML/CSRF/profile/guest/native round trips, independent cleanup, and all isolated administrator file/role/confirmation/revision/environment/symlink/permission cases. Configured YAML values are authoritative when an operator/other process edited them; unrelated saves retain those values and all undeclared YAML.
- The existing full `--required-login-only` regression passes with the separated admin handler, including browser/native bootstrap, scope/CSRF isolation, whitelist and signed feeds/webhooks.
- API-only application type checking passes. Only existing `Time.monotonic` deprecation warnings remain. Full normal/API-only linking/builds and all cross-feature regressions remain D8 gates.
- No database migration was added, no production/remote state was used, and no deployment occurred. The disposable local database remains available for the subsequent guarded library/order work and must be removed when no longer needed.

D3 now starts with shared listing types and the existing explicit-search/continuation/restoration contracts. The legacy whole-form/browser shells remain transitional until their owning screen migrations replace them; category and admin routes already use the shared design.

## D3 — implementation and verification completed

Discovery/search/hashtag/channel/post families now use the approved shell. Shared typed listings cover videos, channels, playlists, hashtags and unavailable items; native thin/density fields remain preserved while these desktop pages use one layout. Search/filters/chips/sorts navigate normally, retain literal and scoped input, and distinguish actual POST privacy from the saved preference. Core channel tabs and selected More, structured community/post threads, local avatar fallbacks and explicit pagination/append controllers are implemented.

The first rerun after resuming development produced 28 passing and seven failing desktop checks. The failures identified a reintroduced header bell, an unexpected notification-response exception and an ambiguous selected-More test locator. Those were corrected; notification counts now initialize from page configuration without requiring a header node. This does not complete D4's subscription notification workflow.

Expanded checks now cover actual browse → watch → Back/reload reconstruction, invalid preference/unsafe continuation rejection, JavaScript/no-JavaScript private pagination, failed-avatar and desktop/RTL/enlarged layouts, and standalone post initial-read retry/no-JavaScript continuations. The expanded checks and final visual inspection passed; acceptance is recorded below. The approved D1 images remain unchanged.

Comment migration intentionally refreshes ten HTML projection fingerprints while retaining all ten original public JSON fingerprints. Fixture verification enforces those JSON hashes before any explicit HTML-only maintenance update. Search-query round-trip specs cover literal URL and channel/subscription scope retention. Full cross-feature/build and later watch/comment migrations remain separate gates.

### D3 acceptance

D3 is complete. The [evidence snapshot](review/d3-evidence.json) records exact commands, case names, working-tree hashes, unchanged public JSON fingerprints and 13 retained views. Representative images include [mixed search rows](review/d3-search-light-1440.png), [dark Trending](review/d3-trending-dark-1440.png), [selected channel More](review/d3-channel-more-1440.png), [community](review/d3-community-dark-1440.png), [standalone post](review/d3-post-light-1440.png), [no-JavaScript post](review/d3-post-nojs-dark-1440.png) and [enlarged RTL search](review/d3-search-dark-rtl-enlarged.png).

- All 57 Chromium/Firefox foundation/Settings/D3/admin cases pass. The matrix covers discovery grids and empty states, normal explicit filtering/sorting, literal URL and scoped searches, actual-POST privacy even with the saved setting off, server pagination, filtered-empty append, duplicate occurrences, failure/retry, Back/reload/scroll, unsafe/stale continuations, profile changes and cached-page cancellation. At the 100-page append bound, the current native Next link remains usable.
- The existing affected browse/search regressions pass 10 cases, channel/filter/comment/avatar regressions pass 10, and membership/masking interactions pass four. Tests retain their behavior while replacing retired selectors and mobile-only geometry with the agreed desktop scope. All 23 browser-storage/notification cases pass, including no-header delivery and empty/malformed subscription responses.
- Query specs pass 23 examples and preference specs pass 10. The full fixture renderer and all existing persistence/parser/cache/request-budget regressions pass without a baseline-maintenance flag. All ten original comment JSON fingerprints remain unchanged; only intentional HTML presentation snapshots changed.
- Normal and API-only application type checking pass, with four existing `Time.monotonic` deprecation warnings. Full linked builds and final cross-feature gates remain D8.
- Manual image review fixed inline playlist cover geometry, absent avatar fallbacks, invisible watched progress, missing AI replacement styling and incorrect filter/sort wording. Hashtag art now uses the neutral palette. The sprite/renderer/pinned manifest contain the same 47 symbols, with existing licenses retained. The eight approved D1 image hashes remain unchanged.

D3 migrates discovery, search, channel/post consumers and their shared primitives. Account library workflows, selection/ordering transactions and subscription refresh remain D4; full watch/Reddit/chat/enhancement workflows retain D5/D6 ownership. Attachment iframe content is stubbed in thread fixtures, so this is not an embed-player pass. No production database, upstream media, Android device or remote deployment is claimed. D4 is the next stage; the overall goal remains active and incomplete.

## D4 — implementation in progress

The temporary pause was only for device shutdown; the user clarified on 27 October 2026 that development should continue. D4 is not accepted yet. D5–D9 remain pending.

Subscriptions now have explicit view-only sort/filter choices, scoped search, a new-upload notice with deliberate refresh and browser notification permission controls. The profile lease owns SSE reconnect/cached-page cleanup without a header ticker. Manager rows use existing cached statistics; history rows retain date groups, unknown metadata and independent recording/sync choices. Selection belongs to each rendered collection, with loaded-only checks and failed selections retained.

Playlist library/contents/mix/create/edit/add/delete views now use the shared design. Owned playlists and saved references have distinct controls and consequences; saved mix links retain their seed. Failed HTML/JSON form drafts stay typed, server limits are checked, and uncertain additions/creations are not retried automatically. Playlist-item search keeps its scope, literal input and explicit filters, including POST-only private continuation. The old saved-card adapter was removed after its sole caller migrated.

Occurrence add/remove/delete operations now transact item rows and ordered indexes together, sharing the playlist lock with reordering. Owned creation serializes the existing 100-playlist quota on the account row. Title truncation retains valid UTF-8. An optional web reorder response captures canonical positions under that lock, including hidden/unloaded entries; existing callers retain the empty success response. Selection and grip writes share pending ownership. Clearing browser history now clears history and positions in one transaction, while the native history helper's existing default remains unchanged.

Initial guarded PostgreSQL checks passed ownership/CSRF/large occurrence identities, duplicates/unloaded neighbors, stale anchors, concurrent moves/additions, rollback after failed add/remove/delete, length limits, HTML/JSON draft validation, private empty-page behavior, saved-reference isolation and atomic history/position clearing. Additional quota, cached manager/feed, browser, visual and compilation checks remain pending. The fixture pass caught and fixed a too-broad timezone fingerprint: only history restoration depends on timezone/recording state. New fixtures explicitly provide the account display-name column used by real playlist views.

No deployment or production data was used. The D1 approved image originals remain unchanged. This entry records partial work and initial evidence, not stage completion.

## D4 — completed 27 October 2026

Completed subscription/filter/notification/manager, grouped history, playlist/mix/library and all playlist form workflows. Reused the approved shared shell, rows, metadata, menus, fields and on-demand selection. Added canonical occurrence reconciliation and atomic parent-locked append/remove/delete/quota operations; retained duplicates, large IDs, unloaded neighbors and native wire/privacy behavior. Ambiguous additions/creation and interrupted batches cannot silently repeat writes. History recording and position sync remain independent; clearing both rolls back atomically.

The final Chromium/Firefox suite passed 90/90 cases at desktop widths, including light/dark screen matrices and enlarged RTL forms. QoL passed 28 cases, browser storage 26, and relevant specs 26 search plus 15 history/web-preference examples. Full fixture rendering and normal/API-only type checks passed. Guarded disposable PostgreSQL runs passed library transactions/concurrency/limits, manager cache/statistics, import/feed behavior, history metadata/migration/isolation and existing ownership/private/API/embed security checks. Visual review found and fixed menu intrinsic sizing, notification permission focus in Firefox, card action alignment and readable feed sort labels. All eight D1 approval originals remain unchanged.

The [acceptance record](d4-acceptance.md) and [evidence manifest](review/d4-evidence.json) retain 26 reviewed images, exact cases and cumulative source hashes. Documentation/reference/link and whitespace checks pass. No deployment, live upstream availability, mobile-web acceptance or full linked D8 builds are claimed. Legacy watch widgets remain explicitly assigned to D5 and final retirement to D8.

Next: D5 production watch layout/player hierarchy, using the approved direction and one existing media element; D6–D9 retain their staged owners.

## D5 — in progress

Source inventory and the preservation/verification contract are recorded in [D5 player contract](d5-player-contract.md). Implementation begins with profile-scoped layout and optional docking, then the production watch structure and one Settings hierarchy using existing stream selection/refresh/diagnostic callbacks. No D5 acceptance is claimed yet.

## User-requested shutdown pause — 27 October 2026

Development is paused at the user’s explicit request to power off the device. D0–D4 are complete; D5 is in progress. The [D5 shutdown handoff](d5-handoff.md) records implemented work, validation, current browser-test failures and exact next steps. Resume when the user requests it.

## D5 — resumed implementation and runtime review, 27 October 2026

The user explicitly resumed after the shutdown pause. D5 remains in progress.
Production layout/actions and the Settings hierarchy now have direct Chromium and
Firefox tests for paused media identity, theater persistence, utility precedence,
deliberate transcript loading, profile/tab isolation, optional docking, real
fullscreen/PiP handoff, captions/appearance/retry and exact queue occurrences.
The guarded PostgreSQL account/library run passed new desktop snapshot/private
visibility/duplicate/expired-successor/default-wire checks as well as its existing
transaction/concurrency/import/feed/security checks. Normal/API-only type checks
and full fixture rendering passed (four existing monotonic warnings in each type
check; one in the fixture build).

New deterministic FFmpeg media exercises progressive VP8 sizes, portrait video,
AAC listening and decodable DASH with two H.264 renditions and three distinct
language/DRC audio tracks. Real decoding and the existing callbacks pass in both
engines. Progressive switching exposed native rate resets; a bounded source
restoration wrapper retains position/rate/volume/pause, rejects stale lifetimes
and excludes transitional rate resets from preference writes. Actual source URLs
now determine selected fallback choices; exact metadata adds codec/FPS/bitrate
without guessing duplicate audio identities. Chromium seeking fixtures must
advertise range support. This local media check does not prove live extraction,
Companion delivery, physical OS windows or device codec support.

Visual review found and repaired misplaced recommendation actions, PiP/Settings
order, native glyphs overlapping SVG icons, player menu borders, an initially
hidden panel-only chat and centered portrait sizing. Both engines pass the
light/dark 1280/1440/1920 matrix, enlarged RTL and forced-colors checks. Queue tests
also pass canonical malformed/rounded-identity rejection, ambiguous writes with
read-only recovery, cached-page reads that ignore abort, and actual end-of-media
advancement after current-entry removal. Caption HTTP failures can be reported
as empty success by Video.js 7; empty/error states now offer an explicit retry,
while unresolved loads receive a bounded honest waiting state.

The broad sequential run had 194/204 passing cases: all new D5 checks, QoL (28),
storage and stream/sync assertions passed. Its ten failures came from D1 preview
watch pages and D3 navigation into them: the nested preview wrapper loses Kemal's
header ownership and omits player assets. The wrapper has been removed and the
fixture renderer now uses production watch/template directly; rebuild and a fresh
full regression run are required before counting these gates as passed. No D5
acceptance or overall completion is claimed. D6–D9 retain their full scope.

## D5 — completed 27 October 2026

The final desktop suite passes 130/130 cases, including 40 D5 cases; final D5 also
passes separately (40/40). The affected regression run passed 217/217; final
masking/player/clip/stream/sync units pass 36/36, and the final explicit thumbnail
reveal/title cycle checks pass in both engines. Guarded PostgreSQL queue/privacy/
duplicate/default-wire and existing library/security checks, full fixture render,
normal/API-only type checks, format/reference/link/whitespace checks passed.

The [acceptance record](d5-acceptance.md) and [evidence](review/d5-evidence.json)
preserve 15 manually inspected images and 158 cumulative source hashes. All eight
original D1 approval images are unchanged. Native/API fields remain compatible;
synthetic media and native fullscreen/PiP API checks are distinguished from live
extraction, specialist hardware and physical OS windows. Two supplemental 390px
touch-only legacy tooltip checks remain outside the explicitly desktop D5 scope;
D8 owns legacy-test reconciliation. D6 utility/editor/enhancement migration,
D7 secondary/embed pages, D8 consolidation and D9 final documentation remain.

## D6 — transcript/comment checkpoint, 27 October 2026

D6 is in progress. Transcript and shared watch/post/community comment workstreams
are implemented and verified in the [utility checkpoint](d6-utilities-checkpoint.md)
and [source/case/image manifest](review/d6-utilities-evidence.json). The full desktop
suite passes 146/146, QoL 28/28 and existing transcript/avatar preservation 4/4;
normal/API-only builds and ordinary fixture verification pass. Ten original native
comment JSON fingerprints and all eight approved D1 images remain unchanged.

Next is replay chat: panel-only runtime and complete overlay code/UI retirement,
matching API validation, dedicated Settings/save contracts, raw stored-value
preservation and lifecycle/read/write verification. Same-player clip editing,
clip/library screens and the dedicated enhancement editors remain required after
chat. D6, D7–D9 and the overall goal are not complete.

## D6 — replay/chat checkpoint, 27 October 2026

Resumed after the requested device-shutdown pause. The final saved cumulative
suite passed **172/172**, QoL **28/28**, shared validators **15/15**. Guarded local
PostgreSQL settings/admin/chat checks and ordinary fixtures plus normal/API-only
type checks passed. Eleven current views were inspected; eight approved D1 images
and ten frozen native comment JSON fingerprints remain unchanged.

The [chat checkpoint](d6-chat-checkpoint.md) and [manifest](review/d6-chat-evidence.json)
record the accepted panel-only replay, shared explicit editor, per-video timing,
raw native-field preservation, failures and lifetimes. The source snapshot has
174 cumulative hashes. All checks remain local; no deployed server was accessed.

Next: implement and verify the [same-player clip contract](d6-clip-contract.md),
then the D6 enhancement editors/coexistence. D6 and D7–D9 are not complete.

## D6 — clip implementation in progress, 27 October 2026

The primary Clip action now opens an owned utility editor using the existing
player, including an initially empty utility area. Consolidated range/capture
controls, bounded preview, time/play/loop restoration and draft/publication states
are implemented. Native bounds and source refresh share the same controller;
editing positions do not enter normal progress or automatic queue advancement.
Twenty-nine targeted unit cases and fourteen real-media browser cases pass.
Secondary pages and further acceptance checks remain in progress in the
[clip contract](d6-clip-contract.md). No full clip or D6 acceptance is claimed.


## D6 clips accepted, 27 October 2026

The [clip checkpoint](d6-clips-checkpoint.md) accepts the same-player editor,
standalone/library/owner/unavailable flows and their recovery/ownership contracts.
The [manifest](review/d6-clips-evidence.json) records 198 source hashes, fifteen
inspected views, 198/198 cumulative desktop cases, 2/2 range-style checks, 29/29
units, seven validators, 28/28 QoL cases and guarded native PostgreSQL/build checks.
No deployed server was accessed. D6 enhancement editors/coexistence are the next
workstream under the [contract](d6-enhancements-contract.md); D7–D9 remain pending.


## D6 enhancements started, 28 October 2026

The AI category now renders the existing eight action fields in a page-group ×
Blocklist/Warnlist matrix with the existing Save/Discard owner. Cached status,
last-success/stale/unavailable data and attribution reuse an extracted shared
partial. Pausing retains action drafts; library/channel/queue choices still
exclude hiding. Fourteen targeted AI/shared Settings browser checks passed,
including ordinary no-JavaScript fields and zero channel lookup requests.
The compact-hint layout also passes those fourteen cases, and Light/enlarged
RTL Dark views were inspected. Samples are retained in the pending enhancement
evidence directory. This is initial enhancement work, not D6
acceptance. The [enhancement contract](d6-enhancements-contract.md) retains the
remaining channel/block/identity/contribution/runtime work.


SponsorBlock's web channel save now merges its selected channel against the
latest raw account document through the existing CAS service. Other channels,
unrelated preferences, current names and future native values survive; an
explicit reset stays scoped to its target. Seventeen focused merge/native
SponsorBlock spec examples pass. Guarded service integration checks now pass alongside the existing Settings,
admin and chat checks, and normal/API-only type checks pass. Dedicated
editor/lifetime/draft work remains pending.


## Requested shutdown pause — 28 October 2026

Paused at the user's request. The SponsorBlock channel editor and its guarded web
routes have initial verified account/guest/draft/lifetime behavior (8 browser
cases, 28 storage units and native PostgreSQL route checks). The compact global
defaults table and final scope copy were added afterward; their build was stopped
for shutdown and remains unverified. The [handoff](d6-handoff.md) records the exact
resume point and retained logs. D6 enhancements and D7–D9 remain incomplete.


## D6 resumed — 28 October 2026

Resumed at the user’s request. SponsorBlock global defaults and per-channel
editors are undergoing their final local fixture/browser review. Fixed guest
Discard after external updates, durable reads after storage clearing, and the
disposed-profile notice; ordinary account forms and denied-storage drafts are
covered. Normal/API-only type checks, 28 storage units and 17 SponsorBlock specs
pass. The expanded focused browser run passed 20 cases before the final shared
action-row/navigation presentation and two literal-map cases were added. A fresh
renderer and cumulative regression run are still required. The current source
contains 222 desktop cases; the last accepted full run remains the clip
checkpoint. No deployed server was accessed. D6 and D7–D9 remain incomplete.


## D6 SponsorBlock editors verified — 28 October 2026

The [editor checkpoint](d6-sponsorblock-editor-checkpoint.md) records the compact
global mode/color table and dedicated channel editor. Guest Discard now follows
external saved updates without replacing dirty controls; clearing storage cannot
resurrect a stale list. Failed persistence remains a draft, and disposed profiles
retain their explanation. A failed explicit saved-state read keeps uncertainty
and blocks additional writes. Shared navigation, ordinary forms and action-row
spacing are verified, including literal invalid/future native map values.

Validation: 222/222 cumulative Chromium/Firefox desktop cases, followed by 22/22
focused cases with the added failed-read-back assertion; 28/28 storage units;
17 SponsorBlock/merge spec examples; fresh fixture build/render; guarded native
PostgreSQL Settings/admin/chat/channel routes and concurrency checks. Eight
Light/Dark/enlarged RTL/error images were inspected and retained with the logs
and source hashes. Generated references were refreshed for the new handlers and
files. This verifies the editors; masking/blocks/identity/contributions and full
enhancement coexistence still prevent D6 acceptance. D7–D9 remain pending.


## D6 channel masking editor verified — 28 October 2026

The [masking checkpoint](d6-masking-editor-checkpoint.md) records shared
Settings navigation/search, explicit rules/age hints, Save/Discard/removal and
account/guest persistence. Web saves retain the original row lock and patch only
one raw rule, keeping other channels, latest names and future/native data.
Opaque records reject unsafe replacement. Entry-limit and omitted-field guards
also strengthen SponsorBlock. A cross-tab guest reload from the content masking
runtime was found and removed from Settings pages. Literal failed day strings
now use a text input with numeric input mode, preserving whitespace after an
expired session while retaining strict whole-day validation.

Validation: 242/242 cumulative desktop cases, followed by 42/42 final focused
cases with the whitespace-preserving refinement; 33 masking/SponsorBlock specs,
28 storage units, fresh fixtures, guarded PostgreSQL web/native/row-lock tests
and normal/API-only type checks. Six Light/Dark/enlarged RTL/error views were
inspected. Full run/source phase, final subset, logs/images/hashes are retained;
earlier accepted manifests stay frozen. Blocks, identity/contributions, legacy
destinations and full runtime/Back coexistence remain D6 work; D7–D9 follow.


## D6 blocked-channel manager verified — 28 October 2026

The [block-manager checkpoint](d6-blocks-checkpoint.md) records structured
Settings rows, local search, owner-scoped canonical reads, explicit Unblock,
route CSRF/profile guards and ordinary account forms. Failed and uncertain writes
retain rows; failed reads cannot claim an empty list. Callbacks respect page,
profile and removal lifetimes. Contextual block responses require a valid boolean
acknowledgement, retain visible content on unknown outcomes and offer explicit
reload rather than write retry. Confirmed Undo/autoplay and personal library
preservation remain intact. The shared notice fixes an Undo button covered by the
sidebar; long names keep stable action widths and empty notices sit outside lists.

Validation: 258/258 final cumulative desktop cases, including 16 new cases, plus
10/10 existing block/Undo/autoplay regressions. An earlier full run's Firefox
account-navigation interruption passed its two-browser isolated recheck and the
final full run; production profile behavior was unchanged. Final fixtures,
guarded PostgreSQL Settings/admin/chat/block routes and normal/API-only type
checks pass. Eight Light/Dark/enlarged RTL/error/empty/unavailable/Undo views were
inspected and retained with source/check evidence. Identity/contributions,
recognized old destinations and full runtime/Back coexistence remain D6 work;
D7–D9 follow. No deployed server or external metadata service was accessed.


## D6 DeArrow identity editor verified — 28 October 2026

The [identity checkpoint](d6-identity-editor-checkpoint.md) adds dedicated account
Settings navigation/search, readiness/configured/unavailable states and explicit
private import. Existing encryption/native services remain authoritative. An
opaque ciphertext revision plus conditional writes prevents stale web forms from
replacing newer web/native identities. Replacement requires explicit consent;
private IDs never return in HTML/JSON/metadata or application browser storage.
Failed browser drafts stay only in the live password input; ordinary failed forms
clear it and explain re-entry. Unknown imports require explicit status checking,
which cannot prove the imported value and never falsely reports Saved. Cached,
profile and detached lifetimes reject old replies; profile/disposal clears the ID.

Validation: 22/22 focused and 280/280 cumulative Chromium/Firefox desktop cases,
13 DeArrow specs, fresh guarded PostgreSQL production routes and actual conditional
concurrent imports, production fixtures and normal/API-only type checks. Six
Light/Dark/enlarged RTL/validation/uncertain/setup/unavailable views were inspected.
All earlier accepted manifests remain frozen. Contribution/voting UI, recognized
legacy entry migration and complete filtering/masking/media/Back coexistence still
prevent D6 acceptance. D7–D9 follow; no deployed server was accessed.


## Shutdown pause during D6 contributions — 28 October 2026

The user explicitly paused development for device shutdown. Contribution dialog,
loader, stylesheet/template and test-harness changes are saved but unverified.
JavaScript syntax, normal production type check, native harness compilation and
13 existing DeArrow specs pass. Fixture compilation was terminated at the pause;
new native/browser contribution behavior remains untested. The identity editor
checkpoint remains the last accepted evidence. See the shutdown section of the
[D6 handoff](d6-handoff.md) for exact resume work. No deployed server or upstream
vote service was accessed. D6 and D7–D9 remain incomplete.


## 29 October 2026 — D6 contribution/voting checkpoint

Resumed after the shutdown pause. The shared lazy contribution dialog now has a
persistent close header, explicit review/renewed consent, literal failed drafts,
locked/empty/read-failure states and scoped masking. Unknown votes lock both
directions for their target; unknown title creation locks the same trimmed
proposal across refresh/close/cached lifetimes. Rankings cannot confirm a vote.
Asset loading is bounded and retryable; stale CSS/script callbacks, completed
late modules and profile/removal/page lifetimes cannot open or update a cancelled
dialog. The actual player/media element stays alive. Web forms preserve native/
legacy callers while checking an optional browser profile and bounding the body.

Verification passed: 304 cumulative desktop cases, 24 final focused contribution
cases, 13 DeArrow specs, guarded production PostgreSQL Settings/admin/chat/channel/
identity/contribution routes, final fixtures, normal/API-only type checks and
source/documentation checks. Seven Light/Dark/enlarged RTL/no-JavaScript views were
inspected. The final focused run covers generic asset-failure feedback and stronger
masking/no-lookup/screenshot assertions added after the cumulative run. The native
binary predates only short rendering text; its backend/store/handler code is unchanged.
No deployed server, real upstream votes or physical native client was used.

See the [contribution checkpoint](d6-contributions-checkpoint.md) and
[evidence](review/d6-contributions-evidence.json). All 12 earlier evidence manifests
remain frozen. D6 still requires recognized legacy Settings entries and full
filter/mask/lookup/media/Back coexistence. D7–D9 remain subsequent stages; the
original complete goal stays active.


## 29 October 2026 — D6 Settings entry and bookmark compatibility

The default `/preferences` GET now opens Appearance; recognized historical group,
control/help/array/AI/SponsorBlock anchors lead to owning categories or dedicated
editors. Exact fields receive focus. Explicit categories win, Back replaces the
compatibility hop, and unknown/malformed fragments stay inert. Ordinary named
links remain usable without scripting or its navigation asset. Retired display
bookmarks explain the unified design without resetting their saved native values.

Retained full-form POSTs remain compatible. Their current browser controller now
attests the existing receipt through additive canonical JSON fingerprint/profile
metadata, instead of expecting retired full-form HTML. Cookie failures, foreign
profiles and malformed receipts preserve drafts; normalized arrays/maps/future
select values apply only after verification. Production checks prove actual
account and guest-cookie receipts. Category-only saves retain their own-value
comparison semantics.

Evidence: 320 cumulative desktop cases, 20 final focused cases, final guarded
PostgreSQL production routes, fixtures, normal/API-only/source/docs checks and
four inspected views. The cumulative run predates only descriptive link labels
and retained-controller JSON read-back; final focused/native/build checks cover
those refinements. All 13 earlier manifests remain frozen. See the
[entry checkpoint](d6-settings-entry-checkpoint.md) and
[evidence](review/d6-settings-entry-evidence.json). Full enhancement runtime/Back
coexistence remains required before D6 acceptance; D7–D9 follow.


## 29 October 2026 — user-requested pause after runtime groundwork

Development and the overall goal are paused at the user's explicit request.
Contribution/voting and Settings-entry checkpoints are retained. The first
coexistence increment clears session browse previews at uncertain write dispatch
and after changed canonical/saved/external guest channel rules; unchanged checks
retain previews and unrelated browser state. JavaScript syntax, 8 focused and 86
broader Settings/editor cases pass. Both new logs are retained under the pending
checks directory. This increment is not full coexistence acceptance.

Cross-document/cached-watch freshness and runtime reconfiguration remain
unimplemented. Full filtering/masking/lookup/media/Back coexistence and final D6
acceptance remain pending; D7–D9 follow. All known build/test processes completed
before the pause, and changes plus the handoff are saved. No deployed server or
real upstream contribution service was accessed. Resume only at the user's request.


## 29 October 2026 — D6 completed after runtime rollout

Resumed at the user's request. The cumulative desktop suite passed 408/408 Chromium/Firefox cases; six final
focused cases cover a later hidden download-filename masking refinement. The watch/listing owner coordinator now loads
automatically, reads canonical private state on coalesced hints/cached/foreground
returns, preserves existing media and guards unknown title/image/continuation
state. Cached source presentation updates Up next and queue titles/thumbnails
without rebuilding or reordering personal occurrences. Common optional-read Retry
works from every utility tab; proven owners keep independent queue actions.

Production PostgreSQL owner/watch/native checks, fresh fixtures and normal/API-only
type checks pass. Four masking unit cases, 24 focused restoration cases and the
complete desktop suite cover the temporary layout-class cleanup fix.
Production-derived fixture snapshots model actual committed state, replacing
retained assumptions from the earlier manual-injection tests. Light/Dark/RTL/error
views were inspected. Fourteen prior manifests remain frozen. See
[D6 acceptance](d6-acceptance.md) and [evidence](review/d6-enhancements-evidence.json).

D7–D9 remain required. The original goal stays active. No deployed server, real
upstream service or physical native client was accessed. D8 still owns broad old
test/mobile reconciliation and asset retirement; D9 owns final handbook/audit work.


## 29 October 2026 — user-requested pause after D6 acceptance

The overall goal and development are paused at the user's explicit request at
21:53 Asia/Jakarta. D6 source/check/image evidence is saved; its cumulative 408
cases and six final filename checks remain accepted. D7 templates/handlers were
inspected, with no D7 implementation changes yet. No build/test/compiler process
remains running. The task-owned disposable PostgreSQL container is idle. No
deployed server or real upstream service was accessed. Resume only when requested.


## D7 resumed — account and data implementation

The user resumed the goal on 29 October 2026. Account/login/registration/CAPTCHA,
credential/deletion/session/token/TV approval forms now use the shared shell and
ordinary POST navigation, including no-JavaScript submission and a submitter-safe
duplicate guard. The data page selects one legacy source field with an ordinary
GET and groups existing JSON/OPML downloads. Literal failed usernames, password
confidentiality, escaped callbacks/scopes, internal cancellation, session ownership
and revocation consequences are covered. The TV work stays in the web approval
page; the native TV app is unchanged.

The initial browser run passed 16/18: both failures exposed a fixture-only copied
Preferences/User context bug, including mislabeled Light/RTL views. Its fix adds
explicit theme/direction assertions; the expanded account/data run passed 24/24.
The native harness initially found old D4 library markup and TV wording assertions;
updated checks retain actual owned/saved counts and comparison intent. The next
production account/data/mobile/security/TV harness passed. Final verification of
Int64 expiry preservation and confidential parser/partial-import failures is in
progress. D7 administrative/verification/recovery, legal/error/message and embed
families, followed by D8–D9, remain required. See the [active handoff](d7-handoff.md).


### D7 account/data checkpoint — 30 October 2026

Final account/data browser checks pass **28/28** in Chromium/Firefox; focused
shared-shell/Settings regressions pass **8/8**. Fresh production account/data/
mobile/security/TV PostgreSQL checks, including real loopback TV HTTP, Int64 expiry
and confidential partially committed imports, pass. Normal/API-only type checks,
fixtures, syntax/format/reference/docs/whitespace checks pass. Five inspected
Light/Dark/enlarged RTL images and immutable source/check copies are retained in
the [checkpoint evidence](review/d7-account-data-evidence.json). The preceding
15 manifests remain frozen. D7 remaining families and D8–D9 are still required.


### D7 verification/recovery checkpoint — 30 October 2026

The final combined Chromium/Firefox run passes **52/52**, including account/data
regressions, verification/admin/API-only recovery, native confidentiality and
embedded expiry ownership. Final normal/API-only type checks and fixtures pass;
five Light/Dark/enlarged RTL views were inspected. Normal/API-only production
mock-provider harnesses pass before the final view-only refinements. The owned
local databases are idle, and the sixteen preceding evidence manifests are
unchanged. See the [checkpoint](d7-verification-checkpoint.md) for retained phases,
source/check/image evidence and limits. Legal/message/error and minimal embed
integration, then D8–D9, remain required. No deployed/upstream service was used.


### D7 reading/error checkpoint — 30 October 2026

The final combined account/data/verification/reading browser matrix passes
**64/64**, and focused shell/Settings regressions pass **8/8**. Production required-
login/real legal GET/HEAD/other-method/credential/scope/CSRF/whitelist/signed-feed/
admin checks pass before the last error presentation refinements; final normal/
API-only type and fixture/browser checks include those refinements. Privacy now
reflects actual storage/removal limits. HTML diagnostics omit private context,
failed writes do not replay, legal pages retain public reading access, and license
rows/attribution remain intact. Five final views were inspected. See the
[checkpoint](d7-reading-checkpoint.md) for evidence and limits. Minimal embed
integration, then D8–D9, remains. All seventeen earlier manifests stay frozen.


### D7 completion — 31 October 2026

The [embed checkpoint](d7-embed-checkpoint.md) completes D7. Resumed integration
passed **106/106**; final media/access/verification **46/46**; final shared forced-color
checks **4/4**; shared actual-player/runtime **98/98**; boundary **68/68**; shell/Settings **10/10**;
relevant specs **43** examples. These are distinct, overlapping phases, not a summed
suite. Fresh guarded QoL/security and required-login backend checks, normal/API-only
types, production fixtures and syntax/format/docs/reference/whitespace pass.
Seven final views were inspected. Eighteen prior manifests and 701 review files
stay unchanged. The new nineteenth manifest retains corrected and failed phases.
No deployed/upstream/native-device access occurred. D8 full regressions and
retirement now begin; D9 and overall acceptance remain required.

### D8 completion — 1 November 2026

[D8 acceptance](d8-acceptance.md) records one complete **902/902** frontend run,
300 Spectator plus 137 standard spec examples, fresh normal/API-only application
and fixture builds, the full guarded backend harness and exact final empty-schema
check. Thirty-eight files and duplicate branches were retired with source/caller
accounting; all 349 original UI cases have explicit retained/replacement mappings.
Ten final views and V01–V36 were inspected/audited. Comparable assets decrease by
86,804 gzip bytes; actual request growth/capabilities and separate vendor/icon
inventories are explicit. Failed phases, temporary-file loss, corrected fixtures,
source hashes and local/upstream/device limits remain separate. D9 begins; the
overall goal stays incomplete until its semantic handbook/coverage/CI/handoff audit.

### D9 completion — 1 November 2026

The [second semantic audit](d9-semantic-audit.md) accounts for all 30 handbook
pages and root/test/gallery/ownership instructions. Obsolete full Preferences
controller, Diary, popup preview, movement-button, chat ownership and unfinished
coordinator claims are reconciled with the accepted source. Coverage preserves
65 baseline rows and maps all 93 current ECR files, S01–S16 and 27 dynamic rows.
The [final audit](d9-requirement-audit.md) maps D0–D9, master/design requirements,
V01–V36 evidence and all nine completion criteria. The gallery reuses inspected
D8 images without changing them.

Documentation CI now runs on all push/PR changes with read-only permissions. Its
checker also validates seven active root/screenshot/test documents and explicit
HTML anchors; six isolated boundary checks and five real temporary-Git whitespace
range/fallback checks pass. All seven generated references, local links/anchors,
fences, handbook reachability and whitespace gates pass. All 545 D8 source/test
hashes and all 1,256 prior review artifact hashes are unchanged. Product tests
were not repeated for documentation changes. [D9 evidence](review/d9-evidence.json)
retains exact final commands/counts/hashes.

The [user handoff](user-handoff.md) explains uncommitted Git state, matching
binary/assets/runtime files, asset-version cache refresh, native compatibility,
staging/backup/migration and complete previous-release rollback. It distinguishes
optional real-provider/proxy/device smoke checks from completed local repository
requirements. The test database is cleaned up. TV development covers the browser
approval form for the existing protocol, not a native TV application. No required
repository implementation remains pending.
