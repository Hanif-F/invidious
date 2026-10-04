# Mobivious API additions

These additions keep YouTube extraction, stream resolution, channel/search requests,
and captions in Invidious and Companion. Playlist subscriptions require migration 20.
Existing accounts and existing web APIs keep their behavior.

## Stream representation metadata

`GET /api/v1/videos/:id` adds optional public audio metadata to `adaptiveFormats`:
`audioTrack` contains available `id`, `displayName`, and boolean `audioIsDefault`
values; `isDrc` identifies stable-volume streams using the same flag/name/URL
detection as DASH manifest generation. Original false values are preserved.
The existing itag, type, bitrate, size, FPS and content-length fields remain intact.
Android matches metadata against supported manifest tracks; audio itags alone are
not unique across languages and processed variants. Old clients can ignore these
fields, and the new client falls back to manifest labels/roles on older servers.
Deploy this source update for reliable native audio enrichment. No migration,
new secret, authentication scope or sign-in renewal is required.

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
history, playback positions, playlists, channel blocking and DeArrow contributions/identity import; no token minting or account export/import.

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
  `dearrow_show_original`, `autoplay`, `continue`, `continue_autoplay`, `video_loop`, `listen`, `local`, `thin_mode`,
  `related_videos`, `extend_desc`, `latest_only`, `unseen_only`, `notifications_only`,
  `show_member_videos`.
- `speed`: finite JSON number from 0.25 to 2.0; `quality_dash`: the existing web
  DASH quality values (`auto`, `best`, resolution values from `144p` through `4320p`,
  or `worst`). Android applies resolution choices as ceilings.
- `video_codec`: `auto`, `av1` or `h264`, shared with the website's Preferred video
  codec setting. Native patches reject invalid strings and non-string values.
  Android applies the captured preference to DASH playback, respecting the target
  resolution before preferring a codec for fixed quality presets. Changes apply
  to the next video; in-player choices remain local to the current occurrence.
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
chat replay, annotations, VR and interface localization are not
added to this native PATCH contract. The extension uses existing preference scopes
and storage; no migration or token renewal is required.
Clients send only changed fields. It locks the account, merges the
stored JSON (including unknown keys), and returns the merged object. Disabling
saved positions clears them in the same transaction. The existing POST endpoint
continues replacing the full preferences object and is unsuitable for native clients.

## Native content visibility and channel blocking

Public search/channel/feed/video serializers add boolean `isMember`, using the
fork’s existing members-only detection. Video details and recommendations include
this field; playlist items retain their existing `isMember`. Missing metadata is
unknown and remains visible in Android. Premium status and video titles are not
membership indicators. No membership credentials or access are granted.

`show_member_videos` is an account preference, default false, accepted as a boolean
by the existing sparse preference PATCH. Existing preference scopes suffice. Guests
save the setting locally per instance. Android filters discovery, search, channel
uploads/streams, subscriptions, playlists and recommendations, while retaining
history entries and direct video access. Search has a separate device-local nullable
members override and blocked-channel inclusion flag, scoped to instance and account
or guest; neither is written to account preferences. Clearing the member override
uses the current browsing default. Public API reads remain unpersonalized; Android
filters original responses without changing pagination or playlist occurrence IDs.
Search sorting sends `sort=relevance` or `sort=views`, the values this fork supports.

The account block-list API uses the existing website table:

- `GET /api/v1/auth/blocked_channels` returns `[{authorId: string, author: string}]`,
  sorted by name and channel ID.
- `POST /api/v1/auth/blocked_channels/:ucid` accepts JSON `{name?: string}` and
  returns 204. The name is trimmed, bounded to 200 characters, and defaults to the
  channel ID. Repeated blocks retain the existing entry and name.
- `DELETE /api/v1/auth/blocked_channels/:ucid` returns 204, including for an already
  unblocked channel. Both writes require a canonical `UC` ID plus 22 ID characters.

Unknown POST fields, invalid name types or IDs, and oversized JSON are rejected
with 400 before writes. Existing authenticated middleware enforces token scopes,
CSRF for cookie writes, identity ownership and private/no-store responses. Native
login grants `GET:blocked_channels` and `POST;DELETE:blocked_channels/*`; it grants
no wider permissions. Deploy the updated server and renew existing native tokens
by signing out and in. Missing API routes or token scopes produce an update message
without clearing the session or pretending the action succeeded.

Android refreshes blocks at sign-in, foreground return and manager opening, keeps
confirmed snapshots per account/instance for offline use, and rejects delayed
responses after context changes. Block/unblock updates filtering immediately;
failed writes retain confirmed state. Only discovery, search and recommendations
are filtered by channel blocking. Subscriptions, playlists, history, direct links,
channel pages and current playback remain accessible. No new migration is needed.

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

`GET /api/v1/auth/history?details=true&organized=true&q=title&page=1` opts into
the organized response: `{entries, total, hasMore, today, timezone}`. `entries`
contain the same saved metadata as detailed history; `total` counts matching
entries across the entire history. Search trims the query and matches title or
channel name case-insensitively as literal substrings, before pagination. The
account's page size applies unless `max_results` is supplied.

The website and this API share ordering and filtering: Today, Yesterday, Last 7
days (2–6 days ago), Last 30 days (7–29 days ago), and Older, then newest saved
calendar date and account watch recency. Unknown and future watch dates are Older.
`today` is an ISO calendar date in the account's validated `timezone`, with UTC
fallback. Saved calendar dates are not timestamps and must not be shifted into a
device timezone. On a calendar-day change while loading more, Android reloads the
first page to keep groups consistent. Metadata recovery uses local caches only
and persists recovered values, matching the website. This mode uses existing
`GET:history` permissions and introduces no migration.

Older servers ignore `organized=true` and return a legacy array. Android keeps
basic viewing, including ID-only entries, and disables history search with a server
update explanation. Existing ID-array and detailed-array modes remain unchanged.

## Scoped search

Channel search uses the existing public
`GET /api/v1/channels/:ucid/search?q=term&page=1`, without bearer credentials.
Android presents its video results independently of the channel's Videos/Streams
tab and retains original response counts for pagination.

`GET /api/v1/auth/subscriptions/search?q=term&page=1` returns an array of cached
videos from the authenticated account's current subscriptions. Matching uses the
website's PostgreSQL full-text title/channel search. Results are ordered by
publication descending, then video ID ascending, in fixed 20-result pages. Empty
queries or empty subscriptions return `[]`. The query is bound as text and cannot
switch the endpoint to channel/public search using legacy operators. Feed-only
filters and ordering do not restrict this library search. The shared search
processor reads `channel_videos` directly so subscription changes do not depend
on materialized-feed refreshes. No upstream video lookup is introduced.

The endpoint requires the exact `GET:subscriptions/search` scope, added to new
native sign-in tokens. Existing native sessions must sign out and sign in after
deploying the server update. Missing routes and old-token scopes have distinct
Android explanations; neither grants broader subscription permissions. Responses
use the existing authenticated private/no-store handling. Android applies saved
search visibility overrides locally, while channel search follows direct-channel
visibility and history retains every entry. No migration or new secret is needed.

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

## Native next-video and queue settings

The sparse native preference PATCH accepts boolean `continue`, `continue_autoplay`
and `video_loop`. They use the existing web preference fields, GET/PATCH preference
scopes and account storage. Defaults are false, true and false respectively.
Android uses `continue` only for standalone recommendation advancement; explicit
playlist/mix/temporary queues advance independently. Automatic successors start
when `autoplay || continue_autoplay`; otherwise they load paused. `video_loop`
initializes a playback session's Repeat One default. Native Repeat All is a session
control for finite queues, with no new wire preference. Guests store defaults locally.

Existing playlist/mix JSON endpoints provide source metadata and original `index`
positions. Native playlist deletes use stable hexadecimal `indexId` occurrence
identifiers. Public guest reads omit credentials; signed-in reads use existing
authenticated playlist scopes, including private access. Guests use the public mix endpoint; signed-in RD reads
use the authenticated playlist endpoint for subscription metadata, without redirects. Playlist creation and add responses already return
identifiers/occurrence metadata, so no endpoint, token scope or migration is added.
Deploy the boolean allowlist update before saving the new native settings. Older
servers can still read/play and report a settings-update explanation on rejection.

## Playlist subscriptions, RSS and OPML

Deploy **migration 20** before enabling these native flows. `saved_playlists` has
primary key `(email, source_id)`, serialized cached metadata, optional seed and save
time, and a user foreign key with cascading deletion. Backfill preserves old
external rows; unsubscribe removes any matching caller-owned legacy external row.
Own IV playlists stay in `playlists`. A source can be subscribed independently by
multiple accounts, and saving it never copies its videos or transfers ownership.

| Authenticated method/path | Response and behavior |
| --- | --- |
| `PUT /api/v1/auth/saved_playlists/:id` | JSON `{}` or optional `seedVideoId`; idempotent subscribe with resolved metadata. An opaque RD mix requires its 11-character seed. |
| `DELETE /api/v1/auth/saved_playlists/:id` | Idempotent 204; removes only caller’s subscription. |
| `GET /api/v1/auth/feed/rss` | JSON `{"feedPath":"/feed/private?token=..."}` using the existing RSS token, relative to the selected instance. |
| `GET /api/v1/auth/subscriptions/export?format=rss` | Complete OPML with Invidious channel URLs; `format=newpipe` uses YouTube URLs. Includes uncached channel IDs. |
| `GET /api/v1/auth/playlists/:id/feed` | Atom snapshot of an owned IV playlist, including private playlists; another account gets 404. Existing 100-item playlist feed window is retained. |

Library/detail responses add `isOwned`, `isSaved`, actual `privacy`, `isMix` and
`seedVideoId` where applicable, while preserving existing fields and owned playlist
video arrays. `playlistId` also identifies mixes, alongside `mixId` on mix details.
Subscribed details retrieve the current source; a successful read refreshes cached
metadata without resurrecting a removed subscription. Another account’s private
IV playlist cannot be subscribed to or read. Only owners may edit or remove videos;
legacy authenticated DELETE of a saved source unsubscribes it. Missing/deleted
sources retain cached library metadata so the caller can still unsubscribe.

New native permissions are `PUT;DELETE:saved_playlists/*`, `GET:feed/rss` and
`GET:subscriptions/export`. Renew native tokens by signing out and in after the
server update. Atom uses the existing `GET:playlists/*` permission. Bearer identity,
CSRF-protected cookie writes and private/no-store responses remain enforced. JSON
is bounded to 16 KiB; malformed input is 400, hidden/missing IV sources 404 and
upstream subscribe failures 502 with a retry explanation.

Public RSS remains at `/feed/channel/:id`, `/feed/playlist/:id`, and
`/feed/private?token=...`; RD playlist feeds accept `continuation=<seed>` and export
a current mix snapshot. These routes are available in normal and API-only builds.
Web/native OPML and IV Atom share serializers; namespaces and entry times are
valid for empty and populated snapshots. Subscription-feed windows retain the
existing account filters, page size and query parameters.

Android keeps the secret RSS link in memory and explains that anyone holding it
can read the feed. It never includes the native bearer token in a shared URL/file.
Private-owned Atom is authenticated in-app, then exported as a snapshot using the
document picker or a restricted cache-only FileProvider with temporary read grants.
Canceled picker results, missing external apps, retries and stale account/instance
responses do not change playback. Built-in RSS reading, polling and upload alerts
are outside this contract.

## Native channel avatars

Identity-bearing records in existing discovery, search, channel, subscription,
video/recommendation, detailed-history and playlist/mix JSON responses can include
`authorThumbnails` using the established `{url, width, height}` array shape.
Supplied response URLs retain precedence. Missing thumbnails are filled from the
existing `channel_avatars` table (migration 21), using a single unique-ID batch read
across each response and its nested records. History identifies creators by its
existing `channel_id`; other records retain `authorId`.

Normal responses teach the optional cache URLs already obtained by existing
operations. No channel/video lookup, background fetch, age-based refresh, or
cache-miss fetch is introduced. Cache read/write failures do not fail responses or
fall through to upstream metadata requests. Existing payload fields, ordering,
pagination, playlist occurrence indexes, scopes and basic history-ID
response shapes are preserved.

Android parses the existing singular/array avatar formats, normalizes supported
YouTube image URLs to the selected instance's fixed-host `/ggpht` proxy, and uses
one 176-pixel variant where the URL supports sizing. Paths and query parameters
are preserved; redirects and bearer/cookie credentials are excluded. Ordinary
proxy image downloads may still contact YouTube's image CDN. Missing or failed
images show local placeholders, and thin mode omits avatar requests.

Deploy the additive API update and existing migration 21 for cached-list coverage,
then install a new Android build. Older servers remain usable with supplied
images/placeholders. No additional migration, endpoint or token renewal is needed.
