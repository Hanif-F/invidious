# Configuration

[Documentation index](README.md)

Configuration is defined in [config.cr](../src/invidious/config.cr), with a commented operator example in [config.example.yml](../config/config.example.yml). The [generated defaults](reference/configuration.md) enumerate every property, including nested objects. Code defaults and comments in historical examples may differ; the implementation is authoritative.

## Loading and precedence

The application first loads YAML from `INVIDIOUS_CONFIG` when present. Otherwise it reads the path in `INVIDIOUS_CONFIG_FILE`, or `config/config.yml` by default. It then applies top-level `INVIDIOUS_<UPPERCASE_KEY>` environment overrides, parsed as YAML with the property's converter. Selected CLI arguments override the resulting configuration.

For example, `INVIDIOUS_PORT=4000`, `INVIDIOUS_REGISTRATION_ENABLED=false` and `INVIDIOUS_AUTH_TRUSTED_PROXIES='["127.0.0.1/32"]'` override top-level settings. Nested objects can be supplied as complete YAML values, such as `INVIDIOUS_DB`; independent variables like `INVIDIOUS_DB_PASSWORD` are not implemented. Even when all useful values are supplied as individual overrides, the initial YAML document must still exist; `INVIDIOUS_CONFIG='{}'` can supply an empty document.

Never commit a live config, database URL, cookies or keys. The [example config](examples/config.yml) deliberately contains `CHANGE_ME!!` placeholders that must be replaced before startup.

## Required values and validation

| Setting | Contract |
| --- | --- |
| `database_url` or `db` | A PostgreSQL URI, or all of `user`, `password`, `host`, `port`, `dbname`; explicit URI wins |
| `hmac_key` | Nonempty signing secret, persistent and shared across instances using the same accounts |
| `invidious_companion` | Nonempty array needed for video extraction/playback; absent configuration logs a warning |
| `invidious_companion_key` | Exactly 16 characters when a companion is configured; must match the companion deployment |
| `dearrow_identity_key` | Dedicated 64-character hexadecimal key for contributions; empty/malformed disables contributions, not title reads |
| `socket_binding` | Existing parent directory, file path rather than directory, octal permission string in `000`–`777` |

Any top-level property set to the literal `CHANGE_ME!!` aborts configuration loading. Generate independent keys with `openssl rand -hex 32` for HMAC/DeArrow and `openssl rand -hex 8` for the 16-character companion key. Record them in protected deployment configuration. Replacing the DeArrow key without re-encryption makes saved identities unreadable.

## Listener, public origin and reverse proxy

`host_binding` and `port` default to `0.0.0.0:3000`; use loopback or a private network behind a reverse proxy. `socket_binding: {path: /run/invidious/app.sock, permissions: "660"}` selects Unix-socket binding. CLI host/port changes take precedence over ordinary defaults.

Set `domain`, `external_port` when appropriate, and `https_only: true` to describe the externally visible HTTPS origin. `https_only` affects generated URLs/cookies/headers; it does not install a TLS certificate or terminate HTTPS. `hsts` defaults true and emits HSTS when HTTPS is in use, including subdomains/preload. Enable it only for a domain whose intended subdomains support HTTPS.

`alternative_domains` permits listed forwarded hosts for cookie-domain selection. `auth_trusted_proxies` is independently used for authentication client-IP parsing. Configure only actual proxy CIDRs; its default empty list trusts no forwarding chain. See [security](security.md).

## Companion and outbound access

Each `invidious_companion` entry has `private_url` and optional `public_url`. `private_url` is the application-to-companion address. Omitting `public_url` assigns `/companion` and enables built-in proxy routing. A public URL must be browser-reachable and compatible with the site's TLS/CSP. Multiple companions are selected when metadata is fetched, and the chosen endpoint remains associated with cached metadata.

`pool_size` defaults 100 per pool. `force_resolve` accepts `ipv4`, `ipv6` or an unspecified value. `http_proxy` retains its historical name but supports `type: http`, `socks5` or `socks5h`, plus host/port and optional credentials. SOCKS target hostname resolution occurs on the proxy. This config is used by the application's YouTube connection layer; it is not a promise that every external integration or a separate companion process uses it.

`cookies` accepts `name=value; name2=value2` for upstream requests. Treat these as credentials. They are not browser account cookies and do not link an Invidious account to Google.

## Features, limits and jobs

| Settings | Effect |
| --- | --- |
| `login_enabled`, `registration_enabled`, `captcha_enabled` | Account access and optional registration challenge |
| `popular_enabled` | Popular refresh registration and feed behavior |
| `statistics_enabled` | Statistics collection; when disabled, `/api/v1/stats` still returns software metadata |
| `enable_user_notifications` | Registers browser notification control and authenticated stream endpoints |
| `playlist_length_limit` | Owned playlist capacity, default 500; separate account cap is 100 owned playlists |
| `channel_threads`, `feed_threads` | Register corresponding refresh jobs only when greater than zero |
| `channel_refresh_interval`, `full_refresh` | Channel refresh cadence and crawling depth |
| `use_pubsub_feeds` | Enables subscription refresh via PubSubHubbub configuration; requires reachable origin and signing key |
| `check_tables` | Legacy integrity/create checks at startup; not a substitute for `--migrate` |
| `cache_annotations` | Optional persistence of nonempty archived annotations |
| `disable_proxy` | Boolean or list containing `dash`, `livestreams`, `downloads`, `local` |
| `disable_abusable_api` | Rejects selected public video, clip and transcript metadata endpoints with 403 |
| `dmca_content` | Video ID list restricting download availability |
| `use_innertube_for_captions` | Selects transcript-backed captions instead of timedtext conversion in the legacy backend; configured Companion handles selected untranslated caption tracks first |
| `videojs` | Buffer targets `goal_buffer_length` and `max_goal_buffer_length` |

`jobs` parses generated per-job `enable` objects, but this checkout's startup does not copy them into each job object's configuration. Do not rely on nested `jobs.*.enable` to stop work. Top-level registration switches above are effective. This limitation is documented from [jobs.cr](../src/invidious/jobs.cr), [base_job.cr](../src/invidious/jobs/base_job.cr) and [startup](../src/invidious.cr).

## Presentation and defaults

`default_user_preferences` seeds preference parsing; it does not overwrite every saved account field. `default_playlist` is YAML-ignored in that defaults structure; runtime timezone and random-theme deadline initialize unset rather than copying the similarly named default fields. [Preferences](preferences.md) and its field inventory explain exact runtime initialization and legacy AI conversion. `banner` displays an announcement; `modified_source_code_url` adds a footer link to the deployed fork's source; `admins` identifies accounts allowed to change supported instance settings in the preferences form.

`output` chooses `STDOUT` or an append-only log path; its parent directory is created when needed. `log_level` accepts the levels in [logger.cr](../src/invidious/helpers/logger.cr). `colorize_logs` toggles terminal colors. Avoid credentials in banners and maintain independent redaction at the reverse proxy.

## Command-line and build controls

`./invidious --help` includes Kemal's options and application options: `-c/--channel-threads`, `-f/--feed-threads`, `-o/--output`, `-l/--log-level`, `-k/--colorize`, `-v/--version`, and `--migrate`. Application configuration and a working database connection are initialized before CLI handling, including the version/migration path.

Compile-time flags are separate: `api_only`, `skip_videojs_download`, `minified_player_dependencies`, `skip_version_check` and release/production controls. See [development](development.md) for exact build commands and [operations](operations.md) for rollout procedure.
