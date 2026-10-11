# Search, channels and feeds

[Documentation index](README.md)

Discovery combines upstream requests with locally cached subscription data. Public JSON discovery APIs remain unpersonalized; browser pages and native clients apply their supported account visibility settings separately.

## Home, popular and trending

`/` redirects/renders according to `default_home`; a blank home uses search. Feed navigation follows `feed_menu`. Popular uses the instance's channel-video collection and refresh job, so it reflects instance activity/data rather than an exact YouTube homepage. `popular_enabled` controls its availability. Trending requests YouTube data with optional region/category; empty or restricted upstream responses can yield no results.

`/feed/subscriptions`, `/feed/history`, `/feed/playlists` and `/feed/clips` are local account/library entry points. Their collection-specific behavior is in [accounts and library](accounts-and-library.md). Pagination preserves upstream result counts even if local visibility controls hide cards, so a filtered page may contain fewer entries or be empty while a next page still exists.

## General search

Use `/search?q=...`; `/results?search_query=...` accepts compatible YouTube-style input. `page` defaults 1. Search privacy uses POST form submission and browser-local choices; it does not prevent the server from contacting YouTube with the query.

| Parameter | Supported values/meaning |
| --- | --- |
| `q` | Search text; `search_query` is an alternate for regular searches |
| `type` | `all`, `video`, `channel`, `playlist`, `movie`, legacy `show` |
| `date` | `none`, `hour`, `today`, `week`, `month`, `year` |
| `duration` | `none`, `short` (under 4 minutes), `medium` (4–20), `long` (over 20) |
| `sort` | `relevance`, `views` |
| `features` | Comma-separated or repeated: `live`, `4k`, `hd`, `subtitles`, `commons`, `360`, `vr180`, `3d`, `hdr`, `location`, `purchased` |
| `region` | Upstream request region where the handler supports it |
| `channel` | Switches regular search into a channel-scoped search |
| `sp` | YouTube-compatible encoded filter data; decoded instead of ordinary filter fields |
| `include_blocked` | Browser visibility override `0` or `1` |
| `show_member_videos` | Browser visibility override `0` or `1` |

Feature aliases include `livestream`, `creative_commons`, `cc` and `3d`. Invalid enum selections fall back to defaults. These filters express what the client asks upstream, not a guarantee that upstream still supports every historical type/feature.

Legacy text operators remain accepted when explicit filters are otherwise default: `channel:...`/`user:...`, `type:...`, `date:...`, `duration:...`, `features:...`, `sort:...`, and `subscriptions:true`. Channel search strips legacy filter text but does not apply general YouTube search filters. Subscription search uses locally stored subscribed videos and requires an account.

Standalone supported YouTube URLs are interpreted as navigation in regular unfiltered search. Prefix a backslash to search literally. Search processors and protobuf filter encoding are in [search/](../src/invidious/search); the page/API use these shared rules.

## Search choices and filtering

Browser search UI choices are stored in profile-specific host-only cookies rather than global account preference fields. This avoids leaking one account's choices to another browser profile. General/channel/subscription search and pagination retain supported visibility choices. Some settings require a full preference save; per-search overrides do not rewrite the account's entire JSON.

Manual blocking, members-only visibility and AI classifications operate independently. AI hide applies to general search/hashtags, while channel/subscription searches use the replacement-only library/channel page group. Turning the AI master off preserves all actions and stops extra filter-triggered lookups. See [AI channel filter](ai-channel-filter.md).

## Channel pages and posts

Canonical channels use `/channel/:ucid`; handles and `/c/`, `/user/`, attribution/profile links resolve to the canonical channel. `/channel/:ucid/live` and legacy live paths resolve an available live video. Unknown future channel tab paths redirect to the channel home after specific routes have had a chance to match.

Tabs include videos, shorts, streams, podcasts, releases, courses, playlists, clips, community/posts, related channels and about. Tabs backed by upstream only appear/work when upstream provides them. Local clips are advertised independently, in website order between playlists and posts. Videos/shorts/streams and playlist-like tabs use upstream continuation tokens; clients must pass tokens through unchanged instead of inventing offsets.

Community pages and `/post/:id` display upstream posts and load supported comments/replies. `/api/v1/post/:id/comments` needs a channel ID for the initial request, or a continuation for subsequent requests. Channel author metadata and avatars are extracted from existing responses; missing avatars use placeholders rather than extra avatar-only requests.

## Notifications and refresh

Subscriptions use cached `channel_videos` and per-account subscription views. The channel job runs at `channel_refresh_interval` (default 30 minutes), with backoff on upstream errors; the feed job refreshes stale account views. Configured PubSubHubbub subscriptions can receive signed webhook updates. These paths are separate from direct live channel tab requests.

`enable_user_notifications` registers browser control and authenticated GET/POST SSE endpoints. A streaming connection delivers notifications; intermediaries must avoid buffering/compressing/caching the stream in ways that prevent delivery. Reconnection is a transport behavior, not evidence that a channel crawl succeeded. See [operations](operations.md).

## RSS, Atom and OPML

| URL | Meaning/authentication |
| --- | --- |
| `/feed/channel/:ucid` | Public channel Atom feed, rewritten to the instance |
| `/feed/playlist/:plid` | Upstream playlist, mix or local playlist feed; private local playlists require the owner browser context |
| `/feed/private?token=...` | Account subscription Atom feed using its feed credential; supports page/result count |
| `/feeds/videos.xml?channel_id=...` | Compatibility redirect; also accepts `playlist_id` or `user` |
| `/api/v1/auth/feed/rss` | Returns the private `feedPath` to an authenticated native client |
| `/api/v1/auth/playlists/:plid/feed` | Owner-authorized local playlist Atom feed, suitable for bearer clients |
| `/api/v1/auth/subscriptions/export?format=rss` | Invidious RSS-oriented OPML; `format=newpipe` emits compatible upstream links |

RSS routes remain in API-only builds. `params` on supported public/private feeds carries encoded watch query options. Mix feed lookup may require a seed/continuation. OPML contains subscription links, not video media or account credentials. A private feed URL exposes account subscription content without interactive login; do not publish it or log its token.
