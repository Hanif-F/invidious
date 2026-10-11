# External integrations

[Documentation index](README.md)

This guide describes requests made by this repository. Service availability and external implementations are outside the server's control. No live upstream calls are needed to generate this documentation.

| Integration | Purpose | Request boundary and failure behavior |
| --- | --- | --- |
| YouTube/Innertube | Search, channels, playlists, comments, transcript, chat and metadata parsing | Server connection pools; upstream changes can invalidate parsers independently of account storage |
| Invidious Companion | Video extraction/playback information and media paths | Separately deployed, shared 16-character API key; missing/broken service prevents playback |
| Google image/media CDNs | Thumbnails, avatars, storyboards, media | Fixed-host image routes and validated media hosts; direct browser media is possible when proxying is off |
| Reddit | Alternate video comment source | Server fetch/parse, independently selectable from YouTube comments |
| Internet Archive | Legacy annotations | Optional archive lookup/cache, not a video archive |
| SponsorBlock | Community skip ranges | Server four-character video-hash prefix requests, bounded cache; empty result on failure |
| DeArrow | Trusted titles, proposals, explicit contributions | Read cache/fallback plus authenticated user-triggered upstream writes |
| AiSList on GitHub | Community blocklist/warnlist classifications | Periodic server downloads; independent persisted last-known-good snapshots |
| PubSubHubbub | Channel feed update subscriptions/webhooks | Optional signed push workflow with reachable configured origin |
| Invidious instance directory | Alternative instance redirects | Periodic process-local list refresh and suitability filtering |

## YouTube and companion

The server does not use the official Google Data API for these browsing flows. [youtube_api.cr](../src/invidious/yt_backend/youtube_api.cr) constructs Innertube request contexts, and extraction modules normalize many upstream renderer shapes into search/channel/video models. Protobuf encoding supplies filters and continuation data. [connection_pool.cr](../src/invidious/yt_backend/connection_pool.cr) bounds clients and configures supported outbound proxy/DNS behavior.

Companion connections explicitly bypass the application's outbound HTTP proxy setting. Configure any companion egress separately. A private companion URL is for the server; an optional public URL is browser-facing. Omitting public URL routes through the instance's built-in companion proxy. Multiple entries are chosen during metadata fetch and remain tied to cached stream data. The companion executable, its image/release and internal configuration are not included in this repository.

Upstream access cookies are operator credentials, distinct from local account sessions. The site's CSP permits selected direct media hosts and explicitly configured companion origins; arbitrary external embeds or executable scripts are not a supported integration mechanism.

## Community enhancements

SponsorBlock and DeArrow lookups send a four-character SHA-256 video prefix to a fixed SponsorBlock service host and select the requested video's result server-side. Each cache has a 10,000-entry bound and four upstream slots. Successful results last one hour, missing data ten minutes, transient failure thirty seconds. An unavailable enhancement retains original playback/title behavior.

DeArrow title replacement is opt-in and lazily loaded near the viewport. It changes displayed titles, not thumbnails or the original video metadata API. Non-JavaScript pages retain original titles. Contribution dialogs are separately available to signed-in users, including when replacement is off. New proposals require title validation and explicit guideline confirmation; votes identify an existing proposal/original record. Writes are never automatically retried because a timeout can follow an accepted submission.

Private DeArrow identities are created/imported through dedicated flows and encrypted in PostgreSQL using an independent persistent key. They never appear in normal preferences/export/page configuration. Losing the key has no automatic reset fallback. [DeArrow contributions](dearrow-contributions.md) details encryption, key migration and failure behavior. SponsorBlock has no submission/voting implementation here.

AiSList downloads two community-maintained text lists at startup and every six hours. Matching uses canonical IDs or exact normalized handles, never creator display names. A bounded shared resolver may learn missing handles from channel metadata; it waits at most two extra seconds per page, leaving unresolved cards visible. Filters perform no AI model inference. No account identifiers or watch history are sent to the list host. [AI filter](ai-channel-filter.md) describes queue/cache timing, provenance and attribution.

## Feeds, notifications and redirects

RSS channel/playlist requests and OPML exports rewrite supported links to the instance, while native/newpipe variants retain their defined source URL semantics. PubSub feed verification uses the HMAC secret; reverse-proxy logs must redact webhook credential paths. Push callbacks are GUI-route registrations and are not present in an API-only build, even though RSS and authenticated SSE routes remain.

The instance-list job fetches/filter candidates for cross-instance redirect behavior. Its process-local list does not migrate account data or native clips. Following a content link to another instance is not equivalent to signing into that instance with the current account.

## Data and dependency attribution

Project code uses the license in [LICENSE](../LICENSE); runtime/community data can have separate terms. Existing SponsorBlock/AiSList guides retain their data-license attribution, and `config/security/` retains the password list's license. Player dependencies are pinned by [videojs-dependencies.yml](../videojs-dependencies.yml); their packages/version metadata remain in `assets/videojs`. [licenses.ecr](../src/invidious/views/licenses.ecr) and the license generation script support the application's licenses page.
