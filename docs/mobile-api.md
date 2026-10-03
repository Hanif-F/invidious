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

`PATCH /api/v1/auth/preferences` accepts only settings supported by the native app.
At least one field is required. Supported fields are:

- Booleans: `watch_history`, `save_player_pos`, `dearrow_enabled`,
  `dearrow_show_original`, `autoplay`, `listen`, `local`, `thin_mode`,
  `related_videos`, `extend_desc`, `latest_only`, `unseen_only`, `notifications_only`.
- `speed`: finite JSON number from 0.25 to 2.0; `quality_dash`: the existing web
  DASH quality values (`auto`, `best`, resolution values from `144p` through `4320p`,
  or `worst`). Android applies resolution choices as ceilings.
- `captions`: up to three bounded language-name strings, in priority order, matching
  the web names; empty strings mean no preferred language. `comments`: up to two
  sources (`youtube`, `reddit`, or empty). Android edits YouTube visibility while
  retaining the web's Reddit choice; it does not implement Reddit comments.
- `dark_mode`: empty (system), `light` or `dark`; `ui_density`: `balanced` or
  `compact`; `default_home`: null, empty (Search), `Popular`, `Trending`,
  `Subscriptions` or `Playlists`; `feed_menu`: up to four of those string values.
- `region`: two uppercase letters; `max_results`: integer 1–1500; `sort`: one of
  `published`, `published - reverse`, `alphabetically`, `alphabetically - reverse`,
  `channel name`, `channel name - reverse`.
- `default_playlist`: null/empty to clear, or a bounded playlist identifier.
- `sponsorblock_enabled` and the SponsorBlock maps described below.

Background playback and PiP are device-local. Unsupported web capabilities such as
chat replay, annotations, VR, interface localization and next-video queues are not
added to this native PATCH contract. The extension uses existing preference scopes
and storage; no migration or token renewal is required.
Clients send only changed fields. It locks the account, merges the
stored JSON (including unknown keys), and returns the merged object. Disabling
saved positions clears them in the same transaction. The existing POST endpoint
continues replacing the full preferences object and is unsuitable for native clients.

## Native SponsorBlock settings

Public segment reads use the existing `GET /api/v1/sponsorblock/:id` route, returning
`{segments: [{id, category, start, end}]}` with times in seconds. The server proxies
and caches SponsorBlock's skip segments; clients send no bearer token or cookies
to this route and never contact SponsorBlock directly. The eight supported categories
are `sponsor`, `selfpromo`, `interaction`, `intro`, `outro`, `preview`,
`music_offtopic` and `filler`. Submission/voting is outside this fork's capability.

Authenticated preference reads include `sponsorblock_enabled`, `sponsorblock_modes`,
`sponsorblock_colors` and `sponsorblock_channel_overrides`. The existing native
`GET:preferences` / `PATCH:preferences` scopes suffice; no token renewal or migration
is needed for SponsorBlock.

The preference PATCH endpoint accepts:

- `sponsorblock_enabled`: a JSON boolean.
- `sponsorblock_modes`: changed category keys with `auto`, `manual`, `marker` or
  `disabled` values; merge with stored modes.
- `sponsorblock_colors`: changed category keys with six-digit `#RRGGBB` colors;
  merge with stored colors. Colors remain global.
- `sponsorblock_channel_overrides`: changed canonical `UC` channel IDs, each mapped
  to `{enabled: boolean | null, modes: {category: mode}}` or `null` to remove it.
  Each supplied entry replaces only that channel's override; other channels survive.
  Nullable/omitted enablement and omitted category modes inherit global settings.
  An all-inherited entry is removed. Names are retained or resolved server-side;
  clients cannot submit names or arbitrary channel URLs to the PATCH endpoint.

For example, `{"sponsorblock_modes":{"sponsor":"auto"}}` changes only the Sponsor
category. Invalid categories, modes, colors, IDs, nested fields or types return 400
without applying any changes. The existing 16 KiB JSON limit still applies.
Channel lookup failures return 502 before account locking or writes. Account-row
locking preserves concurrent deltas and unknown preference fields. Bearer writes
remain scope-checked; cookie writes still require a session-bound CSRF token.

The web defaults remain opt-in with manual category modes. Android guests keep
global settings per instance locally; per-channel overrides require an account.
Active livestreams are excluded by the player. An older boolean-only preference
PATCH implementation must be updated before saving shared SponsorBlock settings.

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
