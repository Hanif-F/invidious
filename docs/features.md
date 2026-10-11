# Feature catalog

[Documentation index](README.md)

The following inventory covers the user-visible capabilities implemented in this checkout. Instance settings, upstream availability and token permissions can restrict access.

## Discovery and browsing

| Feature | Behavior and entry point | Details |
| --- | --- | --- |
| Configurable home/navigation | `/` selects a configured home; feed menu entries follow preferences | [Preferences](preferences.md) |
| Popular | `/feed/popular` uses locally collected channel-video data; can be disabled | [Discovery](search-and-feeds.md) |
| Trending | `/feed/trending` requests upstream trending content with region/category choices | [Discovery](search-and-feeds.md) |
| Search | `/search` and `/results` support content type, date, duration, features and relevance/views sorting | [Discovery](search-and-feeds.md) |
| Search privacy | POST-based browser search reduces query exposure in the URL; upstream still receives the search text | [Preferences](preferences.md) |
| Smart pasted links | Supported YouTube URLs in general search become navigation; leading backslash inhibits interpretation | [Discovery](search-and-feeds.md) |
| Scoped search | Search within a channel, subscribed videos, watch history or playlist item selection | [Discovery](search-and-feeds.md) |
| Hashtags | `/hashtag/:hashtag` lists upstream hashtag results with pagination | [Discovery](search-and-feeds.md) |
| Channel tabs | Videos, shorts, streams, podcasts, releases, courses, playlists, clips, posts/community, related channels and about, when available | [Discovery](search-and-feeds.md) |
| URL compatibility | Handles, legacy channel names, short/watch/live URLs, attribution links and embed redirects | [Route reference](reference/routes.md) |
| Community posts | Channel posts and individual post pages, including comment loading | [Discovery](search-and-feeds.md) |
| Channel avatars | Learn existing upstream avatar URLs, use shared persistent cache and deterministic text placeholders | [Frontend](frontend.md) |

## Watching and media

| Feature | Behavior | Details |
| --- | --- | --- |
| Video player | Video.js with custom controls, progress, fullscreen, rate, volume, quality and codec choices | [Playback](playback.md) |
| Adaptive streams | DASH/HLS, separate video/audio representations, metadata and proxy routes | [Playback](playback.md) |
| Audio-only listening | Select listening mode and audio/language tracks when supplied by upstream | [Playback](playback.md) |
| Stable Volume variants | Distinguish DRC/stable-volume audio from original variants; availability depends on metadata | [Playback](playback.md) |
| Captions and transcripts | Choose caption tracks, download VTT, browse transcript text and seek | [Playback](playback.md) |
| Chapters | Manual timestamp chapters from descriptions, current chapter and seek-bar boundaries | [Playback](playback.md) |
| Storyboards | Preview images and VTT storyboard references | [API](api.md) |
| Legacy annotations | Optional archived annotations, including subscribed-channel preference and caching | [Playback](playback.md) |
| VR | Projection-aware VR support for supported streams/browsers | [Playback](playback.md) |
| Comments | YouTube/Reddit source preferences, continuation/replies and sorting | [Playback](playback.md) |
| Replay chat | Archived livestream chat synchronized to video, filters, overlays and timing offsets | [Playback](playback.md) |
| Queue and next video | Playlist/mix queues, occurrence-aware current item, owner removal, loop/autoplay/continue controls | [Playback](playback.md) |
| Watch indicators | Watched state and saved progress displayed on supported cards | [Accounts and library](accounts-and-library.md) |
| Position sync | Optional account-backed resume with browser fallback and profile isolation | [Playback](playback.md) |
| Embeds | `/embed/:id` exposes a player with query overrides; private playlist ownership still applies | [Playback](playback.md) |
| Downloads | Browser downloads and native catalogs for separate adaptive audio/video and caption tracks | [Playback](playback.md), [native contract](mobile-api.md#native-downloads) |
| Player diagnostics | Stats for nerds panel reports available player/stream state locally | [Playback](playback.md) |

## Accounts and local library

| Feature | Behavior | Details |
| --- | --- | --- |
| Sign-up/sign-in | Local usernames, password validation, optional CAPTCHA, browser sessions and native login | [Accounts](accounts-and-library.md), [security](security.md) |
| Account settings | Rename, password change, account deletion and current-password confirmation | [Accounts](accounts-and-library.md) |
| Session/token management | Review/revoke sessions, authorize scoped API tokens and password-confirmed native administration | [API](api.md), [security](security.md) |
| Subscriptions | Independent channel subscriptions and subscription manager, including native directory statistics | [Accounts](accounts-and-library.md) |
| Notifications | New subscribed-video state and server-sent event streams, subject to server configuration | [Discovery](search-and-feeds.md) |
| History | Watched IDs plus retained title/channel/date/duration metadata, date groups, local timezone and search | [Accounts](accounts-and-library.md) |
| Owned playlists | Public/unlisted/private local playlists; add/remove occurrences and edit metadata | [Accounts](accounts-and-library.md) |
| Playlist subscriptions | Per-account bookmarks to YouTube playlists, mixes and accessible local playlists | [Accounts](accounts-and-library.md) |
| Clips | Immutable public local clips, owned collection and channel clip listings, bounded player/editor | [Native clips](native-clips.md) |
| Data exchange | Invidious JSON, supported YouTube exports, FreeTube and NewPipe imports; subscription OPML exports | [Import/export](data-import-export.md) |
| RSS/Atom | Channel, playlist, mix and credential-bearing private subscription feeds | [Discovery](search-and-feeds.md) |

## Personalization and enhancements

| Feature | Behavior | Details |
| --- | --- | --- |
| Preferences | Account JSON or guest cookie; playback, navigation, privacy, feed and interface settings | [Preferences](preferences.md) |
| Themes | Modern Neon (default) and Diary designs; independent light/dark mode and random theme rotation | [Preferences](preferences.md), [theming](theming.md) |
| Localization | Locale JSON, Accept-Language selection, per-request override and English fallback, RTL support | [Frontend](frontend.md) |
| Thin/compact layouts | Thin mode reduces imagery; UI density selects balanced/compact layouts | [Preferences](preferences.md) |
| Manual channel blocks | Per-account blocks applied on supported personalized browser/native surfaces; direct access remains possible | [Accounts](accounts-and-library.md) |
| Member-video visibility | Opt-in display of members-only results; does not grant membership or unlock playback | [Discovery](search-and-feeds.md) |
| SponsorBlock | Eight segment categories, modes/colors, per-channel overrides and local browser changes | [SponsorBlock](sponsorblock.md) |
| DeArrow title replacement | Optional trusted community title, original-title visibility and safe fallback | [Integrations](integrations.md) |
| DeArrow contributions | Explicit suggestions/votes and encrypted account identity import/storage | [Contribution guide](dearrow-contributions.md) |
| AI channel filter | Independent community block/warn lists with hide/thumbnail replacement per surface | [AI filter](ai-channel-filter.md) |

## Operator and developer capabilities

The application supports YAML/environment configuration, TCP or Unix sockets, outbound HTTP/SOCKS proxies, conditional features, JSON APIs and API-only builds. PostgreSQL migrations, background refresh fibers, cache expiry, request logging, statistics, Docker builds, a sample systemd unit, Nix development files and CI/test harnesses are documented in [architecture](architecture.md), [operations](operations.md) and [development](development.md).

Native clips do not include media extraction, editing, federation, embed playback or import/export. Saved playlists are references rather than offline copies. Public discovery APIs do not inherit browser filtering. Account settings do not include email recovery. These boundaries are intentional parts of the documented behavior.
