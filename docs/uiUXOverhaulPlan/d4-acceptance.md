# D4 acceptance record

[Master plan](README.md) · [Tasks](tasks.md) · [Coverage](coverage.md) · [Progress](progress.md)

D4 is complete. The final full Chromium/Firefox suite passed 90/90 cases. The [evidence manifest](review/d4-evidence.json) records the cumulative source snapshot, exact cases, commands, outcomes and retained screenshot hashes.

## Implemented behavior

Subscriptions use explicit view filters without changing Library defaults. Incoming events update an in-page notice and an explicit Refresh action. Browser permission controls and their guidance live inside More. Profile-owned SSE leases, bounded reconnect, deduplication, membership verification and cached-page cleanup replace header ticker assumptions. Unresolved channel identity cannot produce an OS notification.

The subscription manager uses cached statistics and aligned rows, real single unsubscribe forms and on-demand bulk selection. Partial failures remain selected. No per-channel network requests are made to render or sort the manager.

History uses date-grouped rows, scoped search, timezone-aware grouping and explicit unknown metadata. Recording and playback-position sync remain independent. Recording-disabled history does not expose mutation actions, and enabled position sync can still draw progress. Clearing history and positions is one transaction, including native clearing; rollback preserves both on failure.

The playlist library separates My playlists from Saved references. Cached saved details are identified, unknown mix counts are not invented, empty covers have a safe fallback, and unsaving a reference cannot delete its source. Create/edit forms validate title bytes, privacy and description size, preserve literal drafts and distinguish confirmed success from uncertain writes. Guest/public/unlisted/private access is enforced by production handlers and remains compatible with native/public API and embed privacy contracts.

Owned playlist rows use one subtle grip with pointer threshold, insertion feedback, edge scrolling and keyboard pickup/move/drop/cancel. Server writes lock and validate the parent playlist, preserve duplicate occurrences and large decimal IDs, and retain unloaded neighbors. Canonical positions reconcile every loaded row after a confirmed move/add/remove. Concurrent limits, stale anchors, permission failures and transaction rollbacks cannot silently invent an order.

Selection is page-owned and appears on demand in signed-in collections, discovery, search, history and manager rows. Select all covers loaded items; later batches start unchecked. Writes run sequentially and preserve partial failures. Pending selection and grip writes exclude each other. Cached-page interruption stops the remaining batch even if a transport ignores abort. An ambiguous creation or occurrence addition offers read-only reconciliation and cannot be blindly retried in the same document.

## Verification

The evidence manifest records commands, outcomes, source hashes and retained images. The guarded PostgreSQL harness already passed playlist ownership/CSRF/precision/occurrences/concurrency, add/remove/delete rollback, quota races, draft validation, private bounds, reference isolation, history-position clearing, cached manager statistics, import/feed invariants and existing private/API/embed security checks. The independent history migration/metadata/date/isolation/import harness also passed.

The final normal and API-only Crystal type checks passed with four existing Time.monotonic deprecation warnings each. Relevant specs passed 26 search examples and 15 history/web-preference examples. Browser storage passed 26 cases, and the remaining QoL suite passed 28 cases. Full fixtures preserve all ten frozen public comment JSON payload hashes while deliberately migrating their HTML.

## Visual review and scope

Manual review covered light/dark library cards, owned occurrence rows, subscription controls, manager statistics, grouped history, mix rows, create/edit forms and separate delete/unsave confirmations, plus enlarged RTL forms. The final screen matrix runs Chromium and Firefox at 1280, 1440 and 1920 pixels. It verifies bounds and real mix-save form fields. The eight D1 user-approved reference images remain byte-for-byte unchanged.

| Screen | Light | Dark |
| --- | --- | --- |
| Library | [Light](review/d4-library-light-1440.png) | [Dark](review/d4-library-dark-1440.png) |
| Playlist | [Light](review/d4-playlist-light-1440.png) | [Dark](review/d4-playlist-dark-1440.png) |
| Subscriptions | [Light](review/d4-subscriptions-light-1440.png) | [Dark](review/d4-subscriptions-dark-1440.png) |
| History | [Light](review/d4-history-light-1440.png) | [Dark](review/d4-history-dark-1440.png) |
| Manager | [Light](review/d4-manager-light-1440.png) | [Dark](review/d4-manager-dark-1440.png) |
| Mix | [Light](review/d4-mix-light-1440.png) | [Dark](review/d4-mix-dark-1440.png) |
| Create | [Light](review/d4-create-light-1440.png) | [Dark](review/d4-create-dark-1440.png) |
| Edit | [Light](review/d4-edit-light-1440.png) | [Dark](review/d4-edit-dark-1440.png) |
| Delete | [Light](review/d4-delete-light-1440.png) | [Dark](review/d4-delete-dark-1440.png) |
| Unsave | [Light](review/d4-unsave-light-1440.png) | [Dark](review/d4-unsave-dark-1440.png) |

Additional reviewed states: [enlarged RTL create](review/d4-create-dark-rtl-enlarged.png), [enlarged RTL edit](review/d4-edit-light-rtl-enlarged.png), [stale order](review/d4-playlist-stale-1440.png), [partial unsubscribe](review/d4-manager-partial-1440.png), [permission feedback/focus](review/d4-permission-menu-1440.png) and [new-upload notice](review/d4-subscriptions-notice-1440.png).

This is acceptance of D4 library/subscription workflows. Watch/player, embed visual migration, account/import screens and replay chat retain their D5–D7 owners. Legacy watch-only widgets and obsolete foundation assets remain explicitly assigned for migration/removal in D5/D8. Mobile web is deferred by the plan. Fixture media, SSE and network failures are controlled tests; they do not prove external upstream availability or native-app end-to-end behavior. Nothing has been deployed.
