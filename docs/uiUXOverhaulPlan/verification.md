# Verification and completion contract

[Master plan](README.md) · [Coverage](coverage.md) · [Design](design-system.md) · [Tasks](tasks.md) · [Progress](progress.md)

## Evidence rules

Evidence must match the requirement's scope. A generated screenshot is not a visual approval, a fixture pass is not live upstream playback, source compatibility is not a deployed Android check, and a documentation link checker is not a semantic audit. Record commands, revision/working-tree context, relevant output, screenshot paths and any limitations. Do not reuse historical report pass counts as current results.

Use existing deterministic production-template fixtures and real Video.js synthetic media for UI journeys; mocks must not bypass the behavior under test. Relevant database mutations run only in the existing guarded disposable harnesses. No production credentials/data/remote deployment are required or authorized.

## Desktop matrix

Chromium and Firefox at 1280×720, 1440×900 and 1920×1080. Cover Light, Dark and live System changes; long/multilingual/RTL/incomplete content; enlarged desktop text; keyboard-only use; reduced motion and forced colors where relevant. Mobile website layout/physical mobile behavior is explicitly deferred. Native contract preservation remains required.

Representative user visual checkpoint: actual shared shell + browsing, watch/utility panel, playlist rows/grip and Settings category in Light/Dark at 1440px, with fit checks at 1280/1920. Inspect each image before requesting review. The user's approval/revision response is the authoritative checkpoint evidence.

## Required journeys and failure scenarios

| ID | Journey and assertions |
| --- | --- |
| V01 | Header/sidebar across browsing/watch/Settings; one header toggle, current route, collapse persistence, drawer Escape/outside/focus, account/guest availability |
| V02 | Popular/Trending grids, region/category, supported counts including zero, incomplete metadata, failed avatar fallback and no decorative Diary assets |
| V03 | Explicit search and Apply filters, active chip removal/clear, scopes/URL-paste/literal escape; typing generates no results requests |
| V04 | Private POST query/filter/pagination paths; no query in history/session restoration; failed/empty filtered batch can continue |
| V05 | Load more failure/retry/end, opaque token preservation, no invalid occurrence deduplication, new controls initialize once, history group merging |
| V06 | Browse → Load more → watch → Back restores loaded GET results/scroll; invalid preference/profile descriptor cannot restore another view |
| V07 | All channel tabs including overflow-selected state, shorts/streams/playlist-like tabs, channel search, community/post attachments and replies |
| V08 | Subscription actions/manager sort and cached statistics, partial bulk unsubscribe, disabled/guest states; no per-channel fetch for ranking |
| V09 | New-upload refresh inside Subscriptions, SSE lease/reconnect/profile ownership and optional browser notifications without header ticker errors |
| V10 | History date groups/timezones/search/unknown data, individual/bulk removal, disabled/empty states; clearing history also clears positions |
| V11 | Create/edit/save/unsave/delete public/unlisted/private playlists; ownership and private direct/API/embed access remain intact |
| V12 | Playlist pointer drag and keyboard grip, insertion/scroll, duplicates/large occurrence IDs/unloaded neighbors; 409/network errors and concurrent/stale anchors |
| V13 | Selection toggle, loaded-only Select all, new batches unchecked, partial failure retained, no ambiguous addition retry |
| V14 | Standard/theater state across videos/sessions/profiles, tab availability/default precedence, no player replacement/restart or caption/audio loss |
| V15 | Dock off by default/opt-in, scroll placeholder, controls/dismiss/return; fullscreen/PiP/audio-only/clip editing exclusion and profile isolation |
| V16 | Actual player menus preserve quality/codec/FPS/bitrate identity, duplicate-itag language/DRC audio, Auto fallback, speed/volume persistence and query overrides |
| V17 | Captions/select/download/appearance/shortcuts, chapters/storyboards and SponsorBlock markers; errors not silently accepted as empty successful tracks |
| V18 | Queue occurrence/current/next removal and retry/end behavior; blocks/member/AI recommendations and autoplay retain existing semantics |
| V19 | Transcript language/search/seek/current line/follow; manual browsing not repeatedly overridden; language/network/empty retries |
| V20 | Comment sources/sort/reply continuation/disabled states, compact readable posts and no duplicate handlers on appended threads |
| V21 | Chat sync/seeking/current-time return/filter/offset/font/width and failure/unavailable distinction; no web overlay UI/code activation; native overlay data retained |
| V22 | Clip same-player editing, range/current-time/validation/title and public immutable copy; failed draft retained; close restores bounds/time/play state and no full-video sync pollution |
| V23 | Clip bounded watch/loop/source/attribution, owner deletion, My Clips/channel lists and source-unavailable record preservation |
| V24 | SponsorBlock eight modes/colors/master pause/inheritance/channel override/manual prompt and marker/chapters coexistence |
| V25 | DeArrow title cycles and masking with no hover/focus/tooltip/accessibility/title/notification leaks; disabled/missing/pending replacement behavior |
| V26 | DeArrow explicit submissions/votes/locked options/failure drafts and identity import; no private IDs in normal prefs/config/export, no auto write retries |
| V27 | AI master/action matrix/list status, unresolved/failed lists/lookups, hide-vs-replace and library preservation; manual blocks/member/masking precedence |
| V28 | Settings categories/search/drafts/appearance preview/Discard/unsaved navigation; all fields have an owner and old anchor/destination compatibility |
| V29 | Category POST/HTML/JSON/unchecked fields/invalid section/CSRF; transactional latest-value merge, native/unknown/unrelated preservation and durable guest verification |
| V30 | Account switches/stale callbacks/session expiry/denied storage/quota/account deletion; guest data never copied into accounts |
| V31 | Login/signup/CAPTCHA/return routes, username/password changes/session revocation, token list/revoke/authorization and account delete confirmation |
| V32 | Data source/type/file selection/import validation and existing portable formats/exports; do not imply muxing or complete database backups |
| V33 | TV code comparison/Approve/Deny, verification/admin recovery and API-only availability; ordinary personal save cannot change instance YAML |
| V34 | Errors/messages/privacy/licenses/source/attribution/version/clip unavailable and embed-specific player without app shell |
| V35 | Full visual consistency and desktop fit; icon-label alignment, no loose action links/oval piles/duplicate controls, readable contrast/focus and accurate disabled states |
| V36 | Static assets and module lifetime: no remote fonts/icons/new client runtime, no per-card metadata fetches, bounded observers, no duplicated handlers/player recreation |

## Command families

Run commands appropriate to changed behavior, then broaden for the final audit. Do not rerun broad checks unnecessarily after passing unless new changes or concerns justify it.

Documentation checks from repository root:

~~~sh
python3 docs/tools/generate_reference.py --check
python3 docs/tools/check_docs.py
git diff --check
~~~

Current frontend fixture/browser setup and its dependencies are documented in [frontend verification](../../tests/frontend/README.md); [development](../development.md) documents specs/build flags and guarded database harnesses. Use the installed local tooling when available; never fetch/change dependency versions just to fit a desired test result.

Implementation must update browser checks for retired web controls while preserving behavioral/security/native coverage. Existing mobile-specific visual assertions are not evidence for this desktop overhaul; adapt affected behavioral cases to desktop instead of deleting their underlying requirement. Normal/API-only compilation catches shared-shell assumptions. Database tests must exercise real row locking/order/security where fixtures cannot prove it.

## Asset and runtime observations

Record compressed CSS/JS/icon/font totals against baseline 22fc2a66 and representative request counts. Removing Diary fonts/art should reduce optional design payload. Any increase must have an explained capability and remain consistent with a light interface. Keep known source dimensions/lazy images, one metadata-state batch per page/return where implemented, request deduplication and bounded DOM scanning.

Do not introduce a new arbitrary byte threshold without measurements. Observe menu/tab/layout/docking and clip editor transitions with actual synthetic media to prove the same player remains alive. Keep raw upstream unavailable values unknown rather than inventing successful diagnostics.

## Completion audit

For each task, coverage entry and V01–V36, record one of: complete with direct evidence; contradicted; incomplete; unverified; blocked by a specific external dependency. Incomplete or indirect evidence is not completion. No required repository check may be omitted by relabeling it as optional.

Overall completion requires:

1. The extensive plan and contracts exist in the requested tracked directory and remain consistent with accepted decisions.
2. Stage 0 current-version documentation audit is complete before UI implementation.
3. The representative design checkpoint is reviewed by the user and any changes incorporated.
4. Every template/HTML route/dynamic surface in the matrix is implemented in the shared design with required behavior/states.
5. Explicit browser retirements are gone; native/legacy fields and APIs still round-trip correctly.
6. Relevant behavioral/visual/database/build checks directly support the requirements, with recorded limitations.
7. Legacy dependencies are removed after full reference accounting, and no hidden old UI paths remain.
8. The second documentation audit, generated/link checks, refreshed screenshots/test guidance and CI checks are complete.
9. The repository handoff explains user deployment/cache refresh/rollback and distinguishes local tests from remote/upstream smoke checks.

Remote deployment and actual Android UI work are outside this objective, not prerequisites to an otherwise verified repository handoff. Do not claim either has been performed.
