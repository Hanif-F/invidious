# D6 same-player clip editor and library contract

[Master plan](README.md) · [D6 contract](d6-contract.md) · [Chat checkpoint](d6-chat-checkpoint.md)

This workstream follows the accepted chat checkpoint and is accepted in the
[clip checkpoint](d6-clips-checkpoint.md). D6 enhancement editors/coexistence and
D7–D9 remain required.

The watch Clip action temporarily replaces the selected utility view with an
editor. The watch controller owns the prior tab, empty-panel layout and return
focus; the clip controller owns its draft and preview. Opening must work when no
other utility exists. Hidden transcript/chat/queue readers must respect the
transition without creating a second media element. Preserve a draft when the
editor closes and reopens on the same page. Direct `/create_clip` remains a
usable ordinary form and the asset-loading/no-JavaScript fallback.

The common form retains literal title/time drafts, native title/eligibility and
5–120-second bounds, two range handles, editable timestamps and playhead capture.
Use one selected-boundary capture control instead of repeated earlier/later
button strips. Identify public publication and immutable bounds before Publish.
Use existing endpoints, session CSRF, scopes and response shapes. A definitive
validation rejection stays editable. A lost/ambiguous creation response is never
retried automatically or presented as failure with an immediately repeatable
Publish action; retain the draft and link to My Clips for explicit reconciliation.

Capture the original playhead, paused/playing state, looping and any existing
native clip bounds before editing/preview. Preview uses the original Video.js
instance, temporarily bounds playback to the selection and restores the prior
state on stop/close/disposal. Source refresh and direct/native seek paths must
respect the current bounds. Preview/edit positions must never enter local or
account full-video progress, completion/history or automatic queue transitions.
Suppress optional docking during editing. Changing profiles, page lifetime,
removing the editor or disposing the player must abort readers, invalidate late
writes and release owned handlers/bounds without restoring another profile's
state. Preserve existing native clip playback behavior and API bounds.

Migrate standalone creation/deletion, My Clips, channel clip cards and unavailable
source records to the shared design. Preserve creator attribution, source links,
owner-only deletion, bounded playback/looping and ordinary pagination/fallbacks.
Unavailable media must not erase the saved clip. Do not add extraction, editing
of published clips, import/export, federation or native embedding.

Before acceptance, prove same-media identity and restoration with actual synthetic
media, progress/queue/docking exclusions, range/keyboard/UTF-8 validation, literal
failed drafts, ambiguous response handling, profile/cache/disposal ownership,
standalone/no-JavaScript entry, public/owner boundaries and local guarded native
PostgreSQL checks. Inspect Light/Dark/RTL/enlarged desktop and relevant failure
views. Keep D6 enhancements and D7–D9 explicitly pending.

## Accepted implementation

The [checkpoint](d6-clips-checkpoint.md) and [manifest](review/d6-clips-evidence.json)
record 198/198 cumulative desktop cases, two supplemental range-style cases,
29 clip/player/progress/parser units, seven validator examples, 28 QoL cases,
guarded native PostgreSQL checks, fresh fixtures/type checks and fifteen inspected
views. Same-player previews, fractional native bounds/source refresh, progress/
queue/docking/SponsorBlock exclusions, literal standalone failed drafts, ambiguous
publication, guest/asset fallbacks and owner/library/unavailable flows are covered.
This acceptance covers clips; the [enhancement contract](d6-enhancements-contract.md)
is the remaining D6 workstream. Generic error pages remain D7; legacy dialog/test
retirement and broader consolidation remain D8. Earlier evidence is preserved.
