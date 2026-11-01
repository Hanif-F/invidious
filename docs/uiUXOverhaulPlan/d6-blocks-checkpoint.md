# D6 blocked-channel manager checkpoint — 28 October 2026

[Master plan](README.md) · [Enhancement contract](d6-enhancements-contract.md) · [Handoff](d6-handoff.md)

Blocked channels now use the shared Settings shell, current navigation and local
Settings/channel search. Structured rows show the stored channel name, stable ID,
direct channel link and an explicit Unblock action. Long names wrap without
compressing the action. Empty and unmatched messages sit outside the list so only
channel rows are list items. Scope text explains discovery, search and Up next
filtering and preservation of direct access and personal library entries.

The web manager reads fresh canonical state before one explicit mutation. The
optional JSON response includes only owned channel rows, profile and endpoint
CSRF token. It neither replaces preferences nor changes native scopes or payloads.
The contextual `redirect=false` response remains exactly `{blocked: true|false}`,
and older ordinary forms may omit the new browser-profile guard.

Failed mutations retain the row and search. Ambiguous writes disable further
mutations until the user checks saved state; failed checks retain the uncertainty.
An unavailable list does not appear empty. Duplicate dispatches and late replies
across profile changes, cached-page lifetimes and removal are rejected. Writes
invalidate stored browsing previews. Normal account forms still work without
JavaScript or when the manager asset fails.

Contextual blocking now requires a valid boolean acknowledgement before hiding
discovery or Up next content. Known rejections allow an explicit retry; unknown
or malformed outcomes retain visible rows, disable another mutation for that
channel and offer a reload. They never retry a write automatically. Confirmed
Undo restores content and autoplay, while personal library entries remain in
place. Undo now uses the shared notice surface so the sidebar cannot cover it.

## Evidence and limits

The [editor evidence](review/d6-blocks-editor-evidence.json) retains the final
source, logs, request observations and inspected images:

- 258/258 cumulative Chromium/Firefox desktop cases, including 16 new manager and
  contextual block cases.
- 10/10 existing block, Undo, notice-timing and autoplay regressions. Their
  subscription/playlist/search preservation check now uses the actual owning
  page fixtures and verifies item identity and order.
- Final production fixtures, normal/API-only type checks, formatting, JavaScript
  syntax, generated references, documentation links and whitespace checks.
- Fresh guarded PostgreSQL production-route checks for owner isolation,
  canonical/legacy JSON, endpoint CSRF, stale profiles, invalid/literal requests,
  idempotence, native interoperability, uncertain writes, ordinary forms and
  unavailable reads. Existing Settings/admin/chat/raw concurrency checks pass too.
- Eight inspected Light/Dark/enlarged RTL/error/empty/unavailable/Undo views.

An earlier cumulative run passed 257/258 with a Firefox account-navigation
interruption. Its isolated two-browser recheck passed; the final full run above
is the acceptance run. No production profile behavior was changed for that test.
The final database/fixture builds include the list-semantics refinement. The
API-only type check predates only that web-template refinement, which is excluded
from API-only compilation.

Verification uses synthetic browser data/media, intercepted requests and a
verified task-owned disposable PostgreSQL container. No deployed server, external
metadata service or physical native client was accessed. Earlier accepted
manifests remain frozen. This accepts the block editor, not full D6: DeArrow
identity/contributions, recognized old destinations and full filtering/masking/
media/Back coexistence remain required. D7–D9 follow.

## Inspected views

- [chromium-d6-blocks-filled-light.png](review/d6-enhancements-pending/chromium-d6-blocks-filled-light.png)
- [firefox-d6-blocks-filled-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-blocks-filled-dark-rtl.png)
- [chromium-d6-blocks-invalid-light.png](review/d6-enhancements-pending/chromium-d6-blocks-invalid-light.png)
- [firefox-d6-blocks-uncertain-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-blocks-uncertain-dark-rtl.png)
- [chromium-d6-blocks-empty-light.png](review/d6-enhancements-pending/chromium-d6-blocks-empty-light.png)
- [firefox-d6-blocks-unavailable-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-blocks-unavailable-dark-rtl.png)
- [chromium-d6-blocks-context-discovery.png](review/d6-enhancements-pending/chromium-d6-blocks-context-discovery.png)
- [firefox-d6-blocks-context-library.png](review/d6-enhancements-pending/firefox-d6-blocks-context-library.png)
