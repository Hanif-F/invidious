# Development and testing

[Documentation index](README.md)

Use [getting started](getting-started.md) for runtime setup. This guide maps source changes to builds/tests and project tooling. Documentation-only changes use [documentation checks](documentation.md); they do not require starting the web app or contacting upstream services.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/invidious.cr`, `src/invidious/`, `src/ext/` | Startup, domain/routes/database/parsers/views/jobs and compatibility overrides |
| `assets/` | Runtime browser code, styles, icons/fonts/images, themes and pinned player dependencies |
| `locales/` | Translation JSON; active locale allowlist is in the source |
| `config/config.example.yml`, `config/sql/`, `config/security/` | Operator options, fresh DDL and compiled password-list/license |
| `spec/` | Crystal standard/Spectator unit/parser/helper tests and reduced local fixtures |
| `tests/frontend/` | Production-template fixture renderer, browser/Node checks and screenshot artifacts |
| `tests/database/` | Guarded real-PostgreSQL migration/storage/production-route integration harnesses |
| `mocks/` | Git submodule with upstream-shaped local test data and generation support |
| `scripts/` | Dependency fetching, licenses, database bootstrap, release prep and optional Git hook |
| `docker/`, `docker-compose.yml`, `invidious.service`, `nix/`, `kubernetes/` | Build/runtime/development deployment material |
| `.github/` | CI, release/container publishing, dependency and issue/PR templates |
| `docs/` | This handbook, existing specialist contracts and reproducible source references |
| Root README/changelogs/security/license files | Project overview, release history and retained release/security records |

`lib/`, `bin/`, generated fixtures, browser artifacts and test node_modules are ignored build/dependency output. Do not document vendored libraries as if the application owns their entire upstream API.

## Dependencies and builds

```sh
git submodule update --init mocks
shards install --skip-postinstall --skip-executables
crystal scripts/fetch-player-dependencies.cr
crystal build src/invidious.cr -Dskip_videojs_download -o /tmp/invidious-dev
crystal build src/invidious.cr -Dapi_only -Dskip_videojs_download -o /tmp/invidious-api
```

The skip flag assumes downloaded player assets are already present. Without it, compilation executes the dependency-fetching script. `--release` produces an optimized build; `-Dminified_player_dependencies` chooses minified fetched assets; `-Dskip_version_check` bypasses the minimum compiler guard for deliberate development use, not dependency compatibility.

`make` defaults release/debug symbols, installs production shards and builds `invidious`. Overrides include `RELEASE=0`, `STATIC=1`, `NO_DBG_SYMBOLS=1`, `API_ONLY=1`, `SKIP_VERSION_CHECK=1` and custom `FLAGS`. `make verify` checks compilation without code generation and skips player download. For tests/development, install development shards explicitly; a production-only dependency install omits Spectator/Ameba.

Nix users can inspect `nix/flake.nix`/`packages.nix` and use `nix develop ./nix`; `.envrc` supplies the repository's direnv integration. Runtime relative assets/locales/config depend on the working directory even when the binary is emitted into `/tmp`.

## Unit and compilation checks

```sh
crystal spec -Dskip_videojs_download
crystal tool format --check src spec tests scripts
crystal build src/invidious.cr -Dskip_videojs_download --no-codegen
crystal build src/invidious.cr -Dapi_only -Dskip_videojs_download --no-codegen
```

Run `bin/ameba` after development shards install when linting is relevant. The optional `scripts/git/pre-commit` hook formats and restages changed Crystal files, so inspect it before enabling. `.editorconfig` specifies two spaces, UTF-8, LF and final newlines for Crystal.

Focused tests are useful for parsers and isolated changes, for example `crystal spec spec/chapters_spec.cr spec/sponsorblock_spec.cr`. Specs using mocks require the submodule. Use real builds where link/runtime dependencies matter; a no-codegen pass alone does not test linkage or live startup.

Caption delivery checks use `crystal spec spec/caption_delivery_spec.cr` and
`crystal run tests/caption_delivery_routes.cr`. The latter executes the production
caption route with synthetic metadata and upstream transports, without PostgreSQL,
accounts or YouTube. It covers private Companion routing/signing, selectors,
attachment names, empty/malformed responses, translation and legacy backends.

Seek interval verification on 15 October 2026 passed full linked GUI and API-only
builds, 28 focused preference/chapter/spoiler/audio specs, production frontend
fixture checks, six Chromium/Firefox settings/seeking journeys, the storage/player
Node suites, and the complete guarded PostgreSQL account harness. The full
`crystal spec -Dskip_videojs_download` command stops at the existing undefined
`Invidious::Frontend::ChannelSpoilers` reference in `playlists.cr:585`, because
`spec/spec_helper.cr` omits that frontend helper. A temporary unchanged HEAD
snapshot reproduced the same failure. It is outside this preference addition.

## Frontend fixtures and browser tests

With Crystal/Shards, Node.js, FFmpeg and browser dependencies installed:

```sh
crystal run tests/frontend/render_fixtures.cr -Dskip_videojs_download
ffmpeg -f lavfi -i color=c=0x303a53:s=320x180:r=12 -t 4 -an -c:v libvpx -y tests/frontend/.generated/fixture.webm
ffmpeg -f lavfi -i color=c=0x303a53:s=320x180:r=12 -t 8 -an -c:v libvpx -y tests/frontend/.generated/clip-fixture.webm
npm ci --prefix tests/frontend --ignore-scripts
cd tests/frontend
npx playwright install --with-deps chromium firefox
npm test
```

The renderer uses production ECR/Crystal view logic with fixtures, without a running application, PostgreSQL or YouTube. Browser requests are intercepted and media is synthetic. `FRONTEND_BROWSERS` selects engines (default chromium,firefox). Screenshots in `tests/frontend/artifacts/` are inspection artifacts, not pixel-diff assertions. Generated `.generated/` files are ignored.

Node-only storage, playback-sync, clip editor/player and stream-menu tests can be run separately with `node --test` and their `.test.cjs` paths; `ui.test.cjs` needs fixtures and browser engines. [Frontend README](../tests/frontend/README.md) explains feature-specific coverage and physical/live limitations.

## Guarded PostgreSQL integration tests

Create separate disposable databases and supply the exact enforced name for each harness. They create/drop schemas and write accounts; never point them at production or another useful database.

| Harness | Environment variable | Required database name | Coverage |
| --- | --- | --- | --- |
| `tests/database/accounts.cr` | `ACCOUNT_TEST_DATABASE_URL` | `invidious_accounts_test` | Account migration/security, native account management, preferences/profiles, playlist/RSS, subscription manager, AI native routes and linked data |
| `tests/database/blocked_channels.cr` | `BLOCKING_TEST_DATABASE_URL` | `invidious_blocking_test` | Blocking plus playback migration/storage/import/retention |
| `tests/database/watch_history.cr` | `HISTORY_TEST_DATABASE_URL` | `invidious_history_test` | Detailed history, dates, cache recovery, durations, import/export |
| `tests/database/dearrow_identities.cr` | `DEARROW_TEST_DATABASE_URL` | `invidious_dearrow_test` | Identity persistence, concurrency, isolation and cascades |
| `tests/database/clips.cr` | `CLIPS_TEST_DATABASE_URL` | `invidious_clips_test` | Clip migration/routes, ownership/scopes/CSRF and immutable ranges |
| `tests/database/channel_avatars.cr` | `AVATAR_TEST_DATABASE_URL` | `invidious_avatars_test` | Avatar migration/cache/batching/failure isolation |
| `tests/database/ai_slist.cr` | `AI_SLIST_TEST_DATABASE_URL` | `invidious_ai_slist_test` | Snapshot/handle migration, offline recovery, stale/negative caching |

Example:

```sh
ACCOUNT_TEST_DATABASE_URL=postgres://postgres@localhost/invidious_accounts_test \
  crystal run tests/database/accounts.cr
```

The account/clip/avatar harnesses additionally require an empty database. Read [tests/database/README.md](../tests/database/README.md) for setup and included helpers, then destroy disposable databases after testing. Helper `*_checks.cr` files are often included by a harness rather than standalone executables.

## Choosing checks for a change

Parser/model changes need focused specs and full compile checking. Route/auth/database changes need matching PostgreSQL/production-route harnesses. Templates/player/styles/storage need fixture rendering and relevant Node/browser coverage, including mobile/RTL/no-JavaScript where supported. Schema changes need both fresh SQL and a numbered migration, plus migration tracking/backfill tests. API-only builds catch accidental GUI assumptions. Documentation updates need reference regeneration and local link/coverage checks.

Keep tests meaningful: fixture/browser passes do not certify real upstream parsing forever, physical codec decoding or deployed proxy security. Historical known failures in `SECURITY_READINESS.md` are prior observations, not current test execution results.

## CI, releases and maintenance tools

`.github/workflows/ci.yml` builds/tests a compiler matrix and Docker architectures, with a separate lint job. `frontend.yml` renders/browser-checks UI and runs selected blocking/account database suites; it does not automatically run every available harness or every Node test listed by local npm test. Container stable/nightly workflows and release prep are separate.

`scripts/fetch-player-dependencies.cr` resolves pinned player packages. `scripts/generate_js_licenses.cr` generates license markup used by the licenses page. `scripts/deploy-database.sh` bootstraps a role/database on systemd hosts. `scripts/install-dependencies.sh` installs platform prerequisites.

`scripts/create-release.py` prepares changelog prose through an external OpenAI-compatible endpoint, collects merged PRs through gh, updates shard/changelog versions and normally creates/pushes a release branch/PR. `--dry-run` still edits files and the current implementation still checks an API key and generates prose; it is not an offline/no-write switch. Inspect its arguments and workflow before intentional maintainer use. Tagging/publishing remain a separate release step. This documentation task does not run release tooling.
