# Frontend and presentation architecture

[Documentation index](README.md)

The current web interface uses compiled Crystal ECR templates, shared CSS and browser JavaScript. Page handlers render HTML; browser scripts handle playback, menus, dynamic content and profile-scoped storage.

## Templates and page data

[template.ecr](../src/invidious/views/template.ecr) delegates to the shared [shell](../src/invidious/views/overhaul/shell.ecr) for document structure, navigation, styling/scripts and browser profile context. [views/](../src/invidious/views) contains watch/embed, channel/search/feed, playlist/clip, account/Settings and error/privacy/licenses pages. `components/` and `overhaul/` supply reusable cards, pagination, player/source markup, channel info, subscription forms, the same-player clip editor and AI placeholders.

[frontend/](../src/invidious/frontend) contains Crystal presentation helpers for search filters, feed/card visibility, pagination, recommendation/queue view data, subscription manager ranking, avatars and watched/progress indicators. These helpers preserve shared API/cache neutrality where page filtering is personalized. Templates receive allowlisted configuration JSON rather than arbitrary upstream objects where feature code requires a safe client interface.

Keep escaping/context correct when adding titles, descriptions, identities or JSON script data. DeArrow title replacement uses safe text insertion. Uncertain collaborative-card channel identity stays unassigned instead of being guessed from display names.

## Browser module responsibilities

| Files under `assets/js/` | Responsibility |
| --- | --- |
| `browser-storage.js` | Validated guest/account storage profiles, legacy migration, fallbacks, stale-tab guards and deletion cleanup |
| `_helpers.js` | Shared browser helpers, requests and storage integration |
| `handlers.js` | Shared timestamp/comment-reply delegation; one document owner |
| `ui.js`, `settings.js`, `settings-navigation.js` | Profile-guarded requests, feedback, category-scoped search/drafts/Save/Discard/canonical read-back and historical bookmark navigation |
| `browse.js`, `library.js` | Server-rendered Load more, GET restoration, explicit search filters, selection/batch actions and owned-playlist reordering |
| `player-dock.js` | Desktop watch-page docking of the existing player without replacing its media element |
| `themes.js`, `timezone.js` | Color-mode updates/CSRF POST and supported timezone detection |
| `player.js` | Video.js initialization, playback/resume, volume, keyboard shortcuts and lifecycle sync |
| `player-ui.js`, `player-settings.js`, `player-mobile.js` | Profile-scoped watch layout, desktop Settings hierarchy, mobile settings and touch gestures |
| `player-stream-menu.js` | Audio/quality/codec menus, metadata selection and summaries |
| `player-chapters.js` | Manual chapter indicators/labels and SponsorBlock boundary coexistence |
| `player-stats.js` | Local opt-in diagnostics, copy fallback and observation lifecycle |
| `watch.js`, `embed.js` | Page-specific player/queue behavior |
| `watched_indicator.js` | Synced/local card progress, including dynamically inserted rows |
| `comment-threads.js` | One read-only comment/reply owner shared by watch, community and post pages |
| `transcript.js` | Transcript display, selection and timestamp navigation |
| `overhaul.js` | Shared navigation/menus/tabs/dialogs and occurrence-aware playlist grips |
| `subscriptions.js`, `playlist-forms.js`, `video-actions.js` | Subscription/library/context actions and ordinary form enhancement |
| `sse.js`, `notifications.js` | Notification streams, tab ownership and counters |
| `sponsorblock.js`, `sponsorblock-preferences.js` | Segment presentation/skipping and category/channel controls |
| `dearrow.js`, `dearrow-loader.js`, `dearrow-contributions.js` | Lazy title replacement, original-title interaction and explicit contribution flow |
| `clip-loader.js`, `clip-editor.js`, `clip-session.js`, `clip-player.js` | Same-player editor loading, temporary preview ownership, standalone fallback and immutable bounded playback |
| `live-chat.js`, `chat-preferences.js`, `chat-timing.js` | Panel replay synchronization/filtering, explicit display/filter saves and per-video timing |

Pinned/minified player plugins coexist with these first-party files. Their inventory is in [videojs-dependencies.yml](../videojs-dependencies.yml) and `assets/videojs/*/versions.yml`. Vendored plugins and icon/font packages should not be confused with application preference modules.

## Storage and profile isolation

`InvidiousStorage` owns application localStorage/sessionStorage/cookie access. Keys use `iv:browser:v2:<guest or opaque account HMAC>:<setting>`. Server context, the host-only `IV_BROWSER_PROFILE_V2` cookie and response headers identify the active profile. The ID grants no authorization. A delayed response or background tab must pass current-profile checks before mutating storage/account state. Stale GET pages can reload automatically once per history entry. A persistent mismatch, unavailable history or a POST page offers manual refresh.

Recognized persistent legacy values migrate only into guest storage without replacing newer guest values. Old continuation/notification locks are discarded. Login/logout/signup never copy guest settings into an account; logout preserves all profiles. Account deletion publishes a purge marker and clears only that account's browser state. Native bearer requests do not switch the browser's active profile.

Storage denial/quota failure uses bounded cookie fallbacks for small validated settings and page memory for larger values. UI save status must distinguish durable success from page-only state. Volume, caption appearance, chat local state, fallback positions, notification ownership and continuation caches use this helper. Synced account preferences remain database-authoritative.

## Styling and appearance

[foundation.css](../assets/css/foundation.css) defines shared tokens, document layout, cards, navigation, forms, menus and dialogs. Feature sheets cover the player, watch utilities, chat, clips, DeArrow and verification. First-party icons use the local [Lucide sprite](../assets/icons/lucide.svg). The unused Diary theme, Pure stylesheets and Ionicons font assets have been removed; required Video.js/plugin assets remain.

Light/Dark/System uses the existing preference, header toggle in the current document. Browser pages use one grid/row and player design. Older density, thin-mode and player-style values remain compatible with native and legacy preference submissions; browser Settings no longer edits them. Ordinary API playlist HTML still honors thin mode; explicitly requested desktop fragments share browser cards. See [styling](theming.md) for component and player guidance.

## Avatars, card visibility and progress

Channel avatars are learned from existing upstream responses and batch-persisted; misses render text placeholders without an extra metadata lookup. Placeholder initials use a Unicode letter cluster when safe, otherwise `#`, with deterministic colors. Cached/failed images retain the inline placeholder. Modern lockup/recommendation parsing respects linked identity and avoids assigning uncertain collaboration stacks to one creator.

Membership flags come from existing response/cache metadata. Unknown membership stays visible until normal refresh learns it. Public playlist/mix JSON remains unfiltered, with `isMember`; browser cards/HTML queues use preferences. AI replacement removes image markup entirely while retaining titles/links/actions; player posters and aggregate playlist covers keep their existing behavior.

The [view-count reference](reference/video-view-counts.md) documents count rendering and API fields.

Progress indicators share a markup helper across supported cards/recommendations/history/queues. Account sync uses one uncached playback-state request per page/return. Unknown durations do not trigger per-item detail requests and cannot produce partial bars. Duplicate video occurrences get independent card markup with the same video progress state.

## Localization, accessibility and static assets

[i18n.cr](../src/invidious/helpers/i18n.cr) defines enabled locales/regions, loads their JSON, falls back to `en-US` and supports formatting/interpolation. [i18next](../src/invidious/helpers/i18next.cr) handles plural behavior. A locale file's existence does not alone add it to the enabled selector. Add English keys before optional translations; unsupported locales/missing translations fall back as implemented. RTL, narrow screens, keyboard focus and form interactions are tested by fixtures/browser checks.

Dialogs and menus need focus handling, Escape/Tab behavior, visible labels and adequate touch layouts. Page-wide player shortcuts deliberately avoid interactive controls. Physical software keyboards, native fullscreen and OS/browser integration cannot be proven solely by synthetic tests.

On supported newer Crystal versions, [StaticAssetsHandler](../src/invidious/http_server/static_assets_handler.cr) serves/caches assets; older builds use Kemal static handling. Static cache lifetime is 2,629,800 seconds. `ASSET_COMMIT` supplies query cache busting from the last Git commit touching assets. A stale deployed asset build needs an updated cache identity/restart or deployment cache refresh, not a change to account JSON.

Frontend test setup/limits are in [development](development.md) and [tests/frontend/README.md](../tests/frontend/README.md). The [source map](reference/source-map.md) enumerates every stylesheet, script and template.

## Browsing and library interactions

Paginated listings expose a stable `data-browse-items` region. Load more requests
the existing HTML page with the same cookies and filters, imports its result
markup, and initializes the new controls without executing fetched scripts.
Continuation tokens remain opaque. Empty filtered pages can still offer another
batch; history batches merge adjacent date groups. Appending does not add a
browser history entry. Explicit search filters replace results and update GET
URLs in place; typing never requests suggestions or results.

Ordinary GET listings save up to ten tab-local restoration descriptors through
`InvidiousStorage`: page URLs/tokens, preference identity and scroll position.
Browser restoration is the fast path; a new document reconstructs loaded pages
when necessary. Each descriptor supports up to 100 loaded batches. HTML and media
are not stored. POST/private searches retain continuation state in page memory
only, use POST for filters and pagination, and do not save queries in restoration
storage or history state. If the browser discards such a document, its search
must be submitted again. Changed visibility/order preferences invalidate saved
descriptors; ordinary player or color-mode changes do not.

Signed-in video lists and subscription management expose explicit selection mode.
Select all means all currently loaded eligible rows; new batches start unselected.
Batch operations run sequentially, preserve failed selections, and report partial
success. Removals/unsubscriptions confirm the action and count. Playlist additions
are never automatically retried after an ambiguous response.

Owned playlists use Move up and Move down in phone row menus. Wider layouts use a leading grip for pointer drag or keyboard pickup, arrow movement and drop or cancel. Both controls reorder among loaded rows. The web
`playlist_ajax` action `move_video_before` accepts POST body fields `source`,
`anchor` (decimal occurrence IDs as strings), and `placement=before|after`, plus
the existing CSRF token and playlist ID query parameter. It locks the playlist,
rechecks ownership and occurrence membership, and changes only its order and
updated timestamp. Stale occurrences return 409; the browser retains the displayed
order, disables further dragging and offers an explicit Reload.
Duplicate video IDs and unloaded entries retain their distinct occurrences.

## Preferences and watching

The category interface is the default `/preferences` destination. `settings.js` retains bounded category drafts in page memory, local metadata search makes no typing requests, and Save verifies its own canonical values/profile with a separate GET. Requests are canceled on component departure and stale results cannot replace a newer category. `settings-navigation.js` also replaces recognized historical anchor entries with current destinations; ordinary named links remain usable without that script. Explicit categories take precedence, and leaving with a dirty draft retains the departure warning. Category failures stay beside the owning navigation. See [category ownership and writes](preferences.md#category-ownership-and-writes). The following whole-form POST behavior remains for cached legacy callers; the default route no longer renders that full form.

Category search uses public labels, descriptions and option metadata, without
enumerating private playlist titles. Save/Discard tracks only the active category;
Appearance previews color mode. Cached whole-form POSTs still return their
compatible canonical receipt, but their template/controller are retired. Current
category controllers compare declared keys and canonical scalar/array/map types,
profile and independent read-back before reporting Saved. Saving invalidates
affected browse restoration state.

At desktop widths (1100px and above), a player with Automatic mini player enabled
that has started playback docks when its inline space scrolls above the header.
Docking defaults off. It retains its media element and
playback state, with play/pause, mute, return and dismiss controls. Dismiss lasts
for that watch-page visit. Audio-only, fullscreen, picture-in-picture and narrow
layouts and clip editing use the inline player. Standard/Theater layout and the
docking preference use validated, profile-scoped InvidiousStorage keys. Utility
tabs, layouts and the Settings hierarchy retain the existing media instance.
Transcript following scrolls only its own viewport;
manual interaction/search turns following off until explicitly re-enabled.

Settings are initialized once per document from server-rendered configuration and
initial browser-local values. Refresh or fresh navigation applies saves made
elsewhere; focus, storage events and cached returns do not re-read settings.
Cached pages resume their own masking rules, upload-age clock, reveal choices,
DeArrow configuration and SponsorBlock state. Direct controls and explicit saved
settings checks still act immediately. Dynamic fragments use existing content
observers; incompatible browse fingerprints require a manual reload before
pagination can continue. Playback, notification and profile coordination remain
independent of settings. The former internal `/preferences?format=runtime` and
`/watch?format=enhancements` reads return JSON 410 without settings/watch effects.
See [frontend verification](../tests/frontend/README.md#settings-visibility-and-enhancements)
for refresh and cached-page regression coverage.

## Embedded media ownership

`embed.ecr` uses Foundation, the shared player styles and a minimal document
without application navigation or listing/SSE/timezone consumers. `embed.js`
owns one abortable continuation read and ended handler; it retains exact decimal
cursors and duplicate series entries. Failures use explicit Retry. The canonical
enhancement coordinator suspends consumers on departure and reapplies accepted
profile state on cached return. Player disposal retires the embed and enhancement
owners. Shared player work guards delayed reloads, source restoration, speed-CSRF
preflights and keyboard handlers while keeping the permitted pagehide position
delivery. None of these owners recreates the media element.

The watch link is a real labeled anchor with current playhead/playback choices and
original playlist/occurrence or preview context. Player/source/caption attributes
and embedded JSON are escaped while preserving decoded values. HLS proxy flags
retain existing opaque manifest/segment query fields.

Private watch/embed pages load the access owner even without a bot pass. Marked
instance-login 401 and verification 403 responses select separate recovery flows;
media failures can check HEAD on the existing local stats route before verification
discovery. Framed recovery retires consumers/player, clears stale media metadata
and offers a new-window action. Generation guards ignore fetch/XHR/probe results
from before departure. A page-local known position survives a failed media reload;
it is not written to browser/account state by the access owner.

## Reading and recovery pages

Privacy, JavaScript licenses, ordinary notices and HTML errors use the shared
reading measure and controls. Privacy describes database/browser ownership,
optional providers and actual removal limits; logout preserves local profiles.
GET/HEAD legal pages remain readable on a login-required instance. API-only
builds retain only their registered recovery destinations.

Generic HTML error reports contain a route pattern, method, timestamp, exception
class and version. They omit the raw URL/query, headers, body, exception message
and backtrace. Deliberate information errors are escaped as plain text. Technical
details are optional and report links carry no private request context. Failed
writes receive check-current-state guidance and ordinary recovery navigation,
without automatic replay. Read retries reconstruct only validated public IDs and
discard unrelated query fields. Embedded errors use a script-free, frame-readable
panel and explicit new-window actions. Reading/error pages do not load listing,
watch, enhancement, timezone or subscription/SSE consumers.

The JavaScript license table retains its LibreJS ID and three linked columns,
including dynamically enumerated first-party scripts and existing player/vendor
licenses. Lucide attribution remains accessible. The table can scroll inside its
reading panel without widening the document.

Channel Shows use the existing More menu, alongside Podcasts, Releases, Courses and related channels. Native channel metadata advertises Shows while retaining the fork's Clips tab. Watch comments retain YouTube sort, replies, continuation and no-JavaScript pagination; Reddit source controls and fallback readers have been removed.
