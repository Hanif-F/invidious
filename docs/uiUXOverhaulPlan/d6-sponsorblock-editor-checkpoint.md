# D6 SponsorBlock editor checkpoint — 28 October 2026

[Master plan](README.md) · [Enhancement contract](d6-enhancements-contract.md) · [Handoff](d6-handoff.md)

The global and per-channel SponsorBlock editors now use the shared Settings
components. This records editor verification only. Broader SponsorBlock/media
coexistence, masking, blocks, DeArrow identity/contributions and the remaining
D6 acceptance are still required; D7–D9 follow afterward.

Global defaults pair each category's mode and color in one table, with the master
switch and one category Save/Discard. Field names, inherited behavior and native
values retain their existing owners. Search focuses the corresponding control.
Literal invalid drafts and future native mode/color strings remain visible.

Channel management has normal lookup/navigation, inherited modes, account/guest
scope, searchable configured rows, Save/Discard, Reset and explicit canonical
read-back. Account writes patch one channel in the latest raw JSON, preserving
other channels, current names, unrelated preferences and future native data.
Ordinary forms remain functional without JavaScript; unavailable guest scripting
has a visible explanation. Storage failures retain editable guest drafts, and
external changes update Discard without replacing dirty controls. A cleared
browser list cannot be resurrected from an old page snapshot.

Uncertain account writes disable subsequent mutations until a deliberate saved
state check. Failed reads retain the draft and uncertainty, without write
retries. Profile changes, cached-page transitions and detached editors reject
late responses, even when a completed request ignores cancellation. The native
API endpoints and wire shapes have not changed.

## Local evidence

The [original editor snapshot](review/d6-sponsorblock-editor-evidence.json) preserves
this earlier checkpoint. Current checks live in
[the pending enhancement directory](review/d6-enhancements-pending/). The
[masking checkpoint](d6-masking-editor-checkpoint.md) adds channel-limit, opaque
record and omitted-field protection to both editors.

- Production Crystal/ECR fixture generation and its parser/preference checks.
- 222/222 cumulative Chromium/Firefox desktop cases, plus 22/22 focused
  SponsorBlock run covering the additional failed-read-back assertion.
- All 28 browser-storage units and 17 SponsorBlock/raw-merge spec examples.
- Fresh guarded PostgreSQL `accounts --settings-only`: channel raw merges and
  real web JSON/HTML handlers, CSRF/profile/guest rejection, literal failure
  drafts, canonical state and a trigger-induced uncertain database write; also
  existing category/admin/chat/native and concurrency checks.
- Normal and API-only production type checks, generated references, local
  documentation links and whitespace checks.

These are local synthetic browser/media and real disposable database checks.
They do not claim deployed-server, external SponsorBlock service or physical
native-client verification. The tests add no new upstream requests. Earlier
accepted checkpoint manifests remain frozen.

## Inspected views

- [chromium-d6-sb-defaults-light.png](review/d6-enhancements-pending/chromium-d6-sb-defaults-light.png)
- [firefox-d6-sb-defaults-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-sb-defaults-dark-rtl.png)
- [chromium-d6-sb-channel-light.png](review/d6-enhancements-pending/chromium-d6-sb-channel-light.png)
- [firefox-d6-sb-channel-dark.png](review/d6-enhancements-pending/firefox-d6-sb-channel-dark.png)
- [chromium-d6-sb-invalid-light.png](review/d6-enhancements-pending/chromium-d6-sb-invalid-light.png)
- [firefox-d6-sb-invalid-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-sb-invalid-dark-rtl.png)
- [firefox-d6-sb-uncertain-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-sb-uncertain-dark-rtl.png)
- [chromium-d6-sb-stale-light.png](review/d6-enhancements-pending/chromium-d6-sb-stale-light.png)
