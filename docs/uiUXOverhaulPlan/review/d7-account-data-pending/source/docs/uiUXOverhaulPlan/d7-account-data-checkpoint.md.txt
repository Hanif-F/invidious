# D7 account and data checkpoint

[Master plan](README.md) · [D7 contract](d7-contract.md) · [Coverage](coverage.md) · [Evidence](review/d7-account-data-evidence.json)

**Account, token/session, TV approval and data forms are locally verified. D7 as
a whole remains in progress.** Administrative/verification/recovery, legal/error/
message and embed surfaces remain, followed by D8–D9. Nothing has been deployed.

## Account and authorization behavior

Login, registration (with optional CAPTCHA), account credentials, deletion,
session management, token consent/results and TV approval use the shared design.
Ordinary forms retain the existing methods, CSRF purposes, login/registration
switches and current-password checks. Both username and password forms submit
without JavaScript. Literal failed rename usernames are retained and escaped;
password fields return empty. Credential changes explain revocation; deletion
explains permanent loss and export exclusions before the password confirmation.
Failures keep the deletion form and useful feedback. The Cancel URL is a safe
internal path, rather than a URL-form-encoded href.

Session rows identify issuance, current browser or API/browser type without
inventing devices, IPs or last-active data. They do not display raw credentials.
Explicit revocation review explains the consequence; required session IDs are in
POST fields. Older query-based callers remain accepted, and deletion remains
scoped to the authenticated owner. Account pages omit unrelated browse/runtime,
SSE and timezone modules. Responses are private/no-store with no-referrer.

Consent escapes every requested scope/callback context and shows the exact
callback, permissions and expiry. Cancel stays in the session manager. Malformed
and executable-document callbacks fail before issuance; relative, HTTP and native
custom callbacks retain their protocols and query values. Browser approval now
preserves native Int64 expiry values, including a safe exact timestamp display
outside the calendar range. Cookie API consent uses the same account shell;
bearer token JSON/scopes are unchanged. The explicit token result is escaped and
never copied into page configuration or browser storage.

The optional form guard prevents duplicate submits while leaving successful
controls and Approve/Deny submitters intact. It resets on cached return and does
not fetch, persist passwords/drafts or retry writes. TV changes concern the `/tv`
web approval page and compatibility checks; the native TV application is unchanged.

## Data behavior

An ordinary GET chooses one of seven existing import sources; the upload form
contains exactly its existing multipart field and puts CSRF first. Format hints
and source-specific guidance describe the actual parsers. Legacy multi-field
callers retain their processing order. JSON account export and subscription OPML
variants are grouped by real scope, with private-data and incomplete-backup guidance.

Known format rejections retain 415 and the selected source. Other parser/import
failures retain 500 and a generic source form without exposing uploaded contents
or building a public issue report from them. File inputs return empty and explain
that earlier sections may already be saved. A real two-part import check proves
that an earlier preference section remains committed when later history parsing
fails. No rollback, full-backup, retry or completion guarantee is invented.

## Evidence and limits

- **28/28 final Chromium/Firefox account/data cases** cover actual Light/Dark,
  1280–1920px fit, enlarged RTL/forced-color focus, literal failures, private tokens,
  ordinary password/username/login/signup/deletion/revocation/TV forms, CAPTCHA,
  native callback/expiry preservation, source GET/multipart/error flows and guard
  idempotence/cached-return reset.
- **8/8 focused shared-shell and Settings regressions** cover the representative
  Light/Dark and RTL matrices, canonical category read-back/duplicate protection,
  and all nine category forms with no-JavaScript fallback.
- The guarded production PostgreSQL account/data/mobile/security/TV harness passes:
  ownership, CSRF, failed drafts, callback/scopes/Int64 expiry, session rotation/
  revocation/deletion, private portable formats and real partial imports, plus
  existing native preference/account/private-playlist and real loopback TV HTTP
  approval/redemption/denial/throttle/revocation behavior. Final guard: 24 public
  tables, zero other connections in the owned disposable database.
- Fresh fixture build/render, normal/API-only type checks, JavaScript syntax,
  Crystal formatting, generated references, documentation and whitespace pass.
  Inspected account Light, authorization Dark, sessions Light, deletion Dark and
  enlarged RTL data views are retained with the source/check snapshots.
- Earlier phases are retained: initial browser 16/18 exposed copied fixture
  Preferences/User context (including false Light/RTL labels), fixed before the
  subsequent 24/24 pre-boundary run; the final 28 cases include Int64/partial-import
  refinements. Initial compile/nonce setup gaps and old D4 heading/TV wording
  assertions were corrected without weakening ownership/count/comparison checks.

All requests, media and credentials are synthetic/intercepted or task-owned local
fixtures. No deployed server, upstream provider or physical native TV/device was
used. Fifteen earlier evidence manifests remain unchanged. This checkpoint does
not claim a new full D6/legacy/repository regression run; D8 still owns that work,
asset/dependency retirement and the remaining recorded legacy failures. D9 owns
the final complete semantic handbook and requirements audit.
