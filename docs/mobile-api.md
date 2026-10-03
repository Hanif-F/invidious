# Mobivious API additions

These additions keep YouTube extraction, stream resolution, channel/search requests,
and captions in Invidious and Companion. They introduce no database migrations.
Existing accounts and existing web APIs keep their behavior.

## Native sign-in

`POST /api/v1/mobile/login`, `Content-Type: application/json`:

```json
{"username":"your-name","password":"your-password"}
```

Successful response: `{"accessToken":"<signed JSON token>","username":"your-name","expiresAt":<Unix seconds>}`.
Send the token as `Authorization: Bearer <accessToken>` to authenticated APIs.
No browser cookie is issued. Responses use `Cache-Control: private, no-store`.
Tokens expire after 30 days in the signature and database, are revoked by existing
credential changes, and can revoke themselves at `POST /api/v1/auth/tokens/unregister`
with `{}`. Permissions cover viewing and managing preferences, subscriptions,
history, playback positions, playlists and DeArrow contributions/identity import; no token minting or account export/import.

The endpoint uses the existing password verifier, account-row transaction lock,
HMAC signer and shared IP/username throttle. Legacy usernames/passwords remain
usable. Login must be enabled. Invalid credentials return a generic 401, malformed
or oversized requests 400, disabled login 403, and throttling 429 with `Retry-After`.
JSON is limited to 16 KiB; passwords are never placed in URLs or server logs.
Invidious's existing auth middleware returns 403 for expired/revoked bearer tokens.

## Safe preference updates

`PATCH /api/v1/auth/preferences` accepts only boolean `watch_history` and
`save_player_pos`, `dearrow_enabled` and `dearrow_show_original` fields. At least one is required. Clients send only changed fields. It locks the account, merges the
stored JSON (including unknown keys), and returns the merged object. Disabling
saved positions clears them in the same transaction. The existing POST endpoint
continues replacing the full preferences object and is unsuitable for native clients.

## Native DeArrow contributions

All four routes below use the existing authenticated API middleware and return
`Cache-Control: private, no-store`. Bearer requests use signed token permissions;
cookie-authenticated writes still require a session-bound CSRF token. Native
tokens issued after this update include `GET;POST:dearrow/*` and
`PUT:dearrow/identity`. Existing tokens must be renewed by signing in again.

- `GET /api/v1/auth/dearrow/identity` returns `{ready: boolean, configured: boolean}`.
  This read never creates an identity and never returns a private ID.
- `PUT /api/v1/auth/dearrow/identity` accepts `{privateId: string}`. A blank string
  preserves the identity; otherwise import a valid private ID of 30–256 ASCII
  letters, numbers, underscores or hyphens. Success returns `{ok: true}`.
- `GET /api/v1/auth/dearrow/:id/submissions` returns the same `{titles: [...]}`
  contract as the web submissions route, including `title`, `original`, `votes`,
  `locked` and `UUID`, in upstream order.
- `POST /api/v1/auth/dearrow/:id` accepts `action` (`submit`, `upvote`, `downvote`).
  New titles require `title` and JSON boolean `confirmed: true`, representing all
  four guideline acknowledgements. Votes use `uuid` or JSON boolean
  `original: true`; the server resolves the exact title. Success returns `{ok: true}`.

JSON bodies are bounded at 16 KiB. The shared web/native service validates IDs,
1–110 character single-line titles, locked/downvote restrictions and identity
storage. It reuses migration 13 and the existing encrypted account identity and
dedicated key. No additional migration or private-ID preference is introduced.
Missing storage returns 503; malformed requests 400; unavailable submissions 409;
locked downvotes 403; upstream failures use sanitized messages.

Only explicit user actions send contributions. Clients must disable automatic
write retries because a timeout can follow upstream acceptance. Public trusted
title reads continue using `GET /api/v1/dearrow/:id`. See
[DeArrow contributions](dearrow-contributions.md) for storage setup and guidelines.

## Detailed history

`GET /api/v1/auth/history?details=true&page=1&max_results=30` returns saved history
entries in reverse watched order, with `video_id`, optional title/channel/date/duration
metadata and archived dates. Missing videos remain as entries with their ID.
Only local caches are consulted; viewing history never triggers YouTube lookups.
Without `details=true`, the endpoint continues returning an array of video IDs.

## Verification

The guarded disposable database harness `tests/database/accounts.cr` includes
native API checks in `mobile_checks.cr` and production auth middleware checks.
Use an empty database named `invidious_accounts_test`:

```sh
ACCOUNT_TEST_DATABASE_URL=postgres://user:password@localhost/invidious_accounts_test \
  crystal run tests/database/accounts.cr
```

Never point this harness at a production database: it deliberately recreates its
guarded disposable schema to test migrations and rollback behavior.
