# D6 DeArrow identity editor checkpoint — 28 October 2026

[Master plan](README.md) · [Enhancement contract](d6-enhancements-contract.md) · [Handoff](d6-handoff.md)

The dedicated `/preferences/dearrow/identity` page now uses the Settings shell,
current navigation and local search. DeArrow display defaults link to it while
retaining their own category Save area. Account-only metadata reports storage
readiness and whether an identity is stored; unavailable status never means no
identity. The Import action stays explicit. Replacing a stored identity requires
confirmation, and changing the entered ID clears that confirmation.

The original encrypted identity store and native service remain authoritative.
A web-only, account-bound HMAC of the ciphertext provides an opaque revision.
Conditional INSERT/UPDATE prevents a stale web form from replacing a newer native
or web import. Two concurrent web writers starting at one revision have one
winner. No schema migration, preference replacement or native payload/scope change
is introduced. Older import callers still work, including blank-as-keep behavior;
ordinary success redirects to the dedicated page.

Private IDs are never returned in metadata, HTML, JSON or saved-value fields, or
copied into application browser storage. The password input starts blank. Failed
browser submissions retain their literal input only in that live field; failed
ordinary forms render an empty field with re-entry guidance. Profile changes and
disposal clear the live credential. Cached-page lifetimes reject late reads and
writes, preserving a same-profile draft without a lingering Loading/Saving claim.

Unknown writes disable another import. An explicit status check cannot prove
which private ID was stored, so it never claims that the draft was saved. The
user can keep the saved identity and discard the unconfirmed draft, or reload.
No write retry occurs automatically. Known validation/session failures preserve
the live draft. Normal account forms also work when JavaScript is absent or the
editor asset fails.

## Evidence and limits

The [identity evidence](review/d6-identity-editor-evidence.json) records:

- 22/22 focused Chromium/Firefox identity cases and 280/280 final cumulative
  desktop cases, including ordinary forms, credential privacy, malformed state,
  stale/profile/cached/removal lifetimes and read-only recovery.
- 13 existing DeArrow encryption/contribution spec examples.
- Fresh guarded PostgreSQL production routes: owner isolation, endpoint CSRF,
  profile/revision/confirmation validation, native/web interoperability, actual
  conditional concurrent imports, unknown write failures, unavailable reads and
  ordinary forms. Existing Settings/admin/chat/channel checks pass too.
- Production fixture build/render, normal/API-only type checks, JavaScript
  syntax, Crystal formatting, generated references, documentation and whitespace.
- Six inspected Light/Dark/enlarged RTL/validation/uncertain/setup/unavailable views.

The database harness predates only the rendering dictionary's Discard status key;
backend/handler/store code is unchanged afterward. Final production fixtures,
browser behavior and normal/API-only checks cover that rendering refinement.
All browser data/media and credentials are synthetic, requests are intercepted,
and PostgreSQL is task-owned and disposable. No deployed server, external service
or physical native client was accessed. Earlier accepted manifests remain frozen.

This is an identity-editor checkpoint, not full DeArrow or D6 acceptance.
Contribution/voting UI, recognized legacy destinations and complete enhancement
runtime/Back coexistence remain required. The old Preferences full-form entry
still exists until that destination migration. D7–D9 follow.

## Inspected views

- [chromium-d6-identity-configured-light.png](review/d6-enhancements-pending/chromium-d6-identity-configured-light.png)
- [firefox-d6-identity-configured-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-identity-configured-dark-rtl.png)
- [chromium-d6-identity-invalid-light.png](review/d6-enhancements-pending/chromium-d6-identity-invalid-light.png)
- [firefox-d6-identity-uncertain-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-identity-uncertain-dark-rtl.png)
- [chromium-d6-identity-setup-light.png](review/d6-enhancements-pending/chromium-d6-identity-setup-light.png)
- [firefox-d6-identity-unavailable-dark-rtl.png](review/d6-enhancements-pending/firefox-d6-identity-unavailable-dark-rtl.png)
