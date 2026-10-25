# Decisions, progress and evidence

[Master plan](README.md) · [Coverage](coverage.md) · [Tasks](tasks.md) · [Verification](verification.md)

## Current status

**Planning only. The comprehensive plan is written; implementation is not authorized. D0–D9 remain future work.**

Baseline: commit 22fc2a66. The plan includes the agreed design decisions, all 64 ECR templates, dynamic surfaces, feature and state contracts, task dependencies, verification requirements, and documentation cleanup before and after the overhaul.

Premature implementation and handbook cleanup changes were reverted on 26 October 2026 after the user clarified the scope. No source, stylesheet, script, locale, test or existing handbook changes remain. Only this planning package and its tracking exception in .gitignore remain. Earlier implementation artifacts are not evidence of an approved or completed overhaul.

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

## Planning evidence and limits

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

Continue planning, clarification and plan review only. Do not resume interface development, documentation cleanup, asset generation or test implementation because an earlier task description or goal mentions implementation. The user's latest scope correction controls. Begin D0 only after a new explicit implementation instruction. The eventual D9 pass must reconcile documentation again after the completed overhaul.
