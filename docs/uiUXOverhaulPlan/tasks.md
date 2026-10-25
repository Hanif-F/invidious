# Dependency-ordered implementation tasks

[Master plan](README.md) · [Coverage](coverage.md) · [Design](design-system.md) · [Verification](verification.md) · [Progress](progress.md)

**Planning only: none of D0–D9 is authorized to execute yet. Start only after the user explicitly requests implementation.**

All tasks are repository-local. The user deploys/activates on the remote host. Do not run deployment commands, change remote configuration or treat local synthetic playback as a deployed-server pass. Each task updates its current guide, matrix status and evidence as it changes behavior. The final cleanup is additional to these incremental updates.

## D0 — Current-version documentation and inventory

**Dependencies:** none. **Implementation:** audit guides/references against source, repair known semantic discrepancies, separate historical deployment/release results, consolidate duplicated root feature guidance, fill current JS behavior gaps, record all templates/dynamic surfaces, preserve legal/security material. Save the full plan and detailed contracts in this directory and make them reachable/tracked.

**Acceptance:** accurate current behavior, local links/reference generation/whitespace pass, no new UI described as shipped, every screen/dynamic fragment has an owner and explicit access/state/test mapping. Record outstanding runtime verification honestly.

## D1 — Design foundation, icons and representative screens

**Dependencies:** D0. **Implementation:** introduce semantic light/dark tokens, shared controls, static SVG icon renderer and shell. Build representative real-template/fixture versions of browsing, watch/tabbed panel, playlist rows and one Settings category. Do not preserve unwanted button/text patterns to satisfy old visual assertions. Use exact state scopes/design contracts from the package.

**Acceptance:** inspect light/dark screenshots at 1440px and desktop checks at 1280/1920; one header toggle, neutral visual hierarchy, consistent contained action controls, subtle playlist grip, no movement buttons. Verify representative interactions and accessibility before submitting the checkpoint. Record screenshots/check results and request the user's visual review; do not mark approval without their response. Independent unaffected work may continue while review is pending, but do not propagate unapproved visual decisions across all screens.

## D2 — Shared lifecycle, browser state and safe Settings writes

**Dependencies:** D1 components/contracts; visual propagation depends on the checkpoint. **Implementation:** render controls with their owners; shared idempotent menu/tab/dialog/feedback utilities; validated watch_layout/docking state in InvidiousStorage; explicit per-category preference manifests and transactional latest-value merges; old-form compatibility and canonical save read-back; separate admin-only settings page/handler with isolated YAML keys.

**Acceptance:** account/guest saves preserve other categories, unknown/native fields, chat/identity/override state and config; stale tabs cannot save as another profile; storage failures are truthful. Test CSRF/role failures, malformed categories, partial/unchecked fields, native/web round trips and simultaneous unrelated-category updates. Verify both HTML redirect and existing JSON paths. Complete category ownership documentation.

## D3 — Discovery, search, channels and shared listings

**Dependencies:** D1 visual checkpoint and D2 shared lifecycle. **Implementation:** consistent grid/row renderers, scoped search and explicit Apply filters with normal navigation, core channel tabs + More, post/community/readable channel header, external tools in menus. Preserve all existing routes/data sources/continuations/masking/AI/member/count/progress behavior.

**Acceptance:** search/filter/load-more/watch/Back journey; private POST state privacy; stale/failing continuation; filtered empty pages; duplicate occurrences; channel tabs and post replies; failed avatars and incomplete metadata; no typing requests/per-card metadata fetches. Migrate every server/JS listing fragment and preserve direct pagination entry.

## D4 — Subscriptions, notifications, history and playlist workflows

**Dependencies:** D2/D3. **Implementation:** remove header bell assumptions; subscription new-upload/refresh controls and existing browser-notification lease; shared management rows/statistics; date-grouped history; owned/saved playlist distinction; all playlist forms; on-demand selection and partial failures; row-grip drag with insertion/scroll/keyboard handling and occurrence-aware writes.

**Acceptance:** no movement buttons or loose control strips; stable duplicates/order/unloaded entries after move; stale/network/permission errors; manager sorting/cached stats; explicit notification refresh without surprise reorder; profiles/SSE cleanup; history disabled/clear/sync effects; whole playlist privacy and saved-reference semantics. Use guarded real transaction harnesses for order/ownership/concurrency.

## D5 — Watch layouts and player control hierarchy

**Dependencies:** D1 approved watch layout, D2 lifecycle/state, D3 listing primitives. **Implementation:** move chat outside the media container, standard/theater persistence, one utility panel with default rules, deliberate creator/actions grouping, title icon cycling and More menu, unified player Settings retaining media selection behavior, optional docking off by default.

**Acceptance:** one media element across tabs/layout/docking/settings; no restart/position loss or accidental title leak; actual Video.js synthetic media checks; all controls/shortcuts/stream identity/quality/audio/captions/VR/annotations/storyboards/chapters/resume/diagnostics semantics preserved. Test fullscreen/PiP handoff to the extent browser automation permits and document limits.

## D6 — Transcripts, comments, replay chat, clip editor and enhancements

**Dependencies:** D2/D5 and shared thread/list components. **Implementation:** transcript follow/manual navigation, compact comment/reply sources, synchronized panel-only chat, removal of browser overlay controls/code without native-field resets, same-player side clip editor and standalone fallback. Apply dedicated settings categories and contextual shortcuts for SponsorBlock/DeArrow/AI/blocks/channel masking. Preserve contribution/identity isolation and no ambiguous write retries.

**Acceptance:** independent loading/unavailable/failure/retry states; chat seek/offset/filter/range handling; no overlay web UI; clip preview restores playhead/bounds/state and never pollutes full-video progress; immutable publication/range constraints and draft failures; enhancement coexistence/filter precedence/disabled lookups; hidden title/thumbnail states do not leak through auxiliary labels or notifications. Existing APIs/scopes remain compatible.

## D7 — Account, data, administrative, standalone and embed pages

**Dependencies:** D1/D2 and shared forms/dialogs. **Implementation:** migrate every account/security/deletion/token/authorization/TV form; source-select import and grouped export; admin and verification/recovery shells; legal/privacy/licenses/errors/messages/unavailable clips; embed controls shared with watch but without navigation.

**Acceptance:** complete coverage matrix, role and CSRF correctness, clear destructive/security consequences, token/identity confidentiality, direct/legacy entry points, API-only recovery builds, import/export formats and failure behavior, fallback pages without JS where applicable. No new auth/recovery or background-import product scope.

## D8 — Consolidation, regressions and performance

**Dependencies:** D3–D7. **Implementation:** remove unused Diary fonts/art/style, migrated Pure/Ionicons first-party dependencies, retired controls/modules/classes and duplicate runtime paths. Preserve necessary vendor/player/licenses. Replace retired-style tests with new behavior checks. Document asset/request baselines and cover the full desktop fixture/state matrix.

**Acceptance:** searches show no accidental runtime legacy references, all listed components use the shared design, relevant specs/browser tests and normal/API-only builds pass, DB checks use disposable guarded databases, no duplicate handlers/per-item calls/player recreation. No narrow green subset used as a full completion claim.

## D9 — Final documentation reconciliation and user handoff

**Dependencies:** D8. **Implementation:** perform the second semantic handbook pass, replace Diary authoring guidance, update active screenshots/destinations/contracts/state scopes/references/test instructions and compatibility notes, remove transitional or abandoned instructions. Add documentation CI checks. Reconcile every coverage row and acceptance item against actual evidence, not task intent.

**Acceptance:** complete requirements-to-evidence audit, clean generated/link/whitespace checks, accurate local versus remote/upstream limitations, cache-refresh/build/deployment/rollback notes for the user, no remote action performed. Mark the overall goal complete only when all required repository work and requested visual review are satisfied.

## Task execution rules

Tasks may be subdivided into coherent commits or future agent assignments, but ownership of shared shell/tokens/settings manifests stays singular. Establish contracts before parallel area work. Do not spawn agents unless the user or applicable instructions authorize delegation. Keep working through incomplete stages; record blockers precisely and continue unaffected tasks. Do not silently skip the visual checkpoint, required states, documentation passes or native compatibility.
