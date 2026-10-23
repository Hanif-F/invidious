# Application overview

[Documentation index](README.md)

Invidious is a server-rendered alternative interface to YouTube. Users browse videos, channels, playlists, comments and feeds through an Invidious instance. The instance obtains upstream information, renders HTML, provides JSON APIs and proxies selected media and images. It also stores local accounts and libraries independently of Google accounts.

This fork adds account security and native client workflows, synchronized playback positions, detailed watch history, channel blocking, native clips, saved playlist references, archived chat replay, richer stream metadata, SponsorBlock, DeArrow, AI channel filtering, channel-avatar caching and Diary styling with light/dark/system color modes. The [feature catalog](features.md) describes each capability and its dependencies.

## System components

| Component | Purpose | Location |
| --- | --- | --- |
| Crystal application | HTTP routing, rendering, API, parsing, accounts, jobs and proxies | [src/invidious.cr](../src/invidious.cr), [src/invidious](../src/invidious) |
| Kemal | HTTP framework and middleware integration | [shard.yml](../shard.yml), [handlers](../src/invidious/helpers/handlers.cr) |
| PostgreSQL | Persistent accounts and libraries, subscriptions, metadata caches and migrations | [database layer](../src/invidious/database), [SQL](../config/sql) |
| Invidious Companion | Video extraction and playback metadata supplied by a separately deployed service | [connection pools](../src/invidious/yt_backend/connection_pool.cr), [companion routes](../src/invidious/routes/companion.cr) |
| ECR templates | HTML pages and reusable components compiled into the application | [views](../src/invidious/views) |
| Browser assets | Video.js player, browser interactions, Diary styling and shared styles | [assets](../assets) |
| Background jobs | Subscription refresh, statistics, popular videos, notifications and cache maintenance | [jobs](../src/invidious/jobs) |

There is no separate frontend application build or required Node.js runtime for serving the site. Node.js is used by browser tests. SQLite is a linked dependency used for imports and some test harnesses; PostgreSQL is the application database.

## Users and storage boundaries

Guests can browse, play available videos and save preferences in a cookie. Browser-only settings and fallback state are scoped to the active guest/account profile. Signing in adds persistent subscriptions, playlists, clips, blocking, history and position synchronization. Accounts are local to an instance. A native client uses the same server data through scoped bearer tokens.

The database column named `users.email` is an immutable owner identifier; it is not a recovery email address. `username` is the mutable sign-in/display name. Account renames retain ownership. There is no email-based password recovery. See [accounts](accounts-and-library.md) and [security](security.md).

Video metadata is cached and can be re-fetched. The server does not archive the YouTube video library. Native clips store timestamps and metadata, and saved playlists point to their source. Source removals and upstream access failures can therefore make content unavailable without deleting the local reference.

## Rendering and network boundaries

The current web interface combines server-rendered HTML with browser JavaScript for interactive playback, replay chat, dynamic comments, clip editing and automatic synchronization.

Playback may go through the instance, through a configured public companion endpoint, or directly to Google media hosts, depending on stream type and preferences. Browser privacy therefore depends on configuration as well as the interface. Thumbnails and avatars normally use local proxy paths. Optional community services are accessed by the server; DeArrow submissions occur only after a user's action. See [integrations](integrations.md).

## Build variants and limits

The standard build includes HTML pages. `-Dapi_only` omits GUI registrations while retaining JSON APIs, RSS, images, manifests, media and configured companion proxy routes. API-only does not remove accounts or database requirements. The [route reference](reference/routes.md) identifies all registered surfaces.

Live upstream behavior can change independently of this source tree. A successful metadata request does not guarantee every format, caption, region, livestream or replay is available. Automated fixtures validate parsing and UI behavior with controlled data; deployment smoke tests must exercise real upstream requests separately.
