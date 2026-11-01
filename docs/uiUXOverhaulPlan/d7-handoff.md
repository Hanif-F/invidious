# D7 implementation handoff — completed

## Final state — 31 October 2026

D7 is locally accepted in [D7 acceptance](d7-acceptance.md), including the new
[embed checkpoint](d7-embed-checkpoint.md). D8 is active; continue from
[d8-handoff.md](d8-handoff.md). The earlier phase notes below are historical.
Resumed final-source checks and failures are retained in the nineteenth
[manifest](review/d7-embed-evidence.json); overlapping phases are not summed.
No deployed/upstream/native-device access occurred. Goal remains ACTIVE/incomplete.

## Latest state — 30 October 2026

Goal ACTIVE, D0–D6 accepted. D7 account/data, verification/recovery and S16 reading/errors accepted/frozen (18 total manifests). S15 embeds IN PROGRESS, not accepted. D8/D9 remain.
Current source: shared standalone embed + UI/coordinator; cancellation/epoch-owned next handler; honest manual continuation retry; source/header/JSON/locale escapes; real link to watch preserving context/time/current playback choices; iframe initial401 readable new-window login. Login-failure marker and local HEAD health probe distinguish expired instance login without bot pass; no new endpoint/schema. Access/controller/player lifetime prevents stale media, queued speed writes, keyboard callbacks, source reset and position replays while retaining pagehide beacons. HLS opaque-query delimiter fixed, hostile caption labels escaped. Source/metadata only local; no deployed/upstream service/native app touched. No subagents.
Checks so far (phase boundaries, don't add overlapping counts): controller8/8; actual playback unit12/12; initial real media10/12 then focused DASH/audio2/2 after readiness/truthful-menu assertion fix; initial production required-login/iframe pass before marker refinement; verification/access+unit/lifecycle44/44; shared D5/D1 player/D6 runtime98/98 before final compiled markup/last JS refinements. Current embed suite18 cases pending with private iframe/HLS/hostile labels.
Build4 passed, render4 FAILED at hostile-caption fixture XML XPath //video/track; corrected to //track (browser DOM still separately checked). Build5 passed but compiled old fixture assertion; don't render it. Must build6 and fully render. Current partial .generated has only new Light S15 through portrait; do not run full18 until new render.
Completed sessions: normal app final88176, backend final13606, fixture5 27351, shared runtime92428, access44 1774, API-only2 57742 (logs pass). Need exact source final normal/API types after last markup. Renderer build6 not yet started. Backend fresh2 needed after new URI-preservation assertion in security_checks.cr.
Owned PG container invidious-ui-overhaul-01a176a0 id efeb80fcb034b655dac0542a24a10ed59df47f2e0f759bd1960d72d53ba52180; codex.task=01a176a0-bf7a-71b0-af8d-2955647ae8f0; 127.0.0.1:32768 only. Account db24 tables/idle after initial S15 gate; bot db6/idle. Exact /tmp/invidious-d7-reset-db.py guards before account reset; never reset bot just for account tests. Final2 accounts harness should run --required-login-only and --qol-only with guarded24→0 reset each, proving initial/frame access + private playlist/opaque query/ownership separately. Fresh final guard required.
Binaries: /tmp/invidious-overhaul-embed-renderer-final = build4 (old XPath), -renderer-complete=build5 (also old XPath). -embed-accounts-final = first final backend, before URI test update. Source6/fresh2 outputs should use new distinct filenames. Don't run renderer while browser suite reads .generated. Node tests require escalation; sandbox may count only filename as1. Inspect TAP totals.
Next: build6/render; run full18+8 lifecycle+12 sync+6bot/access or coherent combined final; inspect screenshots Light/Dark/RTL/forced colors; final98 source/watch/runtime rerun after new compiled markup; source/caption/clip/browser regressions as appropriate; final normal/API compile, backend gate/QoL; syntax/format/doc refs/hashes; D7 acceptance only after all required pieces. Keep eighteen earlier manifests and snapshots unchanged. D8 audits full suite, legacy tests7 failures, obsolete assets and player.js duplicate-script/global initialization robustness; no actual product path currently reexecutes player.js.


## Earlier phase notes

The user resumed the complete overhaul goal on 29 October 2026. D0–D6 remain
accepted. D7 account/data work is locally verified; D7 as a
whole and D8–D9 remain required. Follow the [D7 contract](d7-contract.md).

Account/login/signup/deletion/session/token-consent/TV templates now use shared
forms and shell. Security POSTs remain ordinary navigation with no-JavaScript
fallback; optional duplicate-submit locking preserves fields and chosen submitter.
Rename failures keep bounded literal usernames, passwords stay empty, deletion
failures keep their confirmation form. Session credentials are hidden in required
POST fields instead of visible rows/URLs; legacy query revocation is retained.
Browser authorization escapes scopes and exact callback values, Cancel is internal,
and malformed/executable callbacks fail before issuance while custom protocols
remain. Cookie API consent shares the account shell; bearer JSON behavior is
unchanged. Account pages omit browse/runtime/SSE/timezone consumers. Source-selected data
forms use exactly one of the seven existing multipart names and ordinary GET
source choice; grouped JSON/OPML exports retain existing scope. Known format
rejections retain 415 and the source form; other import exceptions retain 500,
conceal uploaded contents and explain partial writes. Browser approval now
preserves the full native Int64 expiration through GET/POST and cookie API consent.
The TV work is only the Invidious web approval page and compatibility tests; no
native TV application repository/source has been changed.

The account/data checkpoint is now verified: final Chromium/Firefox 28/28,
focused shell/Settings 8/8, fresh production account/data/mobile/security/TV
PostgreSQL checks, normal/API-only type checks, fixtures and format/docs checks
pass. See [checkpoint](d7-account-data-checkpoint.md) and
[evidence](review/d7-account-data-evidence.json). Earlier failures and their fixes
are retained. Final DB guard is 24 public tables and zero other connections.

The fifteen earlier manifests remain frozen; the account/data record is now the sixteenth. Its retained sources/logs/images must also remain frozen. Current temporary hash snapshot:
/tmp/invidious-d7-historical-manifests.json. New evidence uses D7 names only.
Current disposable database container was recreated after shutdown: name
invidious-ui-overhaul-01a176a0, id
efeb80fcb034b655dac0542a24a10ed59df47f2e0f759bd1960d72d53ba52180,
label codex.task=01a176a0-bf7a-71b0-af8d-2955647ae8f0,
127.0.0.1:32768 only, invidious_accounts_test, dummy password overhaul-test-only.
Revalidate identity/label/running/actual binding and database/table/idle guards
immediately before any reset. Do not use the old D6 container id. All activity
remains local, synthetic and disposable; no deployed/upstream service accessed.

Next: implement administrative/verification/recovery, legal/messages/errors and
minimal embeds with shared media controls. Account/data implementation is verified.
D7 acceptance waits for all families. D8 full regressions/consolidation and D9
semantic handbook/audit/handoff follow afterward. No subagents are authorized.


Verification/recovery work has now started after freezing that checkpoint.
verification.ecr, admin/bot_protection.ecr and verification.css now use shared
Foundation tokens and standalone labeled forms; the existing fixture gets an
explicit request context. These new changes are not yet validated or accepted.
Next add their localized words and finish controller/recovery/error states, then
run production mock-provider/guarded policy/API-only and browser/visual checks.


The verification controller now has localized feedback, idempotent startup and
pagehide/generation/paused-return guards; stale passes cannot reach the native
bridge, and cached return waits for deliberate Retry. Admin missing-CSRF responses
now retain 403, the checkbox/duration draft and fresh form without changing policy.
New verification_surface_checks.cr fixtures and verification-surfaces.test.cjs
cover primary standalone layouts/ordinary forms/native bridge/retries/cached
returns. Builds pass; fixture render and initial tests are running. Remaining
middleware/dynamic iframe recovery and role/error styling are still to implement.

An additional owned database, invidious_bot_protection_test, was created in the
same exact container. Its initial guard is 0 public tables and 0 other connections.
The production bot-protection harness now refuses a nonempty schema before its
reset (the read-policy restart branch remains read-only). Never reset the account
schema just to test bot protection. Check the current process/log status before
rerunning either harness. Verification artifacts use /tmp/invidious-d7-verification-*
and new tests/frontend/artifacts/d7-verification outputs; the sixteenth frozen
account/data evidence and all older records must stay unchanged.

The initial verification mock-provider/role/CSRF/policy/restart harness passed
before the later iframe recovery markup refinement. Server-generated blocked
embed HTML now uses Foundation/verification styling with a self-only style CSP
(no scripts), no-referrer and an explicit new-window verification action. Dynamic
bot-protection.js recovery uses the same structured panel and an idempotent
configuration-node guard. Those later changes still need fresh build/backend/
browser checks, plus recovery-role errors and remaining standalone/embed families.


Initial verification browser run passed the four retained protocol tests, then
stalled in the new no-JavaScript RTL geometry case at its text-scaling helper.
The task-owned runner/worker were stopped after exact-command checks. Test-only
RTL scaling now appends CSS to the intercepted Foundation response instead of
calling addStyleTag in a script-disabled page. The new full matrix must be rerun;
no acceptance is inferred from the initial partial output.

The corrected primary verification browser run passed 16/16 (four retained
protocol cases plus twelve new Chromium/Firefox cases). It predates later minimal
API-only shell and truthful combined-login/disabled copy refinements. The new
API-only templated default now uses the standalone shell; browser recovery login
has its duplicate guard, hides the unavailable signup link and uses admin Settings
as its default return while keeping explicit safe return paths. Public verification
hides unavailable API-only Privacy navigation and has truthful disabled/login-gate
copy. These later changes require fresh normal/API-only builds and a dedicated
API-only rendered/registered-route check; do not claim them accepted yet.


The dedicated API-only recovery renderer now builds/runs successfully:
tests/frontend/render_recovery_fixtures.cr with -Dapi_only writes four minimal
login/disabled-native fixtures, verifies no unavailable sidebar/signup/Privacy
links and the admin-Settings default return. Normal/API-only type checks pass
before the later standalone-notice helper extraction. New API-only browser cases
and CI fixture-generation wiring are added, not yet rerun. Bot-protection harness
now also performs a real ordinary recovery sign-in using synthetic seeded bcrypt
credentials and checks return/session/admin access; API-only builds assert minimal
navigation and valid default destination. New normal/API-only backend and normal
fixture builds are in progress; check their logs/processes before rerunning.

The new Frontend::Standalone.notice helper centralizes early blocked-iframe and
non-admin recovery HTML without policy/provider/identity reads. It escapes text,
uses allowlisted theme/escaped locale and supplies a CSRF sign-out form for the
wrong signed-in account. Server iframe CSP still permits only self styles and no
scripts. This helper and final API-only refinements remain unaccepted until fresh
backend/browser/type/visual checks. Global main-shell theme/locale interpolation
and all remaining S16 error/legal pages still need the D7/D8 audit.

Normal standalone fixtures now additionally cover blocked iframe notices and
non-admin denial/sign-out without exposing policy controls. The new test source
has API-only login/native bootstrap cases and those notices in the no-JavaScript
Light/Dark/RTL matrix. These additions still require a fresh normal renderer build
(the in-progress renderer started before these last fixture additions).

Dynamic embedded recovery now pauses even at zero/unknown position and disposes
the existing player before replacing the document, preventing late ready/source
work from resuming detached media. A new retained protocol case verifies exactly
one owner/status read, one pause/disposal and no replacement player after duplicate
setup. This JavaScript/test refinement is included in the next browser run, not
the earlier 16-case result.

Final controller boundary work adds strict completion-response shape/local-return
checks, generic parser failures without token fragments, failure/attempt generation
retirement, explicit Retry locking and stable successful-pass status despite an
old widget-expiry event. The expanded run passed 52/52 account/data/verification
cases. Embedded cleanup now retires enhancement consumers before the player,
clears video metadata/title and has both-engine ownership/disposal checks.

Visual inspection found a singular-duration label and English fallback punctuation
in RTL; the current templates now use singular/plural labels and dir=auto for
standalone prose/headings. The test-only RTL scale now enlarges headings/brand too.
Those final visual refinements need fresh render/build/browser checks. The last
API-only/normal production harnesses passed before these view-only refinements.

The authenticated administrator footer now offers the existing CSRF-protected
sign-out action instead of an ineffective Sign in link. This is a view-only
refinement and requires the next fresh renderer pass; no auth scope/endpoint
changed. Current primary-source builds may predate this final footer markup.

Verification/recovery is now locally accepted and frozen in
[d7-verification-checkpoint.md](d7-verification-checkpoint.md), the seventeenth
manifest. Final-source browser run 52/52, final normal/API-only type checks,
fixture generation, syntax/format/reference/docs/whitespace pass. Five final
Light/Dark/enlarged RTL images inspected; Chromium's heading font confirmed as
local Noto Sans. Source snapshots (32), check logs (54), images (5) retained under
review/d7-verification-pending; Markdown sources use .md.txt. Prior sixteen frozen
manifests unchanged. Normal/API-only production harnesses precede only final view
labels/direction/sign-out footer; final browser/type/fixture checks include them.
Both owned local databases idle: bot6/0, account24/0. No remote/upstream access.

Continue S16 legal/privacy/licenses/messages/errors, then S15 minimal embeds.
Generic errors currently leak raw request resource/exception/backtrace in public
issue links; privacy text misses stored features and incorrectly promises logout
clears browser profiles. Keep readable known errors, structured safe recovery,
no write replay and LibreJS table semantics. D7 overall and D8–D9 remain incomplete.


S16 legal/message/error implementation has started after the frozen verification
checkpoint. New ErrorPages presentation helper, escaped plain reasons, optional
safe diagnostics (route patterns/class/version, no raw query/message/backtrace),
validated GET retry, write-state guidance and script-free embedded errors are in
place. Known unavailable-video exceptions retain their useful reason. Main shell
presentation allowlists color mode/escapes locale without changing stored native
preferences; reading errors no longer initialize watch/listing/SSE/timezone
consumers or echo private queries into header actions. Privacy text now describes
actual tables/browser profiles/providers/removal limits. Licenses use shared
reading/table-scroll while preserving LibreJS ID/three links, vendor rows,
first-party enumeration and local Lucide/Feather license attribution. GET/HEAD
legal pages are exempt from required login; other methods remain gated. Normal/
API-only initial type checks pass. Fixtures/browser/production legal-gate checks
are in progress and this S16 work is NOT accepted yet. The first fixture compile
found an old top-level error mock using retired raw-HTML variables; it now calls
the production helper. Later heading/unavailable/license refinements need final
fresh builds. Use /tmp/invidious-d7-s16-* logs and inspect active sessions before
rerunning; verification 17th frozen evidence must not change.

The production --required-login-only harness passed after exact guarded account
schema24/idle reset. It includes actual public GET/HEAD legal renders, rejected
other methods, existing credential/scope/CSRF/whitelist/signed-feed/admin cases.
Initial S16 browser boundary checks passed8/8; the final full visual matrix and
latest read-recovery links still need final fixtures/tests. Valid watch GET errors
retain explicit alternate-instance/YouTube options using only the validated video
ID; private queries and POSTs never become those destinations. Final renders now
use /tmp/invidious-overhaul-status-{api-,}renderer (when their builds finish).

Latest S16 normal/API-only fixture build2 and normal/API-only type checks pass.
Final renderer /tmp/invidious-overhaul-status-renderer is running (session60152);
API renderer /tmp/invidious-overhaul-status-api-renderer already passed. The
pre-navigation layout phase had2/4: license tests passed, both matrix failures
were the test's English-only expectation for the correctly Arabic-translated
Popular-disabled notice. The assertion now checks the exact appropriate reason.
Earlier private-boundary8/8 passed. Do not sum phase counts. Next run the full
status+verification+account browser matrix (64 expected), inspect final five
screens, record sources/checks and verify docs/hashes before accepting S16.

S16 reading/errors are locally accepted/frozen in
[d7-reading-checkpoint.md](d7-reading-checkpoint.md), the eighteenth manifest.
Final64/64 combined browser run and8/8 focused shell/Settings pass, final normal/
API-only type and fixture builds/renders pass, format/syntax/reference/docs/
whitespace pass (74 Markdown,2020 links). Five final screenshots inspected and
retained. Evidence:30 source snapshots,36 check logs,5 images. Existing17 manifests
unchanged; both owned databases idle (account24/0,bot6/0). No deployed/upstream or
native device accessed. Native JSON/Atom error helpers unchanged. Backend phase
predates final error-heading/read-action/license footer refinements; final browser,
fixture and type checks include them.

NEXT: S15 minimal embeds and required-login iframe recovery, preserving the real
player, sources/audio/captions/clip boundaries/private playlist ownership, native
schemas and profile lifetimes. embed.ecr still loads default.css and has no shared
Foundation/body ownership flags. Player component and player-settings.js already
supply unified desktop controls but legacy player_style/embed CSS remains. embed.js
still uses unowned helpers.xhr with five retries and late ended-handler attachment;
no cancellation/cache/profile/disposal guards. Required-login iframe still303s to
frame-denied login. Existing route /embed redirects duplicate query string in
redirect handler; preserve all validated query/occurrence behavior while fixing.
D8 consolidation/full repository regression and D9 semantic handbook/audit/handoff
remain after D7. Development ACTIVE; no subagents authorized. Current test/build
sessions completed; use latest /tmp/invidious-overhaul-status-renderer and
-status-api-renderer binaries, accounts binary from S16 legal gate pass.

S15 implementation has now started (NOT validated/accepted). Embeds load shared
Foundation/unified player style, escaped language/JSON, explicit main/player labels
and the existing shared Settings controls; no app navigation/Diary/default.css.
Added minimal UI/coordinator wiring so masking/DeArrow/SponsorBlock can refresh
through one canonical owner on return. New embed.js owns one abortable next read,
ended handler, cached/profile/player disposal, safe decimal cursors, series without
deduplication, explicit read retry and preserved current playback choices. The
coordinator manages this owner; verification disposes it before media and marks
recovery scrollable. Required-login GET iframe recovery now gives script-free401
new-window login/watch action; API/media JSON and ordinary navigation branches
stay separate. Embed redirect's duplicated query construction fixed. Open-watch
control is a real link/component (no nested anchor/button), preserving query/range
and explicit new-window access; shared icon handling includes embed masking.

Remaining S15 work before any acceptance: add/run full production fixture/browser
matrix (real synthetic media, no-JS, stream/audio/caption/clip cases, long/RTL,
keyboard, duplicate init, next/series failure/races and cached profile owner),
update guarded required-login expectations for iframe401 while retaining other
methods/API/HEAD, verify private playlist redirect/query/ownership, audit player.js
pending autoplay/reload/position lifetime around disposal, normal/API-only checks,
visual inspection, docs/evidence and D7 acceptance. Builds have not yet been started
for S15. Existing18 frozen manifests unchanged. No subagents or remote access.

Initial S15 normal/API-only app type checks pass. The new synthetic controller
lifetime suite passed8/8 Chromium/Firefox (exact Int64 cursor, duplicates, managed
cached return, ignored abort/late replies, invalid replies/explicit Retry, profile
change and player disposal). It does not substitute for real-media checks.
Fixture build1 had a Crystal parser issue at inline [] of String followed by
another argument, corrected with a typed local; an incorrect assumption that
Preferences owns controls was corrected by an optional fixture-only player_controls
argument. Build2 pending (session83595). New preview_range/video_series fixture
arguments preserve old defaults; source helper builds nine embed kinds x three
modes and actual framed-login recovery, plus per-fixture canonical owner JSON.

IMPORTANT pending audit before S15 acceptance: player.js still has unowned automatic
reload/autoplay timers, delayed speed-CSRF→PATCH followups and window position/
keyboard listeners that can reach a disposed player. Preserve pagehide beacon
position flushing while canceling stale async media/writes; add real-media tests.
Also evaluate mid-play required-login expiry without bot verification: current
access handler loads only with verification expiry and detects403 verification,
not401 login-required. A possible existing, upstream-free auth probe is HEAD
/api/v1/stats (required-login gate protects it, bot gate exempts it); a failure
marker/header plus conditional private-page bootstrap could distinguish expired
login without a new API route/schema or metadata request. This is an audit idea,
not implemented/accepted. Initial iframe login401 is implemented and must be tested
with the updated production required-login harness. Keep API/media JSON/HEAD
contracts and scope separation. No remote/upstream or new auth product scope.

The player lifetime audit is now implemented but NOT tested: playerWorkLife/
epoch/active guards retire automatic reload/autoplay work, buffer-restore hooks,
speed-CSRF/PATCH followups and DOM keyboard/position listeners on disposal; cached
pagehide pauses without replaying queued work on return. Exact position pagehide
beacon delivery remains allowed while inactive if the player/profile still exists.
Late normal position responses cannot enqueue a previous-epoch write. Caption
change hotkey now uses one stable listener rather than fresh off/on functions;
late annotation callbacks/actions cannot act on departed/disposed media. Shared
watch/embed behavior changed, so full meaningful player/watch/source/caption/
playback-sync regressions are required before S15 acceptance, with actual
pagehide/disposal/late-CSRF cases. JS syntax passes only at this point.

S15 fixture build2 passed; first render running(session84968), /tmp/invidious-overhaul-embed-renderer,
log /tmp/invidious-d7-embed-fixture-render-initial.log. Fresh production accounts
harness with iframe recovery assertions building to
/tmp/invidious-overhaul-embed-accounts. Backend build session46961. Account DB is still24 tables/idle after S16 until explicitly guarded reset.
The updated extracted playback-sync unit harness includes lifecycle boundary
stubs; the first sandboxed Node run counted only the file (1 case), so it is NOT
accepted as actual unit coverage. Escalated actual run is now pending in
/tmp/invidious-d7-embed-playback-unit-actual.log.
Actual player lifetime/race tests remain required; do not infer them from unit
stubs. Next add real-media embed browser suite and the pending expired-login
media audit, then final validations/evidence. No S15 acceptance yet.

S15 initial normal render passed all older JSON/source checks plus new S16/S15
assertions and wrote nine kinds x three modes, three actual framed-login recovery
views, and per-fixture canonical owner JSON. Real playback unit run (escalated)
passed12/12, including new beacon/late-response/disposal cases. Do not confuse the
first sandbox file-only1 result with actual coverage. S15 controller8/8 is separate.
CSS now explicitly resets Video.js fluid padding in full-size embeds and bounds
paused long-title overlays to two lines; final visual tests must check both.

Actual playback unit12/12 passes. Initial real-media embed browser suite is running
(session57736), log /tmp/invidious-d7-embed-browser-initial.log; twelve cases expected
(two engines x six families). Tests cover no-JS/fullsize64? (see source actual loops),
real shared controls/captions/speed/watch link, DASH/audio, preview/no-controls,
cached canonical owner and real player disposal with late-CSRF rejection. This
initial run is NOT accepted until output is inspected; do not assume pass. Existing
real-media setup intercepts all assets/media/providers/owner data and uses per-kind
owner snapshots. Production required-login backend binary build session46961 should
be inspected/polled before running; only reset account24/idle with exact guard.
S15 further needs dynamic access-expiry handling audit (401 login vs403 verification),
real next/series navigation and failure/late results if synthetic controller evidence
insufficient, light/dark/RTL/forced-color visual checks/screenshots, meaningful
shared player/source/watch regressions, final normal/API-only builds/docs/evidence
and D7 acceptance. Latest18 frozen manifests must remain unchanged.

First real-media embed run10/12: both failures are the combined DASH/audio case.
Chromium awaited an immediate DASH play promise and got a transient unsupported-
source rejection; existing D5 proves decode by catching that initial promise then
waiting for playback+two quality levels+three audio tracks. Firefox clicked Audio
before requiring that metadata readiness. The audio-only branch must assert its
actual available fallback quality choices rather than invent browser AudioTrack
switching when unavailable. Fix the setup/readiness with the same real decode
requirements as D5; do not weaken actual playback/identity checks. All other cases,
including no-JS layout, controls/captions/speed, preview/no-controls, cached owner,
and actual disposal/late-CSRF, passed. Full rerun remains necessary.

Production S15 --required-login-only backend now running after exact guarded
account24/idle reset, /tmp/invidious-d7-embed-db-run-initial.log. Focused media
readiness/menu rerun session26763 is pending (two expected). All18 frozen manifest
hashes rechecked unchanged. Raw audio source labels are a legacy internal format
also parsed/tested by stream menus; do not casually change them to fix apparent
units without auditing source-description adapters/native-compatible selection.
Current visible unified menu derives format metadata; preserve real functionality.

Focused decoded-media rerun passed2/2, and first production required-login/iframe
harness passed. All other initial real-media10/12 successes remain phase evidence,
not a final total. S15 access-expiry support is now implemented but unverified:
RequiredLoginHandler adds non-credential X-Invidious-Login-Required marker on
instance-gate failure (native JSON fields unchanged). Private watch/embed responses
can load the access owner even without bot expiry. For a media error, HEAD on the
existing local /api/v1/stats checks login without metadata/provider requests,
followed by existing verification discovery when appropriate. A marked401 offers
login recovery; unrelated401/scope failures do not. Frame login returns to watch
while preserving query/range/occurrence and known time. Access owner now has
pagehide/profile/generation/abort/dispose guards and restores its wrappers when
retired. Real player/embedded ownership retires it on disposal; enhancement owner
is also disposed when the embed's sole player is retired. Private fixture added
with a real account scope and expiry0; current build3(session54612) includes it.
Regression44-case expected (verification18,bot6,playback12,lifecycle8) and API-only
typecheck2 are now running; inspect returned sessions/logs before retrying. Still
need actual private iframe expiry/late-probe browser tests and final fresh backend.

Private iframe browser cases now added to embed-surfaces.test.cjs (16 expected
for full file): actual cross-origin synthetic iframe with expiry0/no bot pass,
marked401 HEAD /api/v1/stats, pause/dispose/new-window login/watch link with exact
occurrence+time, no video-metadata or mutation request, ignored previous-page
probe after cached return, and unrelated API401 without marker. They need build3
private fixtures and execution. All access/status providers are intercepted.

Access/verification/native+playback/lifecycle regression44/44 passed after the
first expiry-owner rewrite. API-only typecheck2 passed. Source later added explicit
verification-discovery shape validation and access retirement on player disposal;
those last refinements still need final rerun. Fresh shared D5/D1 actual player/
D6 runtime browser regressions are running; do not run another fixture renderer
while they read .generated files. Build3 can finish safely, but render it only
after this browser process completes to avoid fixture overwrite races. Private
iframe tests added (16-case embed suite) await those new rendered fixtures.

Shared player markup audit also found unescaped caption labels/URLs and attributes.
Current component now escapes channel/poster/source/quality values and URL-encodes
caption names, without changing their decoded values/native JSON. HLS local flag
uses the correct ?/& delimiter while preserving existing opaque query bytes.
These compiled-template refinements postdate build3 and need a fresh renderer/
normal build plus explicit hostile-caption and existing-query live fixtures before
acceptance. Do not alter raw legacy audio labels casually; adapters rely on them.

New long/hostile-caption and live HLS fixtures now included; build4(session39376)
compiles the final markup audit, superseding build3's unescaped player partial.
New HLS media generated separately under .generated/watch-media/hls (no existing
D5 files overwritten while regressions read them). generate_watch_media.cjs now
reproduces those files in CI; opaque manifest/segment query tests added. Before-
request local flag now uses ?/& correctly too. Full embed-surfaces file now18
expected cases (two engines x nine), including private iframe and real HLS decode.
Do not run it until build4 rendered after shared regression session92428 finishes.

Shared player/runtime regression98/98 passed (D5 + D1 actual player + D6 runtime).
It predates the last compiled caption/HLS attribute audit and newest access marker/
private tests; final source rerun still required. Open-watch link now captures the
current speed/listen/local choices on deliberate click as well as time/context;
preview ranges keep start/end. New browser assertion prevents navigation once
while invoking the actual click handler and verifies speed1.5. All player attribute
strings, including legacy bitrate labels, are escaped without altering decoded
values; bitrate escaping postdates build4 and needs final build5. Render build4
first if needed to exercise private/hostile-caption/HLS tests, then final build5
for actual-source acceptance. Current build4 session39376. No new dependencies,
remote calls, native app source edits or API JSON schema changes.

The private iframe expiry case now fails an actual progressive source reload with
marked401, rather than calling the access-check API directly. Access owner records
only the page-local last positive media time, so a failed source reload that resets
currentTime to0 still offers the known position. Nothing is persisted or synced by
this guard. This latest JS/test refinement needs the private iframe run and final
verification regressions. Source4 compilation/render pending status check; final
Source5 still required for last numeric-label escaping. Do not claim S15 complete.

Build4 and shared98 regressions had already completed; duplicate polling39376
returned Unknown process id (no work failed/restarted). Build4 renderer is now
running /tmp/invidious-overhaul-embed-renderer-final, log ...fixture-render-4.log;
there were no remaining fixture readers when it started. Fresh build5 to
/tmp/invidious-overhaul-embed-renderer-complete, final backend to
/tmp/invidious-overhaul-embed-accounts-final, and normal final typecheck now running.
Inspect actual returned session IDs/tool logs. Do not render build5 while any
browser run is reading the fixtures. API-only typecheck2 passed before these final
markup refinements; final API-only check still needed. Existing18 manifests frozen.

Build4 render failed at new hostile-caption assertion line53: XML.parse_html's
track hierarchy did not match //video/track. Production markup contains tracks;
use //track for this libxml-based assertion, while browser tests check real DOM.
This fixture-only lookup is corrected. Build5 likely compiled the old assertion;
inspect its status, then rebuild6 before a final full fixture render. Do not count
failed render4 as acceptance. All older S16 assertions before S15 long passed in
that phase. No source/manifest frozen earlier was overwritten. Latest media tests
include real source401 recovery and a page-local known-time fallback (no storage).

Embed suite now20 expected (added enhanced visual/keyboard geometry using actual
Video.js, not just native no-JS): Light/Dark/enlarged RTL, single/masked/real portrait,
1280/1440/1920 and640x360 iframe, panel bounds/Escape focus and same media. Portrait
requests now use actual generated portrait media. Representative screenshot paths
under tests/frontend/artifacts/d7-embed. Final production-system mode relies on the
same accepted Foundation/helper projection; optional D8 expanded matrix can add
specific server System-mode embeds if needed. Source6 build session38057, backend2
session6929, API final92384 currently pending; inspect logs/results before render.

Build6 and backend2/typeAPI final logs now show only existing deprecations; check
returned process statuses. Build6 full renderer started /tmp/invidious-overhaul-
embed-renderer-validated, log /tmp/invidious-d7-embed-fixture-render-6.log, after all
browser readers had completed. If this render passes (including fixed //track and
HLS query assertions), run full20 embed browser cases next. Fresh backend validated
binary includes new URI/ownership assertions; run required-login-only and QoL-only
with separate exact24/idle resets after each finishes, never while readers active.

Build6 full render PASSED, including hostile caption and existing-query HLS source
assertions; all fixtures now complete/fresh. Full20 real-media embed browser suite
started, /tmp/invidious-d7-embed-browser-2.log. Do not render again while it reads
.generated. Source final marker/URI production harness running ...db-login-final.log
from fresh validated backend2; normal final2 typecheck also pending. Need inspect
results before further mutations/reruns. API final passed. Current18 frozen records
unchanged; no S15 checkpoint accepted yet.
