# D8 frontend reconciliation — accepted 1 November 2026

[Acceptance](d8-acceptance.md) · [Journey audit](d8-verification.md) · [Evidence](review/d8-evidence.json)

The complete declared frontend suite passes **902/902**. This is one terminal
passing npm invocation, including the current UI, desktop, QoL, account, recovery,
embed and unit files. It is not a sum of focused reruns. The complete production
backend harness and 300 + 137 spec runners pass separately.

## Inventory and preserved behavior

[All 349 original UI cases are accounted for](review/d8-pending/checks/ui-complete-test-reconciliation.json):
282 retained cases across 140 source families, 67 explicit presentation
replacements and two added contextual ownership cases give 284 current UI cases.
Current desktop has 416 cases, QoL 22 and embed lifecycle 10. Exact callback hashes,
original/current names and source snapshots remain available.

| Reconciled family | Disposition and direct replacement evidence |
| --- | --- |
| [Clip popup/preview iframe](review/d8-pending/checks/clip-test-reconciliation.json) | Eight families / 16 engine cases map validation, draft/publishing/unknown writes, preview/bounds, close/restore/focus and fallback to current same-player D6 cases and clip-editor/session units. Native bounded playback remains. |
| [Diary/full-form presentation](review/d8-pending/checks/style-test-reconciliation.json) | Eleven families / 22 cases map old fonts, paper, navigation inventories and density presentation to current D1–D7 matrices, category forms and D8 header/focus checks. Native cosmetic fields remain compatible. |
| [Replay overlay/old ranges](review/d8-pending/checks/chat-test-reconciliation.json) | Nine families / 18 cases map retired overlays to panel replay, explicit timing/display saves, cache/filter/reader/removal/error behavior and native field round trips. Existing backend display ranges remain authoritative. |
| [Full-form QoL controller](review/d8-pending/checks/qol-test-reconciliation.json) | Three families / six cases map the unreachable editor to D2/D8 categories. Invalid category search retains focus and drafts; production old POST/receipt/native compatibility remains. |
| [Contribution/identity and old embed VM](review/d8-pending/checks/enhancement-test-reconciliation.json) | Eleven cases map old strips/full-form identity/Ionicons/mobile presentation to current explicit contribution/identity editors and actual-browser embed continuation/lifecycle. |
| [Admin destination](review/d8-pending/checks/admin-test-reconciliation.json) | Current native account menu and separate instance forms replace the full-form container selector. Recognized hidden bookmarks retain destination authorization. Ordinary guest navigation exposes no Admin entry. |
| [Personal-context blocks](review/d8-pending/checks/block-context-test-reconciliation.json) | Real before/after production DTOs and valid channel IDs replace contradictory mock read-backs. Confirmed Block/Undo preserves subscribed, owned and explicitly included search rows and exact occurrence identity. |

Every named replacement in the first four maps appears in the final passing TAP.
Counts, original titles, learned avatars/cache/Unicode contrast, membership, AI,
masking, history, queues, real media decoding/rank/identity, refresh/diagnostics,
keyboard/touch/native input and profile behavior were retained and migrated to
actual routes/components. Mobile website presentation is deferred; shared mobile
embeds and native contracts remain verified.

## Failed phases remain separate

The original full npm attempt observed 113 failures before interruption after
28 minutes; it is not a completed baseline. The complete retained UI audit then
finished 197/293. Later complete desktop and UI-file phases still found stale
prototype/full-form selectors, a screenshot before committed navigation and an
implicit viewport precondition. Focused results did not establish acceptance.

The two resumed complete npm runs each finished 901/902. One found the obsolete
Admin container selector. The next found an incomplete block fixture returning
unblocked canonical state after mock success; invalid synthetic channel IDs in
two contexts also could not represent native accepted state. Current fixtures
render actual before/after DTOs and the test waits for enabled canonical controls.
All failed logs, exact source phases and corrected focused checks are retained.
The final resumed npm run is 902/902, zero failures/cancellations/skips.

Runtime bugs found through this audit were fixed rather than labeled obsolete:
shared sharing-object identity, strict canonical category schema, accessible help
and public feature search, unified timeline geometry and verified creator clipping.
Ten final visual copies and V01–V36 were audited before D8 acceptance. D9 remains
the final semantic documentation and overall-requirement handoff stage.
