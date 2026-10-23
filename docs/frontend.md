# Frontend and presentation architecture

[Documentation index](README.md)

The current web interface uses compiled Crystal ECR templates, shared CSS and browser JavaScript. Page handlers render HTML; browser scripts handle playback, menus, dynamic content and storage/synchronization behavior.

## Templates and page data

[template.ecr](../src/invidious/views/template.ecr) supplies common document structure, navigation, styling/scripts and browser profile context. [views/](../src/invidious/views) contains watch/embed, channel/search/feed, playlist/clip, account/preferences and error/privacy/licenses pages. `components/` supplies reusable cards, pagination, player/source markup, channel info, subscription widgets, clip dialogs and AI placeholders.

[frontend/](../src/invidious/frontend) contains Crystal presentation helpers for search filters, feed/card visibility, pagination, recommendation/queue view data, subscription manager ranking, avatars and watched/progress indicators. These helpers preserve shared API/cache neutrality where page filtering is personalized. Templates receive allowlisted configuration JSON rather than arbitrary upstream objects where feature code requires a safe client interface.

Keep escaping/context correct when adding titles, descriptions, identities or JSON script data. DeArrow title replacement uses safe text insertion. Uncertain collaborative-card channel identity stays unassigned instead of being guessed from display names.

## Browser module responsibilities

| Files under `assets/js/` | Responsibility |
| --- | --- |
| `browser-storage.js` | Validated guest/account storage profiles, legacy migration, fallbacks, stale-tab guards and deletion cleanup |
| `_helpers.js` | Shared browser helpers, requests and storage integration |
| `handlers.js`, `interface.js` | General interface events and helper behavior |
| `themes.js`, `timezone.js` | Color-mode updates/CSRF POST and supported timezone detection |
| `player.js` | Video.js initialization, playback/resume, volume, keyboard shortcuts and lifecycle sync |
| `player-ui.js`, `player-mobile.js` | Shared player UI, mobile settings and touch gestures |
| `player-stream-menu.js` | Audio/quality/codec menus, metadata selection and summaries |
| `player-chapters.js` | Manual chapter indicators/labels and SponsorBlock boundary coexistence |
| `player-stats.js` | Local opt-in diagnostics, copy fallback and observation lifecycle |
| `watch.js`, `embed.js` | Page-specific player/queue behavior |
| `watched_widget.js`, `watched_indicator.js` | Watched actions and synced/local card progress, including dynamically inserted rows |
| `comments.js`, `community.js`, `post.js` | Comment/reply/community continuation loading |
| `transcript.js` | Transcript display, selection and timestamp navigation |
| `pagination.js` | Continuation/page state for enhanced browsing |
| `subscribe_widget.js`, `playlist_widget.js`, `video-actions.js` | Subscription/library/context actions and dialogs |
| `sse.js`, `notifications.js` | Notification streams, tab ownership and counters |
| `sponsorblock.js`, `sponsorblock-preferences.js` | Segment presentation/skipping and category/channel controls |
| `dearrow.js`, `dearrow-loader.js`, `dearrow-contributions.js` | Lazy title replacement, original-title interaction and explicit contribution flow |
| `clip-loader.js`, `clip-editor.js`, `clip-player.js` | Clip dialog/editor loading, bounded selection and immutable playback |
| `live-chat.js` | Replay synchronization, filtering, overlays, appearance and timing |

Pinned/minified player plugins coexist with these first-party files. Their inventory is in [videojs-dependencies.yml](../videojs-dependencies.yml) and `assets/videojs/*/versions.yml`. Vendored plugins and icon/font packages should not be confused with application preference modules.

## Storage and profile isolation

`InvidiousStorage` owns application localStorage/sessionStorage/cookie access. Keys use `iv:browser:v2:<guest or opaque account HMAC>:<setting>`. Server context, `IV_BROWSER_PROFILE` and response headers identify the active profile. The ID grants no authorization. A delayed response or background tab must pass current-profile checks before mutating storage/account state.

Recognized persistent legacy values migrate only into guest storage without replacing newer guest values. Old continuation/notification locks are discarded. Login/logout/signup never copy guest settings into an account; logout preserves all profiles. Account deletion publishes a purge marker and clears only that account's browser state. Native bearer requests do not switch the browser's active profile.

Storage denial/quota failure uses bounded cookie fallbacks for small validated settings and page memory for larger values. UI save status must distinguish durable success from page-only state. Volume, caption appearance, chat local state, fallback positions, notification ownership and continuation caches use this helper. Synced account preferences remain database-authoritative.

## Styling and appearance

Base CSS defines layout, cards, navigation and appearance tokens; feature sheets cover the player, search, chat, clips, DeArrow and video actions. Pure.css/responsive grids and Ionicons provide vendored foundation assets. The main template loads [Diary’s stylesheet](../assets/themes/diary/theme.css) directly after the shared styles. Diary is the only site design.

Light/dark/system mode uses the existing preference, header toggle and browser synchronization. Thin mode avoids applicable imagery, and compact density changes layout spacing. Diary fonts/SVG doodles and icons are ordinary runtime assets. See [theming](theming.md) for styling and player compatibility guidance.

## Avatars, card visibility and progress

Channel avatars are learned from existing upstream responses and batch-persisted; misses render text placeholders without an extra metadata lookup. Placeholder initials use a Unicode letter cluster when safe, otherwise `#`, with deterministic colors. Thin mode omits avatar requests. Cached/failed images retain the inline placeholder. Modern lockup/recommendation parsing respects linked identity and avoids assigning uncertain collaboration stacks to one creator.

Membership flags come from existing response/cache metadata. Unknown membership stays visible until normal refresh learns it. Public playlist/mix JSON remains unfiltered, with `isMember`; browser cards/HTML queues use preferences. AI replacement removes image markup entirely while retaining titles/links/actions; player posters and aggregate playlist covers keep their existing behavior.

The [view-count reference](reference/video-view-counts.md) documents count rendering and API fields.

Progress indicators share a markup helper across supported cards/recommendations/history/queues. Account sync uses one uncached playback-state request per page/return. Unknown durations do not trigger per-item detail requests and cannot produce partial bars. Duplicate video occurrences get independent card markup with the same video progress state.

## Localization, accessibility and static assets

[i18n.cr](../src/invidious/helpers/i18n.cr) defines enabled locales/regions, loads their JSON, falls back to `en-US` and supports formatting/interpolation. [i18next](../src/invidious/helpers/i18next.cr) handles plural behavior. A locale file's existence does not alone add it to the enabled selector. Add English keys before optional translations; unsupported locales/missing translations fall back as implemented. RTL, narrow screens, keyboard focus and form interactions are tested by fixtures/browser checks.

Dialogs and menus need focus handling, Escape/Tab behavior, visible labels and adequate touch layouts. Page-wide player shortcuts deliberately avoid interactive controls. Physical software keyboards, native fullscreen and OS/browser integration cannot be proven solely by synthetic tests.

On supported newer Crystal versions, [StaticAssetsHandler](../src/invidious/http_server/static_assets_handler.cr) serves/caches assets; older builds use Kemal static handling. Static cache lifetime is 2,629,800 seconds. `ASSET_COMMIT` supplies query cache busting from the last Git commit touching assets. A stale deployed asset build needs an updated cache identity/restart or deployment cache refresh, not a change to account JSON.

Frontend test setup/limits are in [development](development.md) and [tests/frontend/README.md](../tests/frontend/README.md). The [source map](reference/source-map.md) enumerates every stylesheet, script and template.
