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
history, playback positions and playlists; no token minting or account export/import.

The endpoint uses the existing password verifier, account-row transaction lock,
HMAC signer and shared IP/username throttle. Legacy usernames/passwords remain
usable. Login must be enabled. Invalid credentials return a generic 401, malformed
or oversized requests 400, disabled login 403, and throttling 429 with `Retry-After`.
JSON is limited to 16 KiB; passwords are never placed in URLs or server logs.
Invidious's existing auth middleware returns 403 for expired/revoked bearer tokens.

## Safe preference updates

`PATCH /api/v1/auth/preferences` accepts only boolean `watch_history` and
`save_player_pos` fields. At least one is required. It locks the account, merges the
stored JSON (including unknown keys), and returns the merged object. Disabling
saved positions clears them in the same transaction. The existing POST endpoint
continues replacing the full preferences object and is unsuitable for native clients.

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
