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
  is fetched only on request. The 30 KiB cap also includes changed assets that do
  not all load on the same page, making this a conservative asset budget.

These checks do not establish compatibility on physical Android/iOS devices or
validate live upstream YouTube responses, private playlist authorization, live
streams or premieres. Those need an operational instance and real device checks.
WebKit was downloaded locally but could not run because this host lacks its
required libicu74, libjpeg-turbo8 and libmanette libraries.

The UI uses the existing renderers, routes and preference storage. `ui_density`
accepts `balanced` (default) or `compact`. No database migration is required.
New strings use the existing English fallback until translations are supplied.
