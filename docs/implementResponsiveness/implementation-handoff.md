# Phone responsiveness implementation handoff

The local implementation follows stages 01 through 05. The browser matrix is registered in the existing Frontend regression tests workflow. Hosted GitHub Actions evidence is pending. Changes are staying local at the user's request.

## Stage 01. Foundation and shell

- The shared shell uses one navigation list. On phones it starts as a closed native disclosure. The enhanced drawer uses the same list, restores focus and scroll on dismissal, and releases its inert state and scroll lock at the breakpoint or on page departure.
- The phone media query governs viewport layout. The pointer query governs player gestures. Shared menu placement and modal sizing use the visible viewport and safe-area insets. One shared listener keeps focused modal fields visible as the visual viewport shrinks.
- The phone shell tests cover 767/768, 959/960, 500/501 height, and 568 × 320. The short drawer scrolls the focused link into view when tab order wraps. The native fallback runs both with JavaScript disabled and with the enhancement script unavailable. Desktop shell tests exercise profile collapse, long account labels, and the Watch drawer.
- The signed-in shell case exercises keyboard access to the complete role-filtered link list, scrim dismissal, and the account menu in RTL at 320 × 568 and 568 × 320 with simulated safe-area insets. Common notices move clear of the focused control on scroll, and the profile recovery case verifies that Refresh remains reachable through rotation.
- A short-landscape batch confirmation test runs without the Visual Viewport API and verifies that the heading stays visible as the user scrolls to the actions. Cancel retains the selection and issues no write.

## Stage 02. Discovery and library

- The fixture matrix covers home, search and filters, popular, trending, hashtags, channels, community posts, subscription feeds and management, history, library, playlists, mixes, Shows, clips, and playlist forms. Search aliases and configured home destinations share the existing search or feed templates. Channel aliases and individual tabs use the shared header and the corresponding channel, search, community, playlist, or clips body.
- Core channel tabs scroll inside their strip. More and About use the existing disclosure and fragment destination. Feed grids use one column in portrait and two in landscape when two 240 px cards fit.
- Phone reorder uses the existing owned-playlist commit and canonical positions. The phone case verifies 359/360 rows, the disabled boundary, exact occurrence IDs, one write per move, rotation during a drag and a submitted write, and stale recovery. The Save test verifies the native selector, scrolling inline creation, draft and selection retention through rotation, and return focus.

## Stage 03. Watch, player, and embed

- Watch keeps the existing player and tools. The phone tests cover repeated transcript and chapter shortcut activation, inline replay moving across the wider-layout breakpoint, and media identity and pause state through rotation. The docking test exercises 1099/1100. The fine-pointer settings case runs in both engines. The touch case uses Playwright's coarse-pointer context where the engine exposes it.
- The production Watch fixtures `d5-annotations-light` and `d5-vr-light` cover legacy annotations and the VR player. Both browsers rendered the annotation and resized it with the overlay, retained the VR canvas and keyboard-focusable play button, and kept the same media through rotation from 320 × 568 to 844 × 390.
- Watch aliases share the Watch destination. The fixture renderer checks that the Shorts ID alias retains the video ID, timestamp and audio-mode parameters. Clip creation, native clip, deletion and unavailable branches render distinct production fixtures. Standalone embeds cover source and queue variants. The ordinary HTML test checks 320 × 180 and 640 × 360 frames. The existing embed and Watch suites exercise media, continuations, access handoffs, fullscreen, and cached-page lifetimes.
- Clip time inputs stack below 360 px. The phone editor test retains a literal time draft and verifies that closing after rotation restores the Watch tools and focus on the same media.

## Stage 04. Settings, account, and status

- The native selector derives its choices from the existing role-filtered links. Go uses the link's current navigation owner. The focused test exercises an explicit load, failure and retry, active category, and a retained draft after rotation. The matrix covers the dedicated editors and checks accessible row headings and control names in the stacked AI Filter and SponsorBlock tables.
- The API-only fixture calls the production admin settings route for admin, denied, and guest identities. The account matrix includes ordinary forms, CAPTCHA, all seven import sources, consent and sessions, deletion, and TV pairing. Status fixtures cover browser and native verification, API-only recovery, iframe notices, errors, privacy, and the keyboard-focusable license table.
- The deterministic verification stub renders an iframe with the configured widget dimensions. It checks that a narrow page selects the compact widget and that rotation keeps the existing challenge. [Turnstile widget sizes](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/#widget-sizes)

## Stage 05. Verification and visuals

- Full-web and API-only production fixture renders passed. The phone matrix passed all 26 reported cases across 135 fixtures at the three required sizes in Chromium and Firefox. The focused phone, pointer, drawer and docking run passed all 28 cases. The separate legacy annotation and VR run passed all four cases with WebGL available in both engines.
- Both production build variants passed compiler verification with the workflow's Crystal 1.19.2. Both fixture renderers passed with that compiler as well. The original-title handler and the affected test assertions read the `Content-Type` header directly for compatibility with Crystal 1.19.2. Crystal and Spectator also reported 301 and 141 passing examples with the local Crystal 1.22.2 and loopback sockets available.
- Both frontend workflow database suites passed locally with Crystal 1.19.2 and the workflow's PostgreSQL versions, 14 for blocking and 16 for accounts. The account suite now verifies preservation of legacy data during migration and compares complete migrated rows before and after rename. It also asserts defaults for the columns added by migrations 26 and 27.
- Local Firefox 153 on this host requires a compatible FFmpeg library for the synthetic MP4, DASH and HLS cases. The seven affected tests also fail on the original revision with the default host libraries. All seven pass when the test process uses FFmpeg 7-compatible libraries.
- The legacy suite expected retired clip-annotation and recommendation selectors. The updated tests exercise the current Advanced menu and recommendation markup. Caption pixel comparisons isolate caption paint from player chrome during the screenshot while preserving the player layout and the original color and opacity assertions.
- The final local integrated run used fixtures rendered with Crystal 1.19.2 and passed all 978 tests with compatible codecs. It includes signed-in RTL navigation, notice placement, the clip editor, playlist drag and write rotation, batch confirmation without the Visual Viewport API, Settings accessibility, and legacy annotation, VR, and caption checks in Chromium and Firefox.
- The latest hosted browser job ran on an earlier commit and failed before the tests. Its Crystal installer received HTTP 404 responses for `libevent` packages on Ubuntu 24.04. The local workflow now refreshes apt indexes before installing Crystal. GitHub Actions lists no runs for the responsiveness branch. [Hosted browser job](https://github.com/Hanif-F/invidious/actions/runs/37775700600/job/113305845695)

Run from the repository root using the existing frontend dependencies and fixture media. The local integrated command used a process-scoped library path with FFmpeg 7-compatible codecs.

```sh
crystal run tests/frontend/render_fixtures.cr -Dskip_videojs_download
crystal run tests/frontend/render_recovery_fixtures.cr -Dapi_only -Dskip_videojs_download
crystal build src/invidious.cr -Dskip_videojs_download --no-codegen --error-trace
crystal build src/invidious.cr -Dapi_only -Dskip_videojs_download --no-codegen --error-trace
crystal spec -Dskip_videojs_download
BLOCKING_TEST_DATABASE_URL="$blocking_database_url" crystal run tests/database/blocked_channels.cr -Dskip_videojs_download
ACCOUNT_TEST_DATABASE_URL="$account_database_url" crystal run tests/database/accounts.cr -Dskip_videojs_download
node --test tests/frontend/responsive.test.cjs
node --test --test-name-pattern='phone |coarse pointer|D5 opt-in docking|desktop watch drawer' tests/frontend/overhaul.test.cjs
node --test --test-name-pattern='signed-in phone navigation|phone shell, sticky|phone feedback follows|persistent profile mismatch' tests/frontend/overhaul.test.cjs
node --test --test-name-pattern='phone legacy annotations|phone VR keeps' tests/frontend/overhaul.test.cjs
LD_LIBRARY_PATH=/tmp/invidious-ffmpeg61 npm test --prefix tests/frontend
python3 docs/tools/check_docs.py
git diff --check
```

The frontend matrix combines [phone geometry and ordinary HTML](../../tests/frontend/responsive.test.cjs) with [interactive phone and desktop coverage](../../tests/frontend/overhaul.test.cjs) and the existing feature suites. The shared-template fixture list and aliases in the [route index](README.md#route-and-surface-index) map route families to their rendered destinations. The API-only renderer retains its production login, verification, native handoff and error assertions. The generated handbook references were refreshed to clear pre-existing schema, migration, and source-map drift.

### Visual review

Artifacts are generated under `tests/frontend/artifacts/` and uploaded by Frontend regression tests. The following names omit the browser prefix and PNG extension. Both engines produce the same naming scheme.

| Artifact | Viewport and state | Fixture and owning test |
| --- | --- | --- |
| `overhaul/*-phone-drawer-320` | 320 × 568, guest drawer with keyboard focus | `overhaul-browse-light`, phone shell |
| `responsive/*-d3-search-light-320x568` and `*-844x390` | Guest, filter disclosure open with active chips | `d3-search-light`, geometry |
| `responsive/*-d3-channel-more-320x568` and `*-844x390` | Guest, tabs scrolled into view with an overflow tab selected | `d3-channel-more`, geometry and channel-tab keyboard case |
| `overhaul/*-phone-playlist-menu-320` | 320 × 568, owner occurrence menu open | `d4-playlist-light`, phone playlist moves |
| `overhaul/*-phone-transcript-320` | 320 × 568, guest with transcript open | `d5-transcript-only-light`, Watch shortcuts |
| `overhaul/*-phone-player-settings-320` | 320 × 568, guest fine-pointer Playback speed menu | `d5-single-light`, fine-pointer player settings |
| `overhaul/*-phone-save-320-keyboard` | 320 × 568, signed-in Save dialog with a simulated 260 px visible viewport | `overhaul-playlist-light`, phone Save |
| `responsive/*-settings-ai-filter-320x568` and `*-844x390` | Signed-in, AI Filter matrix scrolled into view | `settings-ai-filter`, geometry |
| `responsive/*-d7-signup-captcha-light-320x568` and `*-844x390` | Guest, registration form | `d7-signup-captcha-light`, geometry |
| `responsive/*-d7-verify-browser-light-320x568` and `*-844x390` | Guest, provider stub and recovery links | `d7-verify-browser-light`, geometry and rotation |
| `responsive/*-d7-embed-single-light-320x568` and `*-844x390` | Guest, standalone player | `d7-embed-single-light`, embed geometry |
| `responsive/*-d5-watch-rtl-enlarged-320x568` | Guest, enlarged RTL text | `d5-watch-rtl`, narrow accessibility |
| `overhaul/*-browse-light-1280` and `*-watch-dark-1280` | 1280 × 720, guest sidebar, grid and Watch desktop comparison | `overhaul-browse-light` and `overhaul-watch-dark`, desktop matrix |

Phone layout checks use desktop browsers with synthetic media, identities and responses. The shortened visual viewport is simulated. Physical phone keyboards, operating-system integrations and provider traffic were outside the local fixture run.
