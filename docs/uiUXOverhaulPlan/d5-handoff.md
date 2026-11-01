# D5 implementation history and continuation notes

[Progress](progress.md) · [D5 contract](d5-player-contract.md) · [D4 acceptance](d4-acceptance.md)

Development resumed at the user's explicit request on 27 October 2026. D0–D5 are now complete; see [D5 acceptance](d5-acceptance.md). D6–D9 remain required. The working notes below retain earlier intermediate states as history. The earlier shutdown notes below are historical; see the current continuation checkpoint at the end. No deployment or commits were made. All implementation changes remain in the shared checkout.

## Completed D4 checkpoint

`review/d4-evidence.json` records 90/90 desktop cases, 26 retained reviewed images and 129 cumulative source hashes. Relevant QoL (28), browser storage (26), specs (26 search + 15 history/preferences), full fixtures, normal/API-only type checks and guarded PostgreSQL library/history/privacy/API/embed checks passed. The eight original approved D1 screenshots remain unchanged. Do not rerun the temporary D4 finalization script: it appends historical records and would capture later D5 code.

## D5 implementation present, not accepted

- Production `watch.ecr` now uses shared layout/actions and extracted `overhaul/watch_*` partials, preserving original heading/details/music/comments/download/URL identities. The later continuation removes the `overhaul/watch.ecr` wrapper; all watch fixtures now render production directly. Desktop routing includes watch and shared native-clip playback.
- `player-ui.js` uses profile-scoped standard/theater storage and resizes the existing player. `player-dock.js` defaults off and implements opt-in, placeholder/controls/exclusions and lifetime handling. `player-interface.css` owns the new controls/layout styling.
- New `player-settings.js` delegates quality/audio/fallback source choices to existing callbacks, retains speed/captions/appearance, provides enhancements/advanced/docking/refresh/diagnostics and adds supported native PiP. It needs full runtime verification, especially captions, cleanup and focus.
- Replay chat remains outside the media element on modern pages; temporary panel guards preserve stored overlay fields. Its full overlay-code retirement and control migration still belong to D6.
- Utility tabs support Queue → replay Chat → Up next precedence and an explicit-only Transcript when it is the sole tool.
- A real bug was found: old owned-list links passed large occurrence IDs through an ordinal `index` parameter, so later duplicates could open the first copy. New links carry both ordinal and explicit `occurrence`; `WatchPage.playlist_cursor` and `Database::Playlists.occurrence_offset` resolve one authorized snapshot, preserve legacy ordinals/large links and mark expired entries. Watch and embed use that helper.
- Queue HTML opt-in (`format=html&ui=desktop`) receives current-occurrence/removal information, ignores retired thin mode, and the latest source adds a complete positions/total snapshot. Default API JSON and ordinary HTML response outer fields remain unchanged. The latest positions additions were made after the first D5 binaries were built and still need a new build/run.
- Queue JS now has request generations/abort/profile/cached-page guards, explicit read retries, canonical occurrence reconciliation and no blind removal retries. Unknown removals stop automatic advancement until a safe read establishes the current state. This code is not yet fully tested.
- Download options now use one DOM instance, moved into a dialog by JS with an HTML fallback; masked titles are kept out of its filename field.
- Pinned Lucide subset is now 50 symbols (added `volume-x` from 0.468.0 with raw SHA recorded). D4's historical manifest correctly remains 49.

## Validation and immediate next work

The first D5 fixture and account binaries compiled successfully. Full fixture execution passed and emitted **29 D5 fixtures** in `tests/frontend/.generated/`. The guarded account `--qol-only` run passed, including the new duplicate/ordinal/private/expired-entry checks and existing ownership/private/API/embed security checks. Earlier D5 normal/API-only type checks passed; later queue/occurrence additions require final rechecks. `stream-menu.test.cjs` and `playback-sync.test.cjs` passed their two top-level harnesses.

Four initial D5 browser cases were added to `tests/frontend/overhaul.test.cjs` (two per engine). Latest run **0/4**, all timed out on test locators rather than established product failures:

1. Layout/tabs/media identity and theater persistence passed until the final attempt to click **Standard mode after reload**. With `preload=none`, the Video.js bar is not exposed before playback starts; start muted playback and pause after reload before clicking the control.
2. Settings opened, but the test looked for `/^Speed,/`; inspect actual translated `player_data.mobile_labels.speed`/menu accessible labels (likely **Playback speed**) and correct the user-facing locator. Then continue caption/appearance/advanced checks and inspect real failures. Do not weaken assertions blindly.

Useful logs (in `/tmp`, may not survive reboot): `/tmp/invidious-d5-browser-tests.log`, `-fixture-build.log`, `-fixture-render.log`, `-db-build.log`, `-db-tests.log`, `-stream-sync-tests.log`. Latest browser session 99777 was consumed and all browser processes closed. Fixture/account build sessions 11372/27734 and runs 7035/74943 were consumed; no work should still be running.

Next: fix the two initial test assumptions, inspect production watch images and actual menu DOM, then extend D5 tests for real docking/default-off/profile/session/cached-page/fullscreen/PiP exclusions, captions/error recovery, DASH/fallback identities, queue canonical partial failures/unknown writes/current-next/end behavior and desktop geometry/RTL/enlarged text. Add guarded tests for the new opt-in queue snapshot fields and unchanged default wire shape. Rebuild fixtures/account harness after source changes, then run appropriate regressions. Existing QoL docking tests assume automatic docking and will need to opt in explicitly and use the new Settings hierarchy. Complete documentation and manual visual gates before D5 acceptance.

## Runtime setup

Crystal `/usr/bin/crystal` 1.22.1; set `CRYSTAL_CACHE_DIR=/tmp/invidious-ui-crystal-cache`. Fixture build: `crystal build tests/frontend/render_fixtures.cr -Dskip_videojs_download -o /tmp/invidious-overhaul-fixture-renderer`; run that binary. Silent compilation for several minutes is normal. Never restart a live build merely because it is quiet.

Playwright is installed under `tests/frontend/node_modules`, Chromium and Firefox available. Browser tests require sandbox escalation with approved prefix `node --test`; do not bypass that requirement. Focused command: `node --test --test-name-pattern='D5' tests/frontend/overhaul.test.cjs`.

The disposable PostgreSQL 18 container `invidious-ui-overhaul-01a176a0` (task label `01a176a0-bf7a-71b0-af8d-2955647ae8f0`) is being stopped for shutdown. It was `--rm` with no production mounts. Recreate a disposable test database after restart; its old localhost port 32769 must not be assumed. Account/history harnesses require guarded empty test databases. Docker uses `--host unix:///var/run/docker.sock` and escalation. Never touch production data.

No subagents were used or authorized. No pending user review is needed: D1 direction was approved; this pause is only for shutdown.

## Current continuation checkpoint — active D5 work

- Old four test failures above were corrected; D5 now has 32 browser cases. The broad run passed every D5 case, all 28 QoL, 26 storage, and stream/sync cases (28 including new progressive descriptions). Its total was 194/204, with ten failures caused by D1 preview watch fixtures missing player assets. **That preview wrapper was removed and `watch_fixture` now renders production `watch.ecr`/`template.ecr` directly.** A new fixture build is running/was started; inspect the active tool handle or completed log before rerunning. Do not restart a quiet live build. `/tmp/invidious-d5-fixture-build.log` and the existing renderer path remain current.
- New `tests/frontend/generate_watch_media.cjs` makes actual VP8 progressive sizes/portrait, AAC and multi-audio H.264 DASH. It is wired into the frontend workflow and README. Generated media lives in `.generated/watch-media/`. Current renderer emits 31 D5 HTML fixtures.
- Caption empty/error/deadline recovery, exact fallback descriptors/selected state and source restoration are implemented. The latest JS change additionally prevents transient source-reset rate events from being saved as preference edits; rerun the affected tests after the current fixture rebuild.
- New queue API optional full positions fields are built and verified in real guarded PG tests. Signed duplicate offsets, private API gating, expired successors and unchanged native/default HTML wire fields all pass.
- Source sizing now uses `--video-ratio` with explicit width/viewport cap, centering portrait media. Panel-only chat explicitly overrides legacy display/position rules. Player symbols use local SVGs; native pseudo-glyphs are suppressed. Run refreshed visual captures and inspect them after the final geometry/icon changes.
- Normal/API-only type checks passed, fixture rendering passed before the direct-preview-path repair. Docs references/links passed before removing that wrapper; regenerate/check again after it is removed.
- A new disposable PostgreSQL 18 container is **running**: `invidious-ui-overhaul-01a176a0`, same task label, ephemeral localhost port **32768**, no production mounts. Its guarded `invidious_accounts_test` database was used and is no longer empty. Do not rerun the harness against the filled schema; use another empty disposable database/container or explicitly recreate this test database. `/tmp/invidious-overhaul-accounts-checks` was built and `--qol-only` passed. Password is the test-only `overhaul-test-only`.
- Useful latest logs: `/tmp/invidious-d5-regressions.log` (194/204, preview failures), `-browser-tests.log` (earlier18 cases), `-state-tests.log`, `-progressive-tests.log` (2/2 final), `-queue-lifecycle-tests.log` (6/6), `-accessibility-tests.log` (4/4), `-visual-tests.log` (2/2), `-qol-tests.log` (old26/28 before transcript-tab fix), `-qol-transcript.log` (2/2 repair), `-db-tests.log`, `-normal-types.log`, `-api-types.log`, `-stream-sync-tests.log` (28 actual assertions in escalated Node runtime).
- Browser tests need escalation with `node --test`. Use `--test-concurrency=1` for multiple suites to bound browser load. A name filter matching **no** QoL cases left its setup browsers running; that specific worker was diagnosed and terminated, not restarted on an observation timeout. Avoid passing unrelated suites to a filter that selects none of their cases.
- Manual review so far: single/light, Settings/DASH dark, owned queue/dark, replay/light and portrait/dark. More visual checking, preserved keyboard/chapters/storyboards/SponsorBlock/VR/annotations/refresh/diagnostic coverage, final source/lifecycle review, scope-to-evidence audit and documentation remain before D5 acceptance. Full comments/chat/editor/enhancement migration remains D6, secondary pages D7, retirement/build consolidation D8 and final docs D9.

## Accepted checkpoint

D5 is accepted; see `d5-acceptance.md` and `review/d5-evidence.json`. Final desktop
suite 130/130 (40 D5), affected regression set 217/217, final masking/player/clip/
stream/sync units 36/36; guarded PG and normal/API-only checks passed. Fifteen
reviewed images and 158 cumulative source hashes are retained. Preview/geometry/
caption/source/title/reveal issues above are resolved; they are historical notes.
All tool sessions from this D5 run have completed. The disposable PostgreSQL
container remains running and its account database remains populated.

Next stage: D6 transcript/comment/replay/clip-editor/enhancement migration. Read
the master/tasks/verification contracts, inventory these modules, then implement
each feature extensively with same-player preview/progress isolation and no
native overlay-value resets. Do not rerun D4 finalization or mutate historical
evidence hashes. Keep the overall goal active until D6–D9 are actually complete.
