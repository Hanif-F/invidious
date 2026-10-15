# HTTP and JSON API guide

[Documentation index](README.md)

The versioned API lives under `/api/v1`. [All routes](reference/routes.md) lists every method/path and implementation; [route inputs](reference/route-inputs.md) inventories literal request reads. This guide explains representations, authentication, common schemas and endpoint families. The [mobile contract](mobile-api.md) provides detailed fork-specific native schemas and compatibility rules.

## Conventions

Responses are usually JSON, but captions/storyboards can return VTT, annotations XML, feeds Atom/OPML and download selectors redirects. `format=html` on supported APIs returns a JSON object containing rendered HTML and continuation/navigation fields; it is not a universal switch for every endpoint. Check status and Content-Type before parsing. A 204 has no JSON body.

Canonical video IDs are 11-character YouTube IDs; channel IDs are normally `UC` plus 22 characters. Local playlist IDs start `IV`, local clip IDs `IVCL`, and mixes generally `RD`. Different handlers have different historical validation; use returned canonical IDs. Continuations are opaque and endpoint-specific. Most pages start at 1; playlist `index` is a zero-based offset, separate from the stable occurrence ID.

Time fields use their documented units: publication/created/updated/expiry timestamps usually Unix seconds; clip API boundaries seconds; replay/timing `offsetMs` milliseconds; database clip bounds milliseconds; detailed watch dates `YYYY-MM-DD`. Many metadata fields are optional/nullable; sparse upstream data is normal. Do not parse localized `publishedText`, abbreviated counts or labels as exact machine data.

`hl` influences localization and `region` is supported where handlers read it. Public APIs are not automatically personalized by account blocks, member visibility or AI page actions. Authenticated responses/errors use `Cache-Control: private, no-store`. Some public transient metadata endpoints also use no-store. The API handler adds wildcard origin CORS; this does not establish a credentialed cross-origin cookie API.

## Authentication and scopes

Native clients obtain an `accessToken` through `POST /api/v1/mobile/login` with JSON username/password. Registration capability/challenge is `GET /api/v1/mobile/registration`; `POST /api/v1/mobile/register` accepts the documented registration JSON. The returned token is a **signed JSON token string, not a JWT**. Preserve it and send `Authorization: Bearer <accessToken>`. Native sessions expire after 30 days and issue no browser cookie.

Browser sessions use `SID`. For cookie-authenticated writes, obtain `GET /api/v1/auth/csrf` and put its `csrfToken` in `X-CSRF-Token`. It expires after one hour and must be renewed after session changes. Bearer requests use scope validation and do not need this CSRF flow. `/auth/csrf` rejects bearer requests. Supplying both a bearer header and SID retains the bearer identity.

Scopes describe method and path after `/api/v1/auth/`, for example `GET:history`, `GET;PUT:playback/*`, `PATCH:preferences`, `POST:playlists`. Methods can be semicolon-separated and a trailing `*` permits the matching path prefix. An empty method set means all supported methods. Tokens must already hold a superset of requested generic child scopes. Native account management deliberately uses dedicated password-confirmed routes instead of unrestricted token minting.

Native login grants the explicit [Mobile::SCOPES](../src/invidious/routes/api/v1/mobile.cr) allowlist. It does not grant generic token listing/minting or full account export/import. Existing tokens do not gain new scopes when the server is upgraded; reauthenticate when newly added capabilities require them.

Example after obtaining a token through the documented sign-in flow:

```sh
curl -H "Authorization: Bearer $IV_ACCESS_TOKEN" \
  "$IV_ORIGIN/api/v1/auth/preferences"
curl -X PATCH -H "Authorization: Bearer $IV_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"save_player_pos":true,"video_codec":"auto"}' \
  "$IV_ORIGIN/api/v1/auth/preferences"
```

`IV_ORIGIN` is your instance origin and `IV_ACCESS_TOKEN` is a private client-held value. Do not put credentials in query parameters. This example enables storage; it is not run by the documentation tooling.

## Public video/media endpoints

| GET path | Selectors | Result |
| --- | --- | --- |
| `/videos/:id` | `region`, `local=1/true` | Detailed video object; local rewrites stream URLs where supported |
| `/captions/:id` | None, or `label`/`lang`, optional `tlang`, `region`, `title` | Caption list, or selected VTT; title requests attachment disposition |
| `/transcripts/:id` | None, or `label`/`lang`, presence of `autogen` | Transcript choices or selected transcript JSON |
| `/storyboards/:id` | None, or `width`/`height`, optional region | Storyboard descriptors, or VTT for a matching size |
| `/annotations/:id` | `source` | Archive/YouTube annotation XML, with ETag handling |
| `/comments/:id` | `source=youtube/reddit`, `sort_by`, `continuation`, `format`, `thin_mode`, `region` | Source-specific comment/thread JSON or HTML-wrapper JSON |
| `/clips/:id` | Legacy YouTube clip `region`/`local` | YouTube clip bounds plus video, or native clip object |
| `/live_chat/:id` | `offset_ms`, `continuation` | `{messages, removedIds, continuation}` for completed replay |
| `/videos/:id/downloads` | Optional `region` | `{video, allowed, reason, choices}` |
| `/videos/:id/download` | Exact `key`, optional region | Revalidated local media redirect or selected caption VTT |
| `/sponsorblock/:id` | None | `{segments:[{id,category,start,end}]}` |
| `/dearrow/:id` | None | `{title: string or null}` trusted title |
| `/dearrow/:id/submissions` | None | Browser-sign-in required despite the non-auth URL; proposal titles/votes/lock/UUID, anonymous 403 |

The comments `action` query is read but currently unused. YouTube defaults to top comments, Reddit to confidence; continuation/replies are source-specific. Transcript `autogen` is presence-based, so `autogen=false` still selects generated handling. Caption list entries use `languageCode`, while detailed-video caption entries use `language_code`; clients should respect the actual payload rather than assuming a global naming convention.

Detailed video serialization is in [video_json.cr](../src/invidious/jsonify/api_v1/video_json.cr):

| Field group | Fields/interpretation |
| --- | --- |
| Identity | `type`, `videoId`, `title`, optional `error` |
| Description/images | `description`, `descriptionHtml`, `videoThumbnails`, `storyboards`, `keywords` |
| Publication/counts | `published`, `publishedText`, `viewCount`, `likeCount`, `viewCountPrecision`, `likeCountPrecision`; `dislikeCount`/`rating` compatibility values are 0 |
| Creator | `author`, `authorId`, `authorUrl`, `authorVerified`, `authorThumbnails`, `subCountText` |
| Availability | `paid`, `premium`, `isMember`, `isFamilyFriendly`, `allowedRegions`, `isListed`, `allowRatings` |
| Classification | `genre`, `genreUrl`, `license` |
| Playback state | `lengthSeconds`, `liveNow`, `liveChatReplay`, `isPostLiveDvr`, `isUpcoming`, optional `premiereTimestamp` |
| Media | `dashUrl`, optional `hlsUrl`, `adaptiveFormats`, `formatStreams`, `captions`, optional `musicTracks` |
| Suggestions | `recommendedVideos` with creator, thumbnail, membership, duration and count/date metadata |

Format fields can include string `itag`/`bitrate`/content length, MIME `type`, URL, init/index byte ranges, container/encoding, FPS, resolution/size/quality labels and audio identity/language/DRC fields. Unknown metadata stays absent. Native download `key` includes track identity/DRC rather than relying on itag alone. See [stream metadata](mobile-api.md#stream-representation-metadata) and [playback](playback.md).

Replay messages have `id`, `offsetMs`, author/channel/handle, text, kind and amount. Continuations are nullable; malformed/oversized ones return 400. Invalid replay offset or offset beyond duration returns 400; unavailable replay 404; upstream failure 503. No chat posting or live-chat moderation endpoint is implemented.

## Public discovery endpoints

| GET path | Result and selectors |
| --- | --- |
| `/search` | Search-item array; shared `q`, `page`, `type`, `date`, `duration`, `features`, `sort`, `channel`, `sp`, `region` rules |
| `/search/suggestions` | `{query, suggestions}`; `q`, optional region |
| `/hashtag/:hashtag` | `{results:[...]}`; page/region |
| `/trending` | Video array; region/type |
| `/popular` | Instance popular-video array |
| `/channels/:ucid` | Channel metadata, banners/avatars, counts/description/regions/tabs, latest videos and related channels |
| `/channels/:ucid/latest` | Video wrapper using newest initial page; ignores supplied sort/continuation |
| `/channels/:ucid/videos`, `/shorts`, `/streams` | `{videos, continuation?}`; sort_by and continuation |
| `/channels/:ucid/playlists` | `{playlists, continuation?}`; sort/sort_by and continuation |
| `/channels/:ucid/podcasts`, `/releases`, `/courses` | Playlist-like wrappers; continuation |
| `/channels/:ucid/community`, `/posts` | Community result; continuation/format/thin_mode |
| `/channels/:ucid/channels` | `{relatedChannels, continuation?}` |
| `/channels/:ucid/search` | Channel search-item array; q/page/region |
| `/channels/:ucid/clips` | Public native clip array; page |
| `/post/:id` | Community post representation; optional ucid, format/thin_mode |
| `/post/:id/comments` | Comments; ucid required initially, then continuation, sorting/format |
| `/playlists/:plid` | Playlist metadata/videos and native source flags; index/page/continuation/format/listen |
| `/mixes/:rdid` | Mix title/ID/video array; continuation/format/listen |
| `/resolveurl` | `url` → available browse/channel/video/playlist/post/start-time fields and page type |
| `/stats` | Software metadata when disabled, collected statistics when enabled |
| `/ai/status` | `{lists:{blocklist: status,warnlist: status}}` |
| `/ai/channels` | `ids` (1–100 comma-separated canonical IDs), `lists` (blocklist/warnlist) → per-ID matches/resolution and list status |

Legacy channel comments paths redirect to community with 301. A redirected/unavailable channel can return 302 with Location and canonical author metadata. Public playlist lookup owner-checks private local playlists; `/auth/playlists/:plid` provides the authenticated variant. `/playlists/:plid` routes `RD` IDs through mix logic. HTML queue wrappers contain next-item/playlist HTML state used by the website.

AI status fields are `available`, `stale`, `channelCount`, `updatedAt`; channel classifications have `matches` and `resolved`. `resolved:false` must not be treated as a negative classification. The public endpoint classifies only; clients choose page actions locally. See [AI contract](mobile-api.md#ai-channel-filter).

## Authenticated account and preferences

| Method/path after `/api/v1/auth` | Input/result |
| --- | --- |
| `GET /csrf` | Browser-only `{csrfToken}` |
| `GET /preferences` | Preference JSON plus account-profile header |
| `POST /preferences` | Legacy full replacement object; 204 |
| `PATCH /preferences` | Strict supported sparse patch; returns merged stored JSON |
| `PATCH /chat_preferences` | Strict chat field patch; preference JSON, 400 invalid, 409 contention |
| `GET /chat_timing/:id` | `{offsetMs}`; zero default |
| `PUT /chat_timing/:id` | `{offsetMs:integer}` ±3,600,000; zero clears; returns offset |
| `GET /export/invidious` | Supported portable account JSON |
| `POST /import/invidious` | Portable JSON import; 204 success, 400 invalid video ID, 500 other import errors |
| `POST /account/username` | `{password, username}`; replacement credentials |
| `POST /account/password` | `{password, newPassword, passwordConfirmation}`; replacement credentials |
| `POST /account/delete` | `{password}`; 204 |
| `GET /account/sessions` | Managed session/token metadata |
| `POST /account/sessions/revoke` | `{id}` owner-checked; 204/404 |
| `POST /account/tokens` | `{password, scopes, expiresAt?}`; dedicated password-confirmed token issuance |

Native JSON helper requests require `application/json`, object bodies and a 16 KiB maximum. This limit applies where `Mobile.read_json` is called, not to every legacy API body. Account errors can include `code: invalid_password` or `session_expired` with 401, username collision 409 and throttling 429. Credential changes revoke previous tokens. Full schemas and permissions: [mobile account contract](mobile-api.md#native-registration-and-account-management).

## Authenticated history, subscriptions and library

The shared `seek_seconds` preference accepts integer 5, 10, 20 or 30 video seconds
(default 10). GET includes it; native PATCH rejects invalid values with 400.
Existing preference scopes and JSON storage apply. See [preferences](preferences.md)
for browser cookies, account sync and compatibility.

| Method/path after `/api/v1/auth` | Input/result |
| --- | --- |
| `GET /history` | Watched-ID array; page/max_results; details=true adds detail entries; also organized=true returns `{entries,total,hasMore,today,timezone}` with optional q |
| `POST /history/:id`, `DELETE /history/:id` | Mark watched/unwatched; 204; 409 when history disabled |
| `DELETE /history` | Clear watched/details and playback positions; 204 |
| `GET /playback` | `{positions:{id:seconds}, watched:[id]}` |
| `GET /playback/:id` | `{videoId,position,updatedAt}`; absent 404 |
| `PUT /playback/:id` | `{position:nonnegative integer}` <= Int32 max; 204; disabled 409 |
| `DELETE /playback/:id`, `DELETE /playback` | Clear one/all positions; 204 |
| `GET /feed` | `{notifications:[videos], videos:[videos]}`; page/max_results |
| `GET /feed/rss` | `{feedPath}` with private feed credential |
| `GET /subscriptions` | Creator array; include_stats=true requires history scope and adds subscriptionStats |
| `GET /subscriptions/search` | Subscribed cached-video search array; q/page |
| `GET /subscriptions/export` | OPML attachment; format=rss/newpipe |
| `POST /subscriptions/:ucid`, `DELETE /subscriptions/:ucid` | Subscribe/unsubscribe; 204 |
| `GET /blocked_channels` | Blocked channel records |
| `POST /blocked_channels/:ucid`, `DELETE /blocked_channels/:ucid` | Add optional name/remove canonical block; idempotent supported updates |
| `GET /playlists` | Owned plus saved source metadata with native flags |
| `POST /playlists` | `{title,privacy}`; 201 `{title,playlistId}` and Location |
| `GET /playlists/:plid` | Authenticated playlist lookup, same metadata/queue selectors as public variant |
| `PATCH /playlists/:plid` | Owner title/privacy/description update; 204 |
| `DELETE /playlists/:plid` | Delete owned local playlist or current account's saved reference, as applicable; 204 |
| `POST /playlists/:plid/videos` | `{videoId}`; 201 occurrence object and Location |
| `DELETE /playlists/:plid/videos/:index` | Stable hexadecimal occurrence indexId; 204 |
| `GET /playlists/:plid/feed` | Owner local-playlist Atom feed |
| `PUT /saved_playlists/:id` | `{seedVideoId?}`; resolve/save reference and return metadata |
| `DELETE /saved_playlists/:id` | Remove current account's bookmark; 204 |
| `GET /clips` | Owned clip array; page |
| `POST /clips` | `{videoId,title,startTime,endTime}` seconds; 201 and Location |
| `DELETE /clips/:id` | Owner deletion; 204, absent/not owned 404 |

Playlist privacy values are public/unlisted/private strings accepted by the enum parser. Ownership checks are independent from token path scopes. Library flags such as `isOwned`, `isSaved`, `isMix` distinguish edit/delete behavior. Playlist occurrence ID is not the displayed ordinal or upstream video ID. Detailed history metadata may contain null values and never requires per-row fetches just to fill a list.

## Authenticated enhancement and token endpoints

| Method/path after `/api/v1/auth` | Behavior |
| --- | --- |
| `GET /dearrow/identity` | Readiness/existence status only; never private ID |
| `PUT /dearrow/identity` | `{privateId}` through dedicated import |
| `GET /dearrow/:id/submissions` | Proposal list for authenticated contribution workflows |
| `POST /dearrow/:id` | Submit/upvote/downvote with documented title/UUID/original/confirmed fields |
| `GET /tokens` | API token session/issued metadata; excludes browser session credentials |
| `POST /tokens/register` | Scoped generic child issuance; JSON or supported form fields scopes/callbackUrl/expire |
| `POST /tokens/unregister` | Revoke current or permitted owned API token; never another account's session |
| `GET /notifications`, `POST /notifications` | SSE stream, optional topics; registered only when notifications enabled |

DeArrow writes are explicit and are not safely auto-retryable on ambiguous timeout. Token listing/revocation has special restrictions beyond ordinary path matching. Native sessions have dedicated account/token-management scopes and can self-revoke via unregister. See [security](security.md), [contributions](dearrow-contributions.md) and the implementation for exact optional legacy fields.

## Errors and client compatibility

Common JSON errors have `{"error":"message"}`. 400 generally means invalid request; 401 is used by native credential/account checks; 403 includes auth/scope/CSRF failures or disabled features; 404 includes absent and owner-hidden resources; 409 includes state/collision/conflict; 429 includes `Retry-After`; 5xx indicates server/upstream failures. Historical endpoints are not uniform: some return an empty enhancement result or 500/503. Imports report invalid watched-video IDs as 400 and other failures as 500; earlier import sections can already have been saved. Never infer success from body parsing alone.

Treat additions as optional, preserve unknown preference keys through safe patches, follow returned URLs/continuations and renew tokens for added scopes. Do not cache private content in shared storage. [Route references](reference/routes.md) cover browser actions, RSS, manifests, images and media outside this JSON guide. [Troubleshooting](troubleshooting.md) explains common integration failures.

## TV phone approval

Public POST `/api/v1/tv/pairing/start` and `/api/v1/tv/pairing/token` use bounded JSON and no-store responses. Browser `/tv` requires explicit CSRF-protected approval. See [contract v1](tv-pairing.md) for exact states, throttling, native credentials and API-only/deployment behavior.
