# D6 channel masking editor checkpoint — 28 October 2026

[Master plan](README.md) · [Enhancement contract](d6-enhancements-contract.md) · [Handoff](d6-handoff.md)

The channel title/thumbnail rule editor now uses the shared Settings shell,
current navigation, local Settings/rule search, structured configured rows and
one Save/Discard area. Explicit Remove rule retains the existing reset endpoint.
Title/thumbnail switches, optional whole-day upload age, indefinite hiding and
unknown-date behavior retain their existing meaning. Account/guest scope is
visible. Ordinary account forms still work without JavaScript, and unavailable
guest scripting has an explanation.

Web saves keep the original row lock and patch one channel in the latest raw
account document. Other rules, current channel names, unrelated preferences and
future native properties survive. Inactive known fields can be cleared without
erasing future properties; explicit removal affects only its target. Opaque
future representations reject an unsafe edit rather than being normalized away.
No database migration or native API wire change is introduced.

Failures retain literal invalid day strings and the proposed checkboxes. A text
input with numeric input mode also preserves a valid ` 7 ` draft after a session
error, while client/server validation still requires a bounded whole number. Missing
fields in failed older forms retain their submitted meaning. Guest saves require
durable storage read-back, retain drafts after denial, merge the latest list and
maintain the existing optional date-cache marker only after a confirmed save.
External updates change Discard's baseline while preserving dirty controls.
Cached-page, profile and removal boundaries invalidate stale callbacks.
Uncertain account writes block subsequent mutations until an explicit saved-state
check; failed reads retain the uncertainty and draft. No write retries occur.

The masking runtime previously reloaded guest Settings pages on cross-tab rule
changes. Settings pages now omit that content runtime, so editing a rule cannot
trigger that reload. Video/clip/listing surfaces retain their runtime. A shared
entry-limit check was also added to masking and SponsorBlock: adding a 1,001st
entry is rejected while existing entries remain editable/removable. This prevents
normalization from dropping a new entry and falsely reporting Saved.

## Evidence and limits

The [editor evidence](review/d6-masking-editor-evidence.json) and
[pending enhancement directory](review/d6-enhancements-pending/) record:

- 242/242 cumulative Chromium/Firefox desktop cases, followed by 42/42 focused
  cases on the final whitespace-preserving input and assertions. The full run's
  prior source phase is retained; the final focused subset proves this refinement.
- 33 masking/SponsorBlock spec examples and 28 storage units.
- Fresh production fixture/parser checks, normal/API-only type checks,
  formatting, generated references, documentation links and whitespace checks.
- Six manually inspected Light/Dark/enlarged RTL/error views.

Fresh guarded PostgreSQL checks exercise the production web handlers,
canonical JSON/HTML responses, endpoint CSRF, stale profiles, guest rejection,
raw/native preservation, concurrent row locks, literal drafts, uncertain database
failures and old ordinary forms.

The browser data/media are synthetic and requests are intercepted locally. The
database is task-owned and disposable. No deployed server, external metadata
service or physical native client was accessed. This checkpoint verifies the
editor; blocked channels, DeArrow identity/contributions, full enhancement
coexistence and D7–D9 remain required. Historical accepted manifests stay frozen.

Full coexistence still needs explicit verification of browsing/Back previews and
cached watch settings after account rule saves, alongside the other enhancement
precedence/lifetime requirements. This editor checkpoint does not accept those
remaining runtime paths.

## Inspected views

- [chromium-d6-masking-editor-light.png](review/d6-enhancements-pending/chromium-d6-masking-editor-light.png)
- [firefox-d6-masking-editor-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-masking-editor-dark-rtl.png)
- [chromium-d6-masking-invalid-light.png](review/d6-enhancements-pending/chromium-d6-masking-invalid-light.png)
- [firefox-d6-masking-invalid-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-masking-invalid-dark-rtl.png)
- [firefox-d6-masking-uncertain-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-masking-uncertain-dark-rtl.png)
- [chromium-d6-masking-stale-light.png](review/d6-enhancements-pending/chromium-d6-masking-stale-light.png)
