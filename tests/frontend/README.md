# Frontend verification

The fixtures render the production Crystal/ECR templates without starting the app,
using PostgreSQL, or contacting YouTube. Browser requests are intercepted locally.
Thumbnails and video content in the screenshots are synthetic test media.

## Run

With Crystal, Shards, Node.js and FFmpeg installed:

```sh
git submodule update --init mocks
shards install --skip-postinstall --skip-executables
crystal scripts/fetch-player-dependencies.cr
crystal run tests/frontend/render_fixtures.cr
ffmpeg -f lavfi -i color=c=0x303a53:s=320x180:r=12 -t 4 -an -c:v libvpx -y tests/frontend/.generated/fixture.webm
npm ci --prefix tests/frontend --ignore-scripts
cd tests/frontend
npx playwright install --with-deps chromium firefox
npm test
```

`FRONTEND_BROWSERS` selects installed Playwright engines (default:
`chromium,firefox`). Screenshots are written to `artifacts/`; they are inspection
artifacts, not pixel comparison assertions. Generated fixtures and artifacts are
ignored by Git.

## Coverage and limits

- Production Video.js controls, playback, pause, seeking and playback speed using
  a local clip, at desktop and touch viewport sizes. Includes paused auto-hide,
  mouse/touch wake-up, keyboard focus, speed menus and the in-player wide toggle.
- Playback progress resets and restores correctly when seeking back from completion,
  including fractional completion boundaries; rejected unload beacons use a keepalive
  fallback. Embed playlist requests preserve the current video and advancement settings.
- Horizontal branding and direct Library links, including customized feed menus.
- Playlist occurrence selection, previous/next links, recommendation separation,
  retries, empty/end states and mobile queue placement.
- Transcript deferred loading, safe text rendering, languages, search, timestamp
  seeking, per-page caching and error recovery.
- Theme switching, system theme, thin mode, keyboard interaction and no-JavaScript
  navigation. Responsive checks at 320, 390, 768, 1024, 1440 and 1920 pixels,
  including RTL and enlarged text.
- History renders escaped locally cached titles, with thumbnail-only fallback;
  playlist-library thumbnails use desktop cards while playlist entries keep their
  list layout. Mobile queue scrolling survives browser-toolbar height changes.
- Initial CSS/JavaScript gzip growth against the recorded pre-redesign revision
  in `asset-baseline.json`. Unchanged player assets are excluded; transcript code
  is fetched only on request. The 30 KiB cap counts the largest selectable theme stylesheet plus shared
  additions, since only one theme stylesheet loads per page. Other changed assets
  are counted conservatively even when they do not all load on the same page.

These checks do not establish compatibility on physical Android/iOS devices or
validate live upstream YouTube responses, private playlist authorization, live
streams or premieres. Those need an operational instance and real device checks.
WebKit was downloaded locally but could not run because this host lacks its
required libicu74, libjpeg-turbo8 and libmanette libraries.

The UI uses the existing renderers, routes and preference storage. `ui_density`
accepts `balanced` (default) or `compact`. No database migration is required.
New strings use the existing English fallback until translations are supplied.

Theme fixtures also exercise registry fallback, configured defaults, JSON/YAML,
anonymous form cookies, account form storage, authenticated preferences and
preference export/import using in-memory SQLite tables. An additional theme is registered
only in the fixture process to check asset isolation and keyboard selection.
Diary fixtures cover light/dark/system modes, compact/thin layouts, RTL, enlarged
text, search and playlist rows, channels, history, login, errors and preferences.
Its CSS and doodles count toward the 30 KiB asset cap; lazy-loaded screenshot
previews use the separate budget below.
Diary also serves two theme-local fonts with `font-display: swap`: Dudu Calligraphy
(73,684 bytes) and Helvetica Punk (319,064 bytes), totaling 392,748 bytes
(383.5 KiB) before HTTP compression, separate from the CSS/JS budget. They are
requested only by Diary. Handwriting covers short interface text; dense reading
text and player controls retain system fonts. Browser checks await font loading
before measuring Diary layouts and verify forced-colors decoration removal.
The picker submits without JavaScript. See [theming](../../docs/theming.md).

Lazy-loaded theme preview images have a separate 24 KiB compressed budget; the
shared CSS/JavaScript budget remains 30 KiB. Modern Neon and Diary previews use
the same 1280×720 browse framing, downsampled to 640×360 WebP screenshots.

## DeArrow

DeArrow title replacement is opt-in under Preferences → Content. Both switches
are saved with the account (or in the preferences cookie for guests). The
`dearrow_enabled` and `dearrow_show_original` fields are also available through
the existing authenticated preferences API. No database migration or license
key is required. Instance operators can override their defaults through
`default_user_preferences` in the configuration.

The same-origin `GET /api/v1/dearrow/:id` endpoint returns `{"title": string | null}`
(or HTTP 400 for an invalid video ID). The server queries the fixed SponsorBlock
host using a four-character hash prefix, with a bounded in-memory cache and
four upstream requests at most. Upstream failures return a null title, leaving
the original visible. Browser requests are deferred until titles approach the
viewport. JavaScript-disabled pages retain their original titles.

Tests include ranking/trust rules, cache expiry and concurrency, guest/account/API
preference persistence, dynamic queue updates, safe text insertion, original-title
text swaps on hover or keyboard focus, disabled/failure fallbacks, and desktop/mobile screenshots. Database
checks use the existing SQLite fixture harness and separate account objects to
simulate sessions; they do not validate a deployed PostgreSQL login session.
New strings include English and Indonesian, with the existing English fallback
for other locales. Thumbnail URLs and existing video API metadata are unchanged.

Cinematic adds a standalone amber/charcoal theme, preserving light/dark/system
preferences and the existing default. Its fixtures cover the same six responsive
widths, enlarged text, RTL, compact/thin modes, no-JavaScript selection, and real
player controls. The picker preview is a reduced WebP capture of the dark browse
fixture; screenshots use synthetic media rather than upstream thumbnails.
Preview images share an aggregate allowance of 12 KiB per theme (36 KiB for
three themes), preserving the previous 24 KiB allowance for two themes.

Random themes use the existing preference storage: `theme` remains the active
registered style, `theme_random` enables selection, `theme_random_interval_hours`
accepts 1–168 (default 6), and `theme_random_next_at` holds a UTC epoch deadline.
Named theme selection disables Random. The first interval keeps the current
theme; overdue HTML navigation chooses once, excluding that theme. Account
updates use a conditional write so overlapping requests share one result.

Color mode remains `""` (System), `light`, or `dark`. The header cycles in that
order and `/toggle_theme?mode=...` can persist an explicit mode (including empty).
System follows browser-reported appearance live. Tests cover live media changes,
real cross-tab storage events, Random selection without JavaScript, and no theme
change on an open page after an elapsed interval. Physical Android/iOS, Windows,
and Linux desktop appearance integration still requires device testing.
