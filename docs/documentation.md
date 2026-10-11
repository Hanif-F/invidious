# Documentation coverage and maintenance

[Documentation index](README.md)

The handbook describes application behavior and operational workflows. Generated references enumerate code facts so broad coverage can be checked mechanically. Existing feature contracts remain intact; historical root security/release reports are linked as records rather than rewritten as new verification results.

## Coverage map

| Subsystem | Primary documentation | Implementation families |
| --- | --- | --- |
| Product scope and capability boundaries | [Overview](overview.md), [features](features.md) | Whole application and existing README |
| Startup, request context, middleware and build variants | [Architecture](architecture.md), [security](security.md) | `invidious.cr`, routing, helpers/handlers, before_all, http_server, ext |
| Configuration/CLI and nested defaults | [Configuration](configuration.md), [complete properties](reference/configuration.md) | config, preference converters, CLI startup |
| Local/Docker/service/Nix deployment | [Setup](getting-started.md), [operations](operations.md), [development](development.md) | Docker/compose, service, scripts, Nix, Kubernetes README |
| Video metadata, formats/audio, proxy/manifest/image routes | [Playback](playback.md), [API](api.md), [integrations](integrations.md) | videos, yt_backend, downloads, watch/embed, manifest/playback/images/companion |
| Captions, transcript, chapters, storyboards, annotations and VR | [Playback](playback.md), [API](api.md) | videos submodules, captions/API, player plugins |
| Comments, community posts and content links | [Discovery](search-and-feeds.md), [playback](playback.md), [API](api.md) | comments, channels/community, post/browser modules |
| Search, filters, hashtags, channel tabs and URL compatibility | [Discovery](search-and-feeds.md), [route reference](reference/routes.md) | search, channels, hashtag, routing, errors |
| Popular/trending, subscription views, notifications and RSS/OPML | [Discovery](search-and-feeds.md), [operations](operations.md) | feeds, trending, users, rss, notifications, jobs |
| Credentials, CAPTCHA, CSRF, session/token/account management | [Accounts](accounts-and-library.md), [security](security.md), [API](api.md) | user, database/accounts/sessions, tokens, login/account/mobile |
| Owned/saved playlists, source flags and occurrence identity | [Accounts](accounts-and-library.md), [native API](mobile-api.md) | playlists, native_playlists, saved_playlists, native_library |
| Native/YouTube clips and editor/player | [Clips](native-clips.md), [playback](playback.md), [API](api.md) | clips, clip validation, database/clips, templates and browser editor/player |
| Detailed history, watch indicators and synchronized positions | [Accounts](accounts-and-library.md), [playback](playback.md), [native API](mobile-api.md) | history, database history/positions, watched presentation/browser modules |
| Chat replay, filters, overlay and offsets | [Playback](playback.md), [preferences](preferences.md), [native API](mobile-api.md) | videos/live_chat, API chat settings, offsets, live-chat.js |
| Blocking and members-only visibility | [Accounts](accounts-and-library.md), [discovery](search-and-feeds.md), [native API](mobile-api.md) | blocked/member frontend, database, routes, extraction flags |
| SponsorBlock | [SponsorBlock](sponsorblock.md), [native API](mobile-api.md) | sponsorblock, channel preferences and browser skipping |
| DeArrow reads/contributions/identity encryption | [Integrations](integrations.md), [contributions](dearrow-contributions.md) | dearrow modules, identity, account APIs and browser modules |
| AI classifications/actions/status/handle lookup | [AI filter](ai-channel-filter.md), [native API](mobile-api.md) | ai_slist modules/API/runtime/job/database and thumbnail rendering |
| Avatars and safe shared cache enrichment | [Frontend](frontend.md), [native API](mobile-api.md) | helpers/frontend/jsonify/database/channel-avatar extraction |
| Guest/account preferences, browser storage and local fallbacks | [Preferences](preferences.md), [frontend](frontend.md) | preferences, browser_profiles, browser-storage.js, native validation |
| Themes, CSS, accessibility, localization and static caching | [Frontend](frontend.md), [theming](theming.md) | views, assets/css/themes/fonts, locales, i18n, static_assets_handler |
| Portable data formats and backup omissions | [Import/export](data-import-export.md), [operations](operations.md) | user/imports/exports, data_control, native_library |
| Tables, indexes, transactions, retention and migrations | [Database](database.md), [schema](reference/schema.md), [migrations](reference/migrations.md) | database, config/sql, migration runner |
| Background jobs, logs, monitoring, upgrades and rollback | [Operations](operations.md), [troubleshooting](troubleshooting.md) | jobs, logger, config, SQL, account security procedure |
| All HTTP surfaces and literal request reads | [Routes](reference/routes.md), [route inputs](reference/route-inputs.md), [API](api.md) | Every explicit routing registration and resolved handler |
| Source/template/asset/tool navigation | [Source map](reference/source-map.md), [development](development.md) | First-party source, scripts/styles, Docker/Nix/workflows |
| Unit/parser/browser/database/physical-test boundaries | [Development](development.md), existing test READMEs | spec, tests, mocks, CI |
| Releases, dependency fetches, licenses and issue maintenance | [Development](development.md), [integrations](integrations.md) | scripts, workflows, license files, changelogs, metadata |

## Generated references

From the repository root:

```sh
python3 docs/tools/generate_reference.py
python3 docs/tools/generate_reference.py --check
python3 docs/tools/check_docs.py
git diff --check
```

The generator requires Python 3.9+ with only its standard library and reads local source. It writes seven deterministic Markdown references: explicit method/path registrations and implementations, observed handler inputs, configuration defaults, preference fields, all fresh-install DDL, numbered migrations and first-party source/assets/tooling. `--check` compares expected content without rewriting documents and fails on drift.

The link checker validates local Markdown targets/fragments, fenced-code balance and reachability of every handbook page from the index. Remote links are retained references and are not network-checked. It also checks generated-reference drift. These are documentation checks, not application integration tests.

Extraction is deliberately conservative. Route inputs list direct literal reads; shared helpers and nested JSON keys add behavior explained in guides/source. Defaults are Crystal expressions, not a machine-generated deployment YAML. Source-map subjects are navigational labels, not complete per-function API docs. Static asset paths, implicit HEAD handling, error fallbacks and upstream renderer variants are documented by their subsystem rather than falsely presented as explicit route registrations.

## Updating the handbook

When adding a feature, document its entry point, guest/account/build availability, input/output and permissions, persistence, failure behavior and limits. Update the relevant guide/coverage row, then regenerate references. For schema changes, document both fresh-install DDL and the migration/restore path. For native contracts, explain optional fields and whether old tokens need renewed sign-in.

When modifying upstream-facing code, distinguish fixture tests from live integration checks. Keep prior verification reports dated and avoid reusing their pass counts as current claims. Document actual current source behavior even when a historical README/example suggests otherwise; examples include nested job switches, `--dry-run` release behavior, theme registration and portable export omissions.

Keep deployment secrets and user data out of examples. The sample config intentionally fails with `CHANGE_ME!!` until configured. Screenshots, build artifacts and Python bytecode are not part of these generated references. `.gitignore` admits handbook Markdown/reference/tools/examples so the new documentation can be reviewed and committed.
