# D6 enhancement editors and coexistence contract

[Master plan](README.md) · [D6 workstreams](d6-contract.md) · [Verification](verification.md)

This D6 workstream is locally accepted in the [D6 acceptance record](d6-acceptance.md). The implementation contract below remains authoritative. The existing
general Settings categories already own SponsorBlock defaults, DeArrow display
defaults and AI actions. Extend those editors; do not create another preference
authority or a second Save area for the same fields.

## Editors and navigation

- Keep SponsorBlock's master switch and all eight category modes/colors in its
  category. Link to the existing per-channel override destination. Give that
  destination the shared Settings shell, inherited/default values, explicit
  Save/Discard/reset, saved/error/draft states and profile-aware cleanup. Preserve
  its account preferences and guest-local override scopes.
- Keep DeArrow replacement/original defaults in its category. Provide dedicated
  identity management with an explicit import action and safe configured/setup
  status. Reuse the existing identity service and POST/scopes. Private IDs must
  never appear in ordinary preference documents, page configuration, exports or
  rendered saved values. Preserve existing identity encryption and account
  isolation. Map recognized old links/anchors to the owning editor.
- Render the existing AI fields as a compact page-group × Blocklist/Warnlist
  action matrix with the master control. Preserve discovery hide choices and
  library/channel/queue replacement semantics. Put counts, last success,
  stale/unavailable status and attribution behind an explicit disclosure using
  the existing cached service; no per-card requests.
- Migrate blocked-channel management to searchable, structured rows with explicit
  contextual actions. Preserve server authorization, direct channel access and
  ordinary forms. Migrate the existing channel title/thumbnail editor to the
  Settings shell, with clear title/thumbnail and upload-age rules, removal/reset,
  literal validation drafts and guest/account scopes.
- Add search entries and accurate current navigation for dedicated editors. Use
  the shared draft/navigation contract, normal destination links and one editor
  per setting. Preserve functional no-JavaScript account forms; explain any
  genuinely browser-only controls. Legacy web destinations remain usable.

## Contributions and runtime

Apply shared controls and a persistent close header to the existing contribution
dialog. Keep explicit draft review, acknowledgements, submission and votes;
identify locked/unavailable choices. Retain failed drafts, prevent duplicate or
automatic write retries after ambiguous outcomes, and invalidate stale responses
on profile/page/disposal changes. An optional enhancement failure must not stop
playback. Contribution strings, original title rows, tooltips, accessible names
and notifications must respect masking.

Preserve SponsorBlock master pause, category/color inheritance, automatic/manual
and marker modes, skipped-segment replay behavior, chapters and stream refresh.
Clip editing suspends skips and docking; ordinary behavior resumes afterward.
Preserve DeArrow's Hidden → DeArrow → Original cycle, disabled/pending/missing
states and masking precedence. Preserve manual blocks, membership visibility,
AI filtering, unresolved results and cached original-title behavior. Discovery
filtering must never silently remove or reorder personal library/queue entries.

Dedicated web writes must merge the latest account state, preserving unrelated,
native and unknown fields and concurrent edits. Keep native API scopes, payloads
and legacy settings round trips. Guest data must never be copied into accounts.

## Runtime freshness contract

Use one read-only owner-state projection for cached-page restoration and coalesced
cross-document change signals. `GET /preferences?format=runtime` reads current
account preferences/blocks or the actual guest cookie. It never creates an identity,
contacts enhancement providers or resolves per-card metadata. Its explicit projection
omits private identities, channel display names and unrelated/native/unknown fields.
Guest channel rules remain browser-local and are not imported into account state.
Private/no-store, profile guards and truthful unavailable responses apply.

Cached watch/listing markup retains title/channel/publication and thumbnail
metadata even before the account has a rule. This must not activate date-cache
queries, mutation observers, DOM scans or per-item metadata requests while no
rules apply. The controller remains available for the first later activation.
Guest storage events reconfigure the existing document and media instead of
reloading. Ordinary no-JavaScript masking stays server-rendered.

The response separates a configuration fingerprint from server time, so upload-age
reevaluation does not manufacture a preference change. Watch consumers must update
their existing controllers/media in place, including newly enabled/disabled rules,
and reject stale/profile/page/disposal replies. A failed optional check must not
stop playback or expose a title whose masking state is unknown. Retry is read-only.
Do not rebuild the player to refresh configuration.

Browsing consumers must not append or replay continuations from a different
visibility/order configuration. Unchanged Back restores its pages and scroll;
changed state uses the canonical page/explicit refresh boundary. Personal library
and queue occurrence order is retained. The initial preview-invalidation increment
passes 8 focused and 86 Settings/editor checks; it does not implement this full
cross-document/runtime contract yet.

## Acceptance

Verify the production handlers and actual browser behavior for inheritance,
validation, explicit saves/discards, failures, ambiguous writes, stale profiles,
identity isolation and relevant no-JavaScript forms. Inspect Light/Dark, desktop
fit, enlarged RTL and associated errors. Exercise filtering/masking/lookup
precedence and disabled-request behavior together with actual media, chapters,
clip previews, title cycles and contribution UI. Record guarded PostgreSQL and
cumulative regression/build evidence. D6 is complete only after all five
workstreams are accepted; D7–D9 remain subsequent stages.


## Current implementation notes

The AI matrix/status disclosure, SponsorBlock global/channel editors, channel
masking editor, blocked-channel manager and dedicated DeArrow identity editor
have verified local implementations. The
[SponsorBlock checkpoint](d6-sponsorblock-editor-checkpoint.md),
[masking checkpoint](d6-masking-editor-checkpoint.md),
[block checkpoint](d6-blocks-checkpoint.md) and
[identity checkpoint](d6-identity-editor-checkpoint.md) record their scopes.
Current identity evidence includes 280 cumulative desktop cases, 22 focused
identity cases, 13 DeArrow specs, guarded PostgreSQL conditional concurrency and
private HTTP routes, normal/API-only type checks and six inspected views.
Earlier editor evidence remains retained. Source/check snapshots live in
[pending enhancement evidence](review/d6-enhancements-pending/).

This does not accept the enhancement workstream or all D6. The [contribution checkpoint](d6-contributions-checkpoint.md) verifies voting/review,
masking and bounded lifetimes with 304 cumulative and 24 focused desktop cases.
The [Settings entry checkpoint](d6-settings-entry-checkpoint.md) verifies default
category navigation, old anchors and retained receipt compatibility. Full runtime
coexistence remains required.
Include browsing/Back previews and cached player configuration after account
rule writes in that coexistence verification. D7–D9 follow.

### In-progress cached watch presentation boundary

The remaining watch increment uses a separate optional, owner-bound presentation
read after the canonical owner check identifies a relevant content change. It
reads the already cached source video; a cache miss stays unavailable rather
than calling the full watch handler, fetching streams, recording history or
consuming notifications. The ordinary collection-wide AI/original-title helpers
retain their shared deadlines and disabled-request behavior. Masking-only,
SponsorBlock-only and inactive AI action changes do not request watch content.

The response replaces only Up next presentation and updates selected title and
thumbnail presentation on existing queue occurrences. It never fetches/rebuilds
a playlist to apply display preferences. Membership/manual discovery hide rules
must not remove desktop queue entries; native API and legacy HTML behavior stay
compatible. Unknown owner/content reads suspend advancement and expose an explicit
read-only Retry while playback continues. Responses are checked against the
current profile, owner fingerprint and document lifetime. The current source is
unaccepted until production fixture/route and real-player browser checks pass.

The current source now loads the owner coordinator on watch/listing pages, after
its existing consumers, and the watch presentation consumer on watch pages.
Initial server-rendered state needs no runtime GET. This rollout remains
unaccepted pending regenerated fixtures and final automatic/lifecycle/coexistence
checks. The fixture harness records actual production owner DTOs while rendering;
it does not derive authority from draft controls or guess saved defaults.

Watch optional-read feedback is shared below the title, so its read-only Retry
is reachable while any utility tab is selected. Unknown owner state suspends
queue mutations/advancement. After the owner is proven, a failed presentation
read does not disable independent explicit queue actions; Up next advancement
continues to wait for valid content. No queue occurrence is removed or reordered
by display preference changes.


### Final local acceptance

The final current-source 408/408 desktop run accepts automatic owner/watch
reconfiguration, cached browsing/Back, independent queue operations, clip/media
coexistence, auxiliary masking and the editor workstreams. See
[D6 acceptance](d6-acceptance.md) for verification phases and limits. Earlier
in-progress notes above are historical increments. D7–D9 remain subsequent work.
