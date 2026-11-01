# D6 acceptance — 29 October 2026

[Master plan](README.md) · [Tasks](tasks.md) · [Coverage](coverage.md) · [Evidence](review/d6-enhancements-evidence.json)

**D6 is accepted for the local desktop overhaul. D7–D9 remain required; the
overall goal is not complete.** The Chromium/Firefox desktop suite passed **408/408 cases**, followed by **six
final focused cases** for the download-filename masking refinement. No deployed service or physical native client was
used.

## Utility and editor coverage

The [utility checkpoint](d6-utilities-checkpoint.md) covers transcript language,
search, exact line/seek/Follow and compact YouTube/Reddit threads with deliberate
continuation. The [chat checkpoint](d6-chat-checkpoint.md) covers synchronized
panel-only replay, filters/timing and its dedicated editor; native overlay fields
remain preserved. The [clip checkpoint](d6-clips-checkpoint.md) covers same-player
editing, preview/restoration, immutable playback, failed/uncertain drafts and
standalone fallbacks.

The dedicated [SponsorBlock](d6-sponsorblock-editor-checkpoint.md),
[masking](d6-masking-editor-checkpoint.md), [blocks](d6-blocks-checkpoint.md),
[identity](d6-identity-editor-checkpoint.md),
[contribution](d6-contributions-checkpoint.md) and
[Settings-entry](d6-settings-entry-checkpoint.md) checkpoints retain their own
guarded route, validation, privacy, native compatibility and visual evidence.
The AI action matrix/status disclosure and category ownership are included in
the enhancement workstream. Its completion now also includes the runtime below.

## Owner freshness and existing-media behavior

Watch/listing templates load one owner coordinator after their consumers.
Initial server-rendered state needs no extra owner GET. Same-profile hints carry
only version/profile/kind/sender/serial; no preferences, titles, drafts or tokens
travel through that channel. Cached returns and foreground fallback checks read
current account preferences/blocks or the actual guest cookie through
`GET /preferences?format=runtime`.

That private, read-only projection omits identities, channel display names,
native/unknown/unrelated fields and all provider/per-card lookups. Clock and
configuration fingerprints are separate. Foreign, failed, superseded and
disposed reads cannot apply settings. Upload-age masking is reevaluated against
server time; unknown states conceal titles/images until proof. Retry only reads.

Masking, DeArrow and SponsorBlock reconfigure their existing controllers. Disabled
title features have no inactive observers/scans/lookups. DeArrow deduplicates
page-local IDs with four concurrent reads, preserves unchanged explicit cycles
and refreshes known contribution changes. SponsorBlock retains segments, skip/
replay history and manual chapters while applying category/color/inheritance
changes. Clip editing continues to suspend skips and docking through canonical
changes, retaining its draft, bounds and the same actual media element.

Changed content preferences use a separate owner-bound optional watch presentation
read. It reads the cached source video and ordinary collection enhancement
helpers; a cache miss stays unavailable. It never invokes the full watch handler,
fetches streams, records history or consumes notifications. Only Up next and
selected title/thumbnail presentation change. Local Continue choice survives;
invalid content suspends recommendation advancement. Common read feedback below
the title keeps Retry accessible from every utility tab. Proven owners retain
independent explicit queue actions during optional presentation failures.

Desktop queues retain member-video occurrences and duplicate/order identity.
Display changes never refetch or rebuild that playlist. Native JSON and ordinary
HTML retain their existing contracts. Contribution rows, notification text,
queue labels, download filenames, player/poster/share/document metadata and cached title controls
follow masking. Unchanged browse checks preserve loaded pages/scroll; changed
visibility/block/history state retires descriptors and requires explicit normal
refresh. Private POST reconstruction never enters durable browse state.

## Verification and limits

- Cumulative desktop run: **408/408**, including actual Video.js media,
  automatic template startup, cached returns, queue/Up next, private searches,
  auxiliary masking, editor failures and unknown-write protections.
- Focused rollout verification: initial 72/76, then all four calibrated retained
  cases passed. The next full run found a real temporary-mask layout-class residue;
  its fix passed 24 focused Back/runtime cases and four masking unit cases before
  the final 408-case run. Earlier failures remain in the retained logs.
- The final audit then covered the hidden download filename: six focused browser
  cases prove actual FormData stays generic during masked/unknown/failed states,
  survives form reset, remains scoped when the main title is deliberately revealed,
  and follows trusted selected originals after restoration. Only this small hidden-
  field refinement postdates the cumulative run; no final-source 408-case claim
  is made for it.
- Fresh fixture build/render, normal/API-only type checks, Crystal formatting,
  JavaScript syntax, generated references, documentation links and whitespace pass.
  Production fixture DTO capture covers all 264 eligible watch/listing fixtures
  using 72 distinct owners, rather than guessed defaults.
- Guarded production PostgreSQL Settings/native routes include the pure runtime
  projection, owner/filter/original-title/cache-miss watch reads, absence of user
  history/notification/position changes and desktop member-queue/native parity.
  The disposable database guard ended at 24 public tables and zero other
  connections. Handler/store checks predate only final feedback markup and script
  loading; their backend semantics are unchanged.
- Inspected Light/Dark/enlarged RTL views include filtered originals, masked/AI
  duplicate queues, contribution owner-read failures and the shared Queue-active
  read-error feedback. Media and images are synthetic and all browser requests
  are intercepted.

Fourteen historical manifests remain byte-identical. D8 still owns broad legacy
test reconciliation (including seven previously recorded mobile/editor/tooltip
cases), dependency/unused-asset retirement and final repository-wide regression
and request/asset accounting. D9 owns the second complete semantic documentation
pass. Existing Crystal deprecation warnings and physical fullscreen/PiP/OS/native/
upstream/deployed verification limits remain explicit. These are subsequent
stages, not a claim that the whole overhaul has shipped or passed every old test.
