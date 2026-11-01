# Accounts and library

[Documentation index](README.md)

Accounts belong to one Invidious instance and do not require a Google account. Guest preferences can persist in the current browser, but account subscriptions, playlists, history, clips and synchronized positions are stored in PostgreSQL.

## Registration and sign-in

Use `/signup` to register and `/login` to sign in. Login does not create an account. Operators can disable login or registration independently; optional registration CAPTCHA requires the server's image-rendering dependencies. Native clients use the JSON registration/sign-in routes in the [mobile contract](mobile-api.md#native-sign-in).

New usernames contain 3–32 ASCII letters, digits, underscores, dots or hyphens and are unique case-insensitively. New passwords require at least 15 characters and at most 72 UTF-8 bytes, reject NULs, common passwords and fewer than four distinct characters. Non-ASCII characters can use multiple bytes. Password checks use a bundled local list; no remote breach-check service receives the password.

Existing accounts retain legacy names and password verification behavior after migration 17. The immutable owner ID remains in `users.email`; newer accounts get random IDs and an independent username. There is no contact email, password-reset email or email recovery. Keep working credentials and administrative backups accordingly.

## Account settings and sessions

`/account` exposes private account controls. Renaming or changing the password requires the current password, preserves owned data, revokes existing sessions/API tokens and establishes a new browser session. Native credential changes return replacement native credentials; clients must replace their stored token. `/change_password` remains available. `/delete_account` confirms credentials before deleting the account and owned data.

Account controls now share the desktop shell. Username failures retain the literal
submitted name; password fields return empty. Deletion explains its permanent
consequences and links to portable exports before requiring the current password.
`/token_manager` shows session type, issuance time and the current browser marker;
it does not claim device/IP metadata or display raw credentials. Review a row's
revocation before submitting its ordinary POST form. Revoking this browser session
signs it out. Existing query-based revocation callers remain compatible.

Token consent lists the requested method/path scopes, expiration and exact callback
address, preserving full native 64-bit expiration timestamps even beyond the calendar display range. Approval can return tokens through existing HTTP, relative and native
custom callbacks; malformed addresses and executable document schemes are rejected
before issuance by the browser approval handler. Cancel returns to the session
manager. With no callback, the explicit private token result can be copied manually;
keep that token secret. Account, consent and session responses are private/no-store,
and these security forms work without JavaScript. The optional duplicate-submit
guard does not save passwords, send extra requests or automatically retry writes.


Browser SIDs expire after 30 days. `/token_manager` and token authorization pages manage access. Native session-management routes distinguish manageable browser sessions/API tokens and enforce ownership. A restricted token cannot use general token issuance to acquire more scopes. Password-confirmed account token issuance uses a separate route. See [security](security.md) and [API](api.md).

Deletion removes owned playlists and their rows transactionally, as well as associated history, subscriptions, sessions and supported account data. Foreign keys cascade blocking, positions, offsets, clips, saved playlists and DeArrow identities. Browser profile cleanup removes this account's locally scoped state on the next document load. Account deletion is not a request to remove previously accepted upstream DeArrow contributions or shared content caches.

## Channel subscriptions

Subscribe from a channel or watch page. `/subscription_manager` lists, sorts and manages subscriptions; subscription search searches cached subscribed videos through the search/API flow. `/feed/subscriptions` combines cached uploads from subscribed channels. Subscription refresh depends on background jobs or configured push updates, so new uploads can take time to appear.

Saved defaults in [Library Settings](preferences.md) control latest-only, unseen-only, notifications-only, result count and sorting. The Subscriptions toolbar applies explicit choices to the current view and its pagination without rewriting those defaults. Its search form keeps subscription scope. They do not create a YouTube subscription. Native `GET /api/v1/auth/subscriptions?include_stats=true` adds latest upload and watched-count/relevance metadata; it requires history permission in addition to subscription access. The native sorting/search contract is in [mobile API](mobile-api.md#native-subscription-directory-sorting).

The browser manager supports `sort_by=alphabetical`, `latest`, `most_watched` or `relevance`, persisted in a profile-scoped cookie. Statistics read existing local caches/history without channel/video fetches or history backfill. All-time counts count each watched video once; recent counts use its latest nonfuture recorded date in the last 90 days. Relevance sums linearly decaying 90-day viewing weights and multiplies by `1 + freshness`, where freshness decays from 1 to 0 across seven days for the newest unwatched eligible upload. Future/premiere and hidden-member uploads are excluded; ties sort by channel name then ID.

Notifications contain new subscribed videos. New-upload notices appear inside Subscriptions and offer an explicit Refresh; incoming events do not insert or reorder rows. Browser notification permission is requested only from the toolbar’s More action; permission guidance stays beside that action. Live updates use SSE and a profile-scoped owner lease, with reconnect/cached-page/profile cleanup; disabled server notification endpoints or broken streaming proxies prevent live updates. Ordinary subscription browsing remains a distinct path. Private RSS exposes the subscription feed through a token-bearing URL; treat the URL as a credential.

## Browser collection controls

Supported listings expose Select mode, loaded-only Select all and sequential batch actions. New batches start unselected; failed items remain selected after partial success. Removal/unsubscription confirms the count. Ambiguous playlist additions are never automatically retried, and their row/target stays blocked in the current document until the user checks the playlist and reloads. Leaving/caching a page stops its current batch; returning never resumes those writes. Load more preserves existing results on failure and merges adjacent history date groups; ordinary pagination remains available. See [frontend continuation and restoration](frontend.md#browsing-and-library-interactions) for GET/POST privacy boundaries.

## Watch history and progress

When `watch_history` is enabled, watched IDs are recorded with best-effort descriptive metadata. `/feed/history` groups entries by Today, Yesterday, Last 7 days, Last 30 days and Older, based on the chosen timezone or UTC. History search matches title/channel text. Unknown imported dates remain unknown rather than being invented; old entries can recover metadata from local caches without per-item upstream fetching.

Detailed history includes `video_id`, title, channel name/ID, release date, latest watched date, archived dates and optional positive duration. The original watched-ID array remains for compatibility/order. Native clients can request basic, detailed or organized history, described in [API](api.md). Marking watched/unwatched returns 409 when history is disabled. Clearing history also clears account playback positions, in the same transaction. With recording off, existing history remains readable and sync remains independent; individual watched/unwatched actions are unavailable, while clearing all history/positions remains available.

`save_player_pos` independently enables position synchronization. It defaults false. Turning it off clears account positions; watch history is not an equivalent opt-in. Thumbnail bars use known durations and watched/position state. Unknown durations cannot show a partial percentage. Account-backed bars do not import another profile's browser fallback. See [playback](playback.md#resume-and-synchronization).

## Owned playlists

`/feed/playlists` separates **My playlists** from **Saved playlists**. Create a local playlist, choose Public/Unlisted/Private, edit its title/description/privacy, and add/remove video occurrences. Local playlist IDs start with `IV`. An account can own at most 100 playlists, each normally limited by `playlist_length_limit` (default 500). Owners reorder with the leading row grip, using pointer drag with edge scrolling or keyboard Space/Enter, arrows, drop/cancel. There are no movement buttons. Its POST `playlist_ajax?action=move_video_before` action uses decimal occurrence strings (`source`, `anchor`) and `placement=before|after`, not video IDs. The database locks the playlist and rechecks ownership/occurrence membership; a stale occurrence returns 409 and the browser retains the displayed order, disables further dragging and offers Reload. Duplicates and unloaded entries retain their order. Enhanced add/remove/move requests send `include_positions=1` for a transaction-captured position/count snapshot; older callers keep the existing empty JSON success response. Confirmed UI changes use canonical decimal occurrence strings and positions. Add/remove/delete also transact the item rows and ordered index/count together. Concurrent creations share the account lock for the existing 100-playlist limit. This web action is distinct from the native versioned API, which has no occurrence-reordering route.

Public playlists are accessible to other users; unlisted playlists are available through their link; private playlists require the owner. Private access checks apply to page/API/embedded playlist flows, including indexed series/redirects. Nonowners often receive 404 to avoid revealing a private resource. An accessible playlist does not give a viewer edit permission.

Playlist items store occurrence identities independently from the upstream video ID. The same video can occur more than once. `index` is the displayed/order position, while API `indexId` is the stable hexadecimal occurrence identifier used for deletion. Clients must use the returned occurrence identifier instead of assuming a video ID uniquely identifies a playlist row.

Create/edit pages retain failed title/privacy/description drafts, including the no-JavaScript HTML path. Titles retain the existing 150-byte bound without cutting UTF-8, descriptions allow 5,000 characters, and privacy must be Public/Unlisted/Private. Uncertain creation is blocked until the user checks the library. Add-items search submits explicitly, stays video-scoped, retains filters/literal input/region, and uses POST forms/continuation when private search is enabled. It does not store private queries for restoration.

## Saved playlists and mixes

<a id="subscribed-playlists-and-mixes"></a>

Saving a YouTube playlist, a mix or an accessible local playlist creates a per-account `saved_playlists` reference. It does not copy the source videos or change ownership. Opening/refreshing follows the source's current content; deletion/privacy changes upstream can make it unavailable. Mix references retain their seed video where required.

The browser labels references **Save playlist** and **Unsave playlist**, with a separate confirmation explaining the consequence. Unsaving removes the current account's bookmark. It does not delete the owner's playlist. Editing/deleting an owned playlist remains a separate operation. Migration 20 backfills legacy external playlist saves without deleting their old rows. Native clients should use the explicit `PUT/DELETE /api/v1/auth/saved_playlists/:id` contract. See [mobile API](mobile-api.md#playlist-subscriptions-rss-and-opml).

## Clips

Signed-in users can create immutable public clips from playable finite-duration videos or completed livestream archives. Active/upcoming streams, members-only videos, sources shorter than five seconds and unavailable/invalid sources are rejected. Clips contain a 1–140-character title and a 5–120-second range stored at millisecond precision. `/feed/clips` lists owned clips; channel pages expose public channel clips, with 30 clips per page. Native IDs begin `IVCL`, distinct from YouTube clips.

Anyone with a clip link can view it while the source remains playable. Only its owner can delete it. Clips survive metadata cache eviction, but do not include saved media. Renames update the displayed creator without changing ownership. Editing an existing clip, clip import/export, federation and native-clip embeds are not implemented. The complete editor, player and API behavior is in [native clips](native-clips.md).

## Manual blocking and visibility

Use supported video context actions or `/blocked_channels` to block/unblock canonical channel IDs. Blocks belong to the account and affect supported personalized browser/native surfaces. Shared upstream caches and public discovery JSON remain unpersonalized; blocking is a display choice, not an upstream access ban. Direct links and channel pages remain accessible, and search offers an explicit include-blocked choice.

Members-only visibility and [AI filtering](ai-channel-filter.md) are separate controls. Enabling member-video display does not grant membership. AI library/channel/queue actions only replace thumbnails; they do not remove/reorder entries or alter autoplay eligibility. These distinctions prevent a local library from silently changing its membership when display preferences change.
