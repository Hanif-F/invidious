# D8 requirement verification — accepted 1 November 2026

[Contract](d8-contract.md) · [Test reconciliation](d8-test-audit.md) · [Required journeys](verification.md)

This audit identifies the current implementation and direct checks for every
V01–V36 requirement. All rows are locally complete, supported by the terminal
[902/902 frontend run](review/d8-pending/checks/resumed-2026-11-01-npm-current.log),
fresh normal/API-only builds and production fixtures, and the complete guarded
backend harness. The retained complete Crystal runs have 300 Spectator and
137 standard examples, all passing. [D8 acceptance](d8-acceptance.md) and its
evidence manifest preserve exact commands, source phases and limitations.

The browser evidence comes from the [desktop suite](../../tests/frontend/overhaul.test.cjs),
[retained UI suite](../../tests/frontend/ui.test.cjs), [QoL suite](../../tests/frontend/qol.test.cjs)
and the production-template account, verification, status and embed suites in
[frontend verification](../../tests/frontend/README.md). All browser/provider/media
requests are intercepted. The backend checks use only the guarded disposable
PostgreSQL database; native device and deployed upstream behavior are outside
this repository acceptance scope.

## Journey audit

Every row is **complete within the repository scope**. Test families below
are names in the current source, rather than references to deleted controls or
historical pass totals. Each row also requires the applicable state, owner, failure
and geometry assertions inside those families.

| ID | Current implementation and direct evidence |
| --- | --- |
| V01 | Shared header/sidebar/account menu; `D1 shell menus, collapse, watch drawer and focus`, D2 shared primitives, QoL header/shortcuts; D7 account roles and ordinary forms. |
| V02 | Actual Popular/Trending templates and shared cards; `D3 discovery grids, empty states and explicit Trending controls`, literal zero/unknown view counts, failed avatars and cache-only learned metadata in the UI suite. |
| V03 | Ordinary explicit search and Apply; `D3 search submits, literal escape, filter chips and POST privacy`, mixed result scopes/rows and QoL typing-local filters; production search query specs. |
| V04 | Private POST navigation/continuations; D3 private POST appends and scoped channel search, D4 private playlist-item search and QoL filtered-empty POST pagination. Assertions reject durable query storage. |
| V05 | Shared browse append owner; D3 append failure/filtered-empty/unsafe cursor/append bound, QoL duplicate occurrences and opaque tokens; new controls initialize once. |
| V06 | GET reconstruction descriptors; D3 browse→watch→Back/reload, stale/profile descriptors and cached append cancellation, plus QoL Back/scroll. Private POST descriptors are excluded. |
| V07 | Channel primary/overflow tabs, search and reading surfaces; D3 channel tabs/selected More/About matrix, standalone post retries and independent opaque community reply cursors; native channel/clip tab checks remain. |
| V08 | Shared subscriptions and manager rows; D4 cached statistics/partial confirmed unsubscribe/membership read-back and ordinary no-JS forms; full backend subscription sorting/cache/isolation checks. |
| V09 | Subscriptions-owned new-upload refresh and browser notifications; D4 explicit subscription view choices/incoming refresh, SSE ownership/reconnect/profile tests, no global header ticker. |
| V10 | Real grouped history rows; D4 date-group merge/unknown metadata/individual and bulk removal, UI literal history search/cached titles/account-local progress; backend whole-library search/history and clearing checks. |
| V11 | Real owned/saved playlist Library and forms; D4 owned/saved library/seeds/ordinary form failures and confirmed saves, D5 watch Save; backend public/unlisted/private ownership, native, API and embed checks. |
| V12 | One pointer/keyboard row grip; D1 occurrence grip, D4 real occurrence strings/canonical positions/scroll/cancellation and invalid order; [real transaction checks](../../tests/database/playlist_order_checks.cr) verify concurrency, stale anchors and precision. |
| V13 | Shared collection selection owner; D4 loaded-only add-items/unchecked appends/partial failures, selected duplicate progress, cached interruption and uncertain additions; successful writes are not automatically repeated. |
| V14 | One existing watch media element and utility owner; D5 production layout/tabs, standard/theater profile persistence, actual decoded quality/audio/captions and paused state through layout changes. |
| V15 | Opt-in docking owner, off by default; D5 placeholder/return/dismiss/exclusions, PiP where exposed, cached/profile cleanup; QoL real decoding and bounded clip exclusion. |
| V16 | Unified Settings hierarchy and descriptor engine; D5 decoded progressive and DASH/Auto/language/DRC cases; UI codec/rank/audio identity/manual refresh/rate/volume/query cases; stream-menu units and native preference round trips. |
| V17 | Captions, chapters, storyboards, shortcuts and markers; D5 caption error/bounded retry and Advanced refresh, UI chapter/timeline/hover/keyboard/touch tests, native/shared embed input and SponsorBlock coexistence. |
| V18 | Actual occurrence-aware queue; D5 removed earlier/current/successor, precision, canonical map, cached late-read and uncertain removal cases; UI real-player retry/repeated-read/empty/end no-fallback; blocks/member/AI tests and backend queue projection. |
| V19 | Deliberately loaded transcript panel; D6 safe language/search/seek/exact line/manual following/error/cache cases, QoL current line/search ownership and D5 deliberate tab/default availability. |
| V20 | Shared compact comments and community readers; D3 independent reply cursors/failed controls, D6 actual sources/sort/continuation/error/disabled states and same-media integration; native comment JSON/parser checks remain. |
| V21 | Panel-only replay plus dedicated explicit Settings/timing editors; D6 replay cache/removal/seek/bounded DOM/manual reader/current-time/filter/error/unavailable tests, UI replay algorithms and valid display ranges. Legacy native overlay fields round-trip; browser overlay controls remain absent. |
| V22 | Same-player side editor and standalone ordinary form fallback; D6 range/playhead/Unicode/loop/validation/consent/unknown publish/late result/close restoration cases; clip-editor/session units and backend immutable publication/private sync checks. |
| V23 | Bounded native clip watch/embed and shared My Clips/channel rows; UI clip boundaries/loop/sharing/attribution/no-JS Library, D6 owner deletion/secondary states, clip-player/session units and full backend clip scopes/source preservation. |
| V24 | Global category defaults and channel inheritance editor; D6 SponsorBlock modes/colors/pause/explicit guest-account deltas/malformed and uncertain writes; runtime manual skips/markers and chapters; native sparse merge/row-lock preservation. |
| V25 | One watch title-cycle SVG and masking owner; D5 explicit masked cycles, D6 runtime masking/late DeArrow/contribution masking and disabled budgets; UI hidden metadata/poster/title/reveal, pending/missing/unavailable and cross-tab guest rules. |
| V26 | Lazy contribution dialog and dedicated private identity editor; D6 literal reviewed Unicode/renewed acknowledgements/locked options/unknown votes/no duplicate writes/asset retry/focus/role fallback; full backend consent, private-ID omission, revision and native compatibility checks. |
| V27 | Real AI category matrix/status/attribution plus cached runtime projection; UI eight surface/list choices, no-JS/Off/hide-vs-replace/library/duplicate queue/image budgets, D3 AI/progress, D6 runtime block/member/masking precedence; fixture and backend failure/lookup/concurrent native checks. |
| V28 | Real category forms and dedicated destinations; D2 local drafts/search/preview/Discard/departure/no-JS, D6 77 literal historical bookmarks and legacy entry/Back, D8 public description/feature search without reads or private playlist names. |
| V29 | Category-owned POST/HTML/JSON and validated canonical values; D2 receipt/read-back/unchecked/failure tests, D8 malformed scalar/nested maps/arrays/foreign profile and future selection baseline; full backend atomic latest-value category/native/unknown/guest/CSRF checks. |
| V30 | Profile-scoped local/session state and stale callback rejection; browser-storage/playback-sync units, D5 profile layout, D6 runtime/cached/editor lifetimes, UI guest/A/B watch+embed journey; full backend rotation/deletion/guest preservation and stale profile rejection. |
| V31 | Shared ordinary account/security forms; D7 account suite login/signup/CAPTCHA/literal failed username/no secret echo/consent/scopes/session/revoke/delete/duplicate guard; full backend credential/scope/CSRF/throttling/expiry/revocation checks. |
| V32 | Explicit import source/type/file and grouped downloads; D7 all-seven-source/data parser-failure/ordinary multipart tests; full backend import/export preservation and truthful partial failure checks. No muxing or complete-database-backup claim is introduced. |
| V33 | Browser TV code comparison/Approve/Deny, verification/admin and API-only recovery; D7 account/verification/status suites, fresh API-only recovery renderer, full guarded TV atomic redemption/CSRF/throttle/native credentials and required-login/admin persistence checks. |
| V34 | Shared reading/error/clip-unavailable pages and minimal embeds; D7 status/embed suites, actual normal/API-only fixtures and builds, backend S15/S16-style recovery/legal/privacy/source/status/escaping assertions. |
| V35 | Current eight Light/Dark representative views and enlarged RTL/forced-color images inspected; D1 and D3–D7 desktop matrices at 1280/1440/1920, long/incomplete content, focus/contrast/readable disabled states. D1 user direction approval remains authoritative. |
| V36 | Shared shell/card/menu/player owners; D8 repeated player/context action setup, all lifecycle/boundary units and actual same-media journeys; zero retired runtime dependency references, complete asset/reference accounting and final gzip/request inventories. |

## Visual inspection record

The current copies under [images](review/d8-pending/images/) include Light and Dark
browsing, watch/queue, real playlist rows and category Settings at 1440px, enlarged
RTL browsing and forced-color watch. Inspection checks the opaque header, one
navigation toggle, consistent thumbnail ratios, contained actions/grip, readable
creator metadata and selected/current states, stable utility/player controls,
category fields, footer and focus. This records local synthetic fixtures, not a
deployed-server or physical-device review. The final evidence manifest will list
the inspected filenames and hashes after the acceptance gates pass.
