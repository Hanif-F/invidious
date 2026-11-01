# D6 DeArrow contribution dialog checkpoint — 29 October 2026

[Master plan](README.md) · [Enhancement contract](d6-enhancements-contract.md) · [Handoff](d6-handoff.md)

The watch More action now opens an on-demand contribution dialog using shared
buttons and pinned SVGs. Its close header stays above a separately scrolling body.
Reads distinguish loading, unavailable/malformed, empty and populated lists;
failed refreshes retain the last usable list. Scores retain their sign. Locked
downvotes and an original title without a submission have visible explanations.
Contribution availability stays independent of the title-replacement preference.
Guests/setup states link to DeArrow Settings. Without JavaScript the menu explains
the requirement and links to the ordinary identity form.

New titles require explicit Review, all four acknowledgements and Submit. The
literal draft remains intact through known failures and close/reopen. Returning
to editing clears the acknowledgements; the server receives the reviewed,
trimmed Unicode title. A confirmed acknowledgement clears the successful draft.
The dialog never claims to know votes cast elsewhere or a user's personal vote.

One request owns the dialog at a time. Known rejection allows an explicit retry.
An unknown outcome locks both vote directions for that target, or the same trimmed
title creation, for this page's lifetime. Refreshing rankings, close/reopen and
cached-page restoration cannot establish whether a vote was accepted and do not
clear that lock. Other targets or a different deliberate proposal remain available.
No automatic write retry is introduced. If a write was acknowledged but the read
fails, feedback preserves the accepted outcome and offers the usual explicit
refresh. Unconfirmed actions and unsaved drafts retain a page-departure warning.

Asset loading is bounded and explicitly retryable. Completed CSS is reused;
cancelled CSS/script callbacks and late module execution cannot automatically open
the dialog. Requests and callbacks are invalidated on close, page/profile changes
and removal. Same-profile cached drafts survive; profile/disposal clears drafts
and proposal rows. The player and media element remain alive throughout.

Masking covers original/proposed titles and generic vote labels, tooltips and
feedback. An explicit dialog-only reveal resets at close and leaves the watch
title cycle and document title unchanged. Server errors cannot inject proposal
text into feedback. Private identity resolution stays on the server, outside
ordinary preferences, browser storage and web responses. The web form additionally
checks an optional opaque browser profile and bounds its body to 8192 bytes;
older callers and native payloads/scopes remain compatible.

## Evidence and limits

The [contribution evidence](review/d6-contributions-evidence.json) records
304/304 cumulative desktop checks and 24/24 focused Chromium/Firefox cases, covering asset failure and
timeout, CSS/script cancellation, read states, Unicode review/consent, definite and
unknown outcomes, duplicate dispatch, close/cache/profile/removal lifetimes,
masking, ordinary role/no-JavaScript destinations, actual synthetic media and
Light/Dark/enlarged RTL desktop geometry. Guarded PostgreSQL production route
checks and 13 existing DeArrow specs have passed. Final fixtures and normal/API-only
type checks include the short status refinement; the native harness predates only
that rendering text, with the same backend/handler/store implementation.

All browser reads/writes/media are intercepted, credentials are synthetic and the
database is task-owned and disposable. No deployed server, external contribution
service or physical native client was accessed. Earlier checkpoint manifests stay
frozen. Legacy Settings destinations, full enhancement/runtime/Back coexistence
and D7–D9 remain required.


The final focused run includes the loader's generic asset-failure feedback and
stronger no-lookup/watch-title masking assertions added after the cumulative run.
The implementation otherwise matches the cumulative run. No broader suite is
claimed from these desktop/editor checks; D8 owns the final repository regression.

## Inspected views

- [Light list](review/d6-enhancements-pending/chromium-d6-contribution-list-light.png)
- [Light review](review/d6-enhancements-pending/chromium-d6-contribution-review-light.png)
- [Light unknown outcome](review/d6-enhancements-pending/chromium-d6-contribution-uncertain-light.png)
- [Dark enlarged RTL list](review/d6-enhancements-pending/chromium-d6-contribution-list-dark-rtl.png)
- [Dark enlarged RTL review](review/d6-enhancements-pending/firefox-d6-contribution-review-dark-rtl.png)
- [Dark enlarged RTL unknown outcome](review/d6-enhancements-pending/firefox-d6-contribution-uncertain-dark-rtl.png)
- [No-JavaScript menu](review/d6-enhancements-pending/chromium-d6-contribution-nojs-light.png)
