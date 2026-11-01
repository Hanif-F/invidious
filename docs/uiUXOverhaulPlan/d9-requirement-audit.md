# Final requirements-to-evidence audit

[Master plan](README.md) · [Tasks](tasks.md) · [Coverage](coverage.md) · [Semantic audit](d9-semantic-audit.md) · [User handoff](user-handoff.md)

This audit follows the dependency-ordered implementation and the user-approved D1
visual direction. Feature evidence is dated and frozen. The final D8 run proves
integration of the accepted runtime source; D9 reconciles documentation and
handoff without altering that runtime. Local interception and disposable databases
are the acceptance environment, as required by the plan. Remote activation/native
app implementation/physical devices are outside the objective.

## Dependency-ordered stages

| Stage | Implemented scope and exit evidence |
| --- | --- |
| D0 | Baseline semantic audit, archived history/legal/security material, assigned source/state/access inventory, reference/link/whitespace checks before visual propagation: [baseline audit](current-version-audit.md), [dated progress](progress.md), [original evidence](review/evidence.json) |
| D1 | Shared tokens/SVG/shell and real representative Light/Dark browsing/watch/playlist/Settings; desktop fit/behavior and inspected images followed by the user's explicit approval on 26 October: [visual checkpoint](visual-checkpoint.md), [original evidence](review/evidence.json) |
| D2 | Idempotent primitives, isolated storage profiles/layout/docking validators, category manifests/locked merges/read-back and separate admin YAML: [ownership](settings-ownership.md), [D2 evidence](review/d2-evidence.json), [D8 V28–V30/V33](d8-verification.md) |
| D3 | Production grids/rows, explicit search/Apply/private POST, all channel/More/posts/threads and continuation/Back: [D3 evidence](review/d3-evidence.json), [D8 V02–V07](d8-verification.md) |
| D4 | Subscriptions/notification refresh, cached manager statistics, history, owned/saved playlist forms, selection, partial writes and exact pointer/keyboard occurrence grip: [D4 acceptance](d4-acceptance.md), [D8 V08–V13](d8-verification.md) |
| D5 | Production watch/utility hierarchy, title/actions, unified media Settings, Theater and optional docking with one media element: [D5 acceptance](d5-acceptance.md), [D8 V14–V18/V25/V36](d8-verification.md) |
| D6 | Transcript/comments/panel-only replay, same-player/standalone clips, dedicated enhancement/identity/block/masking editors and full automatic owner/runtime coexistence: [D6 acceptance](d6-acceptance.md), [D8 V19–V30](d8-verification.md) |
| D7 | Account/security/session/consent/TV/data/admin/recovery, reading/errors/legal and minimal shared embeds including API-only: [D7 acceptance](d7-acceptance.md), [D8 V31–V35](d8-verification.md) |
| D8 | Thirty-eight retired files, 398-runtime-file reference scan, all test replacements, complete 902/902 frontend invocation, full specs/builds/backend, final images and asset/request measurement: [D8 acceptance](d8-acceptance.md), [test audit](d8-test-audit.md), [manifest](review/d8-evidence.json) |
| D9 | Second semantic audit across all handbook/active instructions, complete template/dynamic/requirement reconciliation, current gallery, generated references/expanded CI checker and concrete user handoff: [semantic audit](d9-semantic-audit.md), [D9 acceptance](d9-acceptance.md), [user handoff](user-handoff.md) |

## Master-plan and design contracts

| Requirement group | Final implementation and direct acceptance |
| --- | --- |
| Scope/architecture and normal navigation | Crystal/ECR/Video.js retained, focused JS with ordinary page destinations, no SPA/new frontend service: [architecture](../architecture.md), [D8 V03–V06/V36](d8-verification.md) |
| Shared tokens, typography, SVG, controls and no decorative Diary | [Foundation](../../assets/css/foundation.css), [icons](../../src/invidious/frontend/icons.cr), component ownership in [styling](../theming.md); [D1 review](visual-checkpoint.md), [D8 V35/V36](d8-verification.md) |
| Single shell/sidebar and role-aware navigation | One header toggle, current destinations, profile collapse/watch drawer, account menu and secondary reading/source links: [D8 V01/V30/V35](d8-verification.md) |
| Interaction primitives and accessible component anatomy | Menus/dialogs/tabs/focus/Escape, input help/errors, notices/confirmation/unknown outcomes, bounded appended initialization: [D8 V01/V05/V13/V28–V36](d8-verification.md) |
| Storage and media persistence | Guest/account isolation, stale callbacks/deletion/denied durability, standard/theater and docking off-by-default, no guest import: [ownership](settings-ownership.md), [D8 V14–V16/V30](d8-verification.md) |
| Safe Settings/admin/native compatibility | Declared category keys and typed canonical read-back, latest locked raw merge, dedicated private fields, unchanged schemas/scopes/CSRF and separate YAML ownership: [ownership](settings-ownership.md), [D8 V24–V30/V33](d8-verification.md) |
| Discovery/channel/listings and filtered/empty/failing continuations | Shared card/row projections, metadata zero/unknown/avatar/mask/member/AI, all core/More tabs and private POST restoration limits: [D3 evidence](review/d3-evidence.json), [D8 V02–V07](d8-verification.md) |
| Subscription notifications and manager | Subscriptions-owned explicit refresh, no header bell, browser permission and profile SSE lease, cache-only statistics: [D4](d4-acceptance.md), [D8 V08/V09](d8-verification.md) |
| History/library/privacy/forms | Date groups/timezones/sync independence, whole-library search, owned vs saved sources, public/unlisted/private access and literal failed forms: [D4](d4-acceptance.md), [D8 V10/V11/V13](d8-verification.md) |
| Reordering/selection/partial and ambiguous writes | Same row grip, pointer insertion/scroll and Space/Enter/arrows/Escape, duplicates/unloaded/64-bit identities, transaction/concurrency, no unsafe repeat: [D4](d4-acceptance.md), [D8 V12/V13](d8-verification.md) |
| Watch layout, utilities and title/actions | Standard/Theater, meaningful default tabs, creator + toolbar/More, safe cycle labels/metadata and opt-in docking exclusions: [D5](d5-acceptance.md), [D8 V14/V15/V18/V25](d8-verification.md) |
| Media capability hierarchy | Unified Settings, exact audio/quality/codec identity, captions/retry/appearance, chapters/storyboards, shortcuts, diagnostics, buffer refresh, VR/annotations and embeds: [D5](d5-acceptance.md), [D7 embeds](d7-embed-checkpoint.md), [D8 V16/V17/V34/V36](d8-verification.md) |
| Transcript/comments/replay | Deferred transcript/manual follow, compact shared source/reply readers, synchronized bounded panel replay with explicit errors/filters/offsets and no web overlay: [D6](d6-acceptance.md), [D8 V19–V21](d8-verification.md) |
| Clip creation/viewing | Side panel using same player, boundary capture/validation/drafts/public immutable copy, restoration/no progress/queue/dock pollution, direct fallback, owner/library/unavailable playback: [clip checkpoint](d6-clips-checkpoint.md), [D8 V22/V23](d8-verification.md) |
| SponsorBlock/DeArrow/contributions/AI/blocks/masking | All declared dedicated editors and contextual shortcuts, inheritance/modes/colors/status/precedence, no disabled extra lookups/private-ID leak/ambiguous retry, cached owner changes: [D6](d6-acceptance.md), [D8 V24–V30/V36](d8-verification.md) |
| Account/data/security/TV/admin/standalone/legal | Ordinary forms, scope/secret/role/CSRF correctness, all seven imports/grouped exports/partial failures, explicit TV approval, recovery/API-only/errors/licenses: [D7](d7-acceptance.md), [D8 V31–V35](d8-verification.md) |
| Complete source/screen/dynamic coverage | S01–S16, 65 retained baseline rows and all 93 current ECRs, dynamic readers/fragments/modules, style/vendor/branding ownership: [coverage](coverage.md), [exact accounting](review/d9-pending/checks/coverage-reconciliation.json), [D8 V36](d8-verification.md) |
| Retirements with compatibility | No active Diary/Pure/Ionicons/old full-form controller, density/thin/skin/overlay editor, header bell, movement strip or primary clip popup; raw native/legacy values preserved: [D8 retirement/test audit](d8-test-audit.md), [preferences](../preferences.md) |
| Desktop matrix and visual checkpoint | Chromium/Firefox 1280/1440/1920, Light/Dark/live System, RTL/enlarged/forced colors/reduced motion/focus, long/incomplete metadata, user-approved direction: [D1](visual-checkpoint.md), [D8 V35](d8-verification.md), [gallery](../../screenshots/README.md) |
| Performance/lifecycle | No new remote fonts/icon/runtime, same-media identity, bounded observers/requests, no per-card presentation fetches, final gzip and explained D1 request comparison: [D8 acceptance](d8-acceptance.md) |
| Documentation/history/handoff | Two semantic passes, unchanged historical accepted evidence, current screenshots/destinations/state/test instructions, seven refs/links/reachability/whitespace/CI and cache/build/deploy/rollback with explicit limits: [D9 semantic audit](d9-semantic-audit.md), [handoff](user-handoff.md) |

## Verification-contract completion criteria

| Criterion | Evidence and scope |
| --- | --- |
| 1. Plan/contracts in requested directory | Master/tasks/design/coverage/verification/ownership and dated evidence are reachable in `docs/uiUXOverhaulPlan/`; `.gitignore` admits the complete directory. Existing tracked plan files and new uncommitted files are delivered together; staging/commit is an explicit user handoff because Git metadata is read-only. |
| 2. Baseline documentation before UI | [D0 audit](current-version-audit.md) and [progress](progress.md) precede the D1 implementation/approval. |
| 3. User visual review | [D1 checkpoint](visual-checkpoint.md) records the user's explicit approval; D8 retains inspected final production-template copies. |
| 4. Every route/template/dynamic surface | All S01–S16 and 93 current ECRs plus retained/retired source rows are reconciled in [coverage](coverage.md) with direct stage evidence and complete D8 integration. |
| 5. Browser retirements/native preservation | [D8 runtime accounting](d8-acceptance.md), [test audit](d8-test-audit.md), full native/web/raw merge and concurrency checks; native app UI remains outside this repository. |
| 6. Direct behavioral/visual/database/build checks | Terminal 902/902, 437 spec examples, fresh linked normal/API-only and fixture builds, full guarded backend and inspected images are frozen in [D8](d8-acceptance.md). No sum of reruns or fixture-to-live claim. |
| 7. Dependencies/duplicate paths removed | Thirty-eight retired files including two untracked prototypes, full 398-file runtime scan, required vendors/licenses retained, one media/handler lifecycle; [D8](d8-acceptance.md). |
| 8. Second semantic/docs/CI pass | All 30 handbook pages, active root/test/gallery/contract instructions, current refs, expanded checker and doc-only CI are reconciled in [D9 audit](d9-semantic-audit.md); actual final checks in [D9 acceptance](d9-acceptance.md). |
| 9. User build/cache/deploy/rollback handoff | [Concrete handoff](user-handoff.md) covers reviewed uncommitted revision, asset Git identity, matching runtime files, preserve data/secrets, staging/migrations/cache and previous-release restore. No remote operation or real native-device/provider check was performed. |

All V01–V36 are separately mapped, one row each, in the accepted
[D8 verification audit](d8-verification.md). D9's final gates check conservation of
its source and review hashes rather than asserting that a documentation change
reran those product checks. There is no remaining required native, mobile website,
remote deployment or live-provider work hidden in the repository acceptance.
