# D8 acceptance — 1 November 2026

[Master plan](README.md) · [Journey audit](d8-verification.md) · [Test reconciliation](d8-test-audit.md) · [Evidence manifest](review/d8-evidence.json)

D8 is locally complete. The complete declared frontend suite passes **902/902**
with zero failures, cancellations or skipped cases. The complete Crystal runs pass
**300 Spectator and 137 standard examples**. Fresh normal/API-only application
builds, normal production fixtures, API-only recovery fixtures and the complete
guarded production backend harness pass. D9 and overall goal acceptance remain
required; this working tree has not been committed or deployed.

## Consolidated implementation

Browser pages now have one shared shell, listing/card/row presentation and player
design. The transitional presentation flag and prototype pages are gone. Ordinary
native/API HTML retains its compatible thin behavior; raw legacy/native cosmetic
preferences survive without browser controls or automatic rewrites.

All **38 retired files** have retained pre-removal source copies. The final scan
of **398 first-party runtime files** finds no caller of those files, no transitional
flag, duplicate rich menu, wide alias or first-party Pure/Ionicons/Diary dependency.
Necessary player/vendor plugins, annotations, VR, captions and licensing remain.
Shared shell primitives own menus; contextual actions own dispatch once. Actual
repeated-script checks preserve the same media, controls, key/theme ownership,
canonical block/Undo writes and cached/disposed lifetimes.

Reconciliation exposed and corrected real issues: the player sharing object lost
its shared reference after scope isolation; malformed category values could be
accepted as Saved; category descriptions/public feature search were incomplete;
retired player classes left timeline targets inconsistent; verified creator names
missed the truncation selector. Current tests cover their actual owners and
failure behavior. No unreachable interface was kept solely for old selectors.

## Complete verification and provenance

The [V01–V36 audit](d8-verification.md) maps every required journey to the current
checks. Ten final synthetic Light/Dark representative and enlarged RTL/forced-color
images were inspected. The approved D1 visual direction is retained.

The original 349 UI cases are all accounted for: 282 retained cases across 140
source families, 67 explicit mapped replacements and two new ownership cases give
284 current UI cases. Every named replacement in the clip/style/chat/QoL maps is
present in the final passing TAP. Native/legacy compatibility is also tested by
real production HTTP/database code; retired browser presentation is not treated
as a reason to remove native behavior.

Failed phases remain evidence. The first broad attempt was interrupted after
113 observed failures and is not a completed baseline. The later retained UI audit
was 197/293. Subsequent complete-file phases, focused corrections and two 901/902
combined runs are separate from the final **902/902** run. The two combined failures
were stale Admin markup and a block fixture returning the old canonical state.
The final fixtures use valid channel IDs and actual production before/after DTOs;
Block and Undo preserve subscribed, owned and explicitly included search rows.
No phase totals are added together to claim a complete pass.

The fresh backend harness verifies real permissions, native scopes, CSRF, row-lock
concurrency, private playlists/embeds, required-login/admin/YAML boundaries,
category/native/unknown preference preservation, identity/contribution privacy,
credentials/sessions/imports and TV redemption. The exact task-container guard
then confirms five empty expected tables and zero other clients. All database and
browser data are synthetic and local.

## Asset and request accounting

At the baseline's matching gzip level 9, comparable CSS/JS/Diary assets change from
**69 files / 285,854 gzip bytes** to **66 files / 199,050 gzip bytes**, a reduction of
**86,804 bytes**. Current icons/remaining fonts total 6,160 gzip bytes; vendor player
assets total 789,725 gzip bytes. Those are separate inventories, not hidden additions
to the comparison. No arbitrary byte threshold or deployed transfer claim is made.

Representative Chromium request counts in both modes are:

| Screen | D1 checkpoint | Current production page | CSS / JS / sprite requests now |
| --- | ---: | ---: | --- |
| Browse | 25 | 30 | 3 / 12 / 1 |
| Watch | 46 | 57 | 13 / 33 / 1 |
| Playlist | 16 | 30 | 3 / 17 / 1 |
| Settings | 13 | 12 | 1 / 8 / 1 |

The D1 checkpoint predates the complete production behavior. Current pages add
profile/owner reconciliation, cached browsing and selection, actual Library forms,
shared player controls and enhancement lifetimes. Request growth is explicitly
reported alongside the reduced total compressed inventory. These intercepted
fixture counts include media/metadata and browser-specific requests; they do not
measure a deployed cache, latency or per-page bytes. Disabled/no-per-card metadata,
lookup coalescing, lazy optional readers and one-player budgets have direct tests.

Nineteen preceding manifests and 786 historical review files are retained. The
persistent resumed conservation inventory and frozen-digest checks describe their
precise scope. /tmp loss after the device restart did not become fabricated build
or test evidence: final tools and the complete backend/frontend checks were rerun
with persistent logs. Existing compiler deprecation warnings remain documented.

D9 now owns the final semantic handbook pass, every coverage-row reconciliation,
documentation CI, active screenshot guidance and build/cache/deployment/rollback
handoff. No remote/upstream/physical-device or native-TV-app work is claimed.
