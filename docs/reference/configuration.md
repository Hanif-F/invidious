# Configuration defaults

[Documentation index](../README.md)

Generated from [src/invidious/config.cr](../../src/invidious/config.cr) by [generate_reference.py](../tools/generate_reference.py). Regenerate after changing the source; do not edit generated tables manually.

Values below are **code defaults**, expressed as Crystal literals, rather than deployment recommendations or fully serialized YAML. A dash means no explicit initializer. Nullable values without an initializer are unset; nonnullable fields are required when their structure is used. Converters normalize some values. See [configuration](../configuration.md) for precedence, examples and constraints.

## Top-level Config

| Key | Type | Code default |
| --- | --- | --- |
| `channel_threads` | `Int32` | `1` |
| `channel_refresh_interval` | `Time::Span` | `30.minutes` |
| `feed_threads` | `Int32` | `1` |
| `output` | `String` | `"STDOUT"` |
| `log_level` | `LogLevel` | `LogLevel::Info` |
| `colorize_logs` | `Bool` | `false` |
| `db` | `DBConfig?` | `nil` |
| `database_url` | `URI` | `URI.parse("")` |
| `full_refresh` | `Bool` | `false` |
| `jobs` | `inferred` | `Invidious::Jobs::JobsConfig.new` |
| `https_only` | `Bool?` | `—` |
| `hmac_key` | `String` | `""` |
| `dearrow_identity_key` | `String` | `""` |
| `domain` | `String?` | `—` |
| `alternative_domains` | `Array(String)` | `[] of String` |
| `use_pubsub_feeds` | `Bool \| Int32` | `false` |
| `popular_enabled` | `Bool` | `true` |
| `captcha_enabled` | `Bool` | `true` |
| `auth_trusted_proxies` | `Array(String)` | `[] of String` |
| `login_enabled` | `Bool` | `true` |
| `registration_enabled` | `Bool` | `true` |
| `statistics_enabled` | `Bool` | `false` |
| `admins` | `Array(String)` | `[] of String` |
| `external_port` | `Int32?` | `nil` |
| `default_user_preferences` | `ConfigPreferences` | `ConfigPreferences.from_yaml("")` |
| `dmca_content` | `Array(String)` | `[] of String` |
| `check_tables` | `Bool` | `false` |
| `cache_annotations` | `Bool` | `false` |
| `banner` | `String?` | `nil` |
| `hsts` | `Bool?` | `true` |
| `disable_proxy` | `Bool? \| Array(String)?` | `false` |
| `enable_user_notifications` | `Bool` | `true` |
| `modified_source_code_url` | `String?` | `nil` |
| `force_resolve` | `Socket::Family` | `Socket::Family::UNSPEC` |
| `port` | `Int32` | `3000` |
| `host_binding` | `String` | `"0.0.0.0"` |
| `socket_binding` | `SocketBindingConfig?` | `nil` |
| `pool_size` | `Int32` | `100` |
| `http_proxy` | `HTTPProxyConfig?` | `nil` |
| `use_innertube_for_captions` | `Bool` | `false` |
| `invidious_companion` | `Array(CompanionConfig)` | `[] of CompanionConfig` |
| `invidious_companion_key` | `String` | `""` |
| `cookies` | `HTTP::Cookies` | `HTTP::Cookies.new` |
| `playlist_length_limit` | `Int32` | `500` |
| `disable_abusable_api` | `Bool` | `false` |
| `videojs` | `VideoJSConfig` | `VideoJSConfig.from_yaml("")` |

## db

| Key | Type | Code default |
| --- | --- | --- |
| `user` | `String` | `—` |
| `password` | `String` | `—` |
| `host` | `String` | `—` |
| `port` | `Int32` | `—` |
| `dbname` | `String` | `—` |

## socket_binding

| Key | Type | Code default |
| --- | --- | --- |
| `path` | `String` | `—` |
| `permissions` | `String` | `—` |

## http_proxy

| Key | Type | Code default |
| --- | --- | --- |
| `type` | `String` | `"http"` |
| `user` | `String?` | `nil` |
| `password` | `String?` | `nil` |
| `host` | `String` | `—` |
| `port` | `Int32` | `—` |

## invidious_companion[]

| Key | Type | Code default |
| --- | --- | --- |
| `private_url` | `URI` | `URI.parse("")` |
| `public_url` | `URI` | `URI.parse("")` |
| `builtin_proxy` | `Bool` | `false` |

## videojs

| Key | Type | Code default |
| --- | --- | --- |
| `goal_buffer_length` | `Int32?` | `30` |
| `max_goal_buffer_length` | `Int32?` | `60` |

## default_user_preferences

| Key | Type | Code default |
| --- | --- | --- |
| `annotations` | `Bool` | `false` |
| `annotations_subscribed` | `Bool` | `false` |
| `preload` | `Bool` | `true` |
| `autoplay` | `Bool` | `false` |
| `captions` | `Array(String)` | `["", "", ""]` |
| `comments` | `Array(String)` | `["youtube", ""]` |
| `continue` | `Bool` | `false` |
| `continue_autoplay` | `Bool` | `true` |
| `dark_mode` | `String` | `""` |
| `theme` | `String` | `Invidious::Themes::DEFAULT` |
| `theme_random` | `Bool` | `false` |
| `theme_random_interval_hours` | `Int32` | `6` |
| `theme_random_next_at` | `Int64?` | `nil` |
| `latest_only` | `Bool` | `false` |
| `listen` | `Bool` | `false` |
| `local` | `Bool` | `false` |
| `locale` | `String` | `"en-US"` |
| `watch_history` | `Bool` | `true` |
| `max_results` | `Int32` | `40` |
| `notifications_only` | `Bool` | `false` |
| `player_style` | `String` | `"invidious"` |
| `video_codec` | `String` | `"auto"` |
| `preferred_audio` | `String` | `"original"` |
| `quality` | `String` | `"dash"` |
| `quality_dash` | `String` | `"auto"` |
| `default_home` | `String?` | `"Popular"` |
| `feed_menu` | `Array(String)` | `["Popular", "Trending", "Subscriptions", "Playlists"]` |
| `automatic_instance_redirect` | `Bool` | `false` |
| `region` | `String` | `"US"` |
| `timezone` | `String?` | `nil` |
| `show_member_videos` | `Bool` | `false` |
| `related_videos` | `Bool` | `true` |
| `sort` | `String` | `"published"` |
| `speed` | `Float32` | `1.0_f32` |
| `thin_mode` | `Bool` | `false` |
| `ui_density` | `String` | `"balanced"` |
| `unseen_only` | `Bool` | `false` |
| `video_loop` | `Bool` | `false` |
| `extend_desc` | `Bool` | `false` |
| `vr_mode` | `Bool` | `true` |
| `show_nick` | `Bool` | `true` |
| `save_player_pos` | `Bool` | `false` |
| `default_playlist` | `String?` | `nil` |
| `sponsorblock_enabled` | `Bool` | `false` |
| `sponsorblock_modes` | `Hash(String, String)` | `Invidious::SponsorBlock::Modes.normalize({} of String => String)` |
| `sponsorblock_colors` | `Hash(String, String)` | `Invidious::SponsorBlock::Colors.normalize({} of String => String)` |
| `dearrow_enabled` | `Bool` | `false` |
| `ai_blocklist_feeds` | `Bool` | `false` |
| `ai_blocklist_search` | `Bool` | `false` |
| `ai_blocklist_recommendations` | `Bool` | `false` |
| `ai_warnlist_feeds` | `Bool` | `false` |
| `ai_warnlist_search` | `Bool` | `false` |
| `ai_warnlist_recommendations` | `Bool` | `false` |
| `ai_blocklist_action` | `String` | `"hide"` |
| `ai_warnlist_action` | `String` | `"hide"` |
| `ai_blocklist_other_pages` | `Bool` | `false` |
| `ai_warnlist_other_pages` | `Bool` | `false` |
| `ai_filter_enabled` | `Bool?` | `nil` |
| `dearrow_show_original` | `Bool` | `true` |
| `search_privacy` | `Bool` | `false` |
| `ai_blocklist_feeds_action` | `String?` | `nil` |
| `ai_blocklist_search_action` | `String?` | `nil` |
| `ai_blocklist_recommendations_action` | `String?` | `nil` |
| `ai_blocklist_other_pages_action` | `String?` | `nil` |
| `ai_warnlist_feeds_action` | `String?` | `nil` |
| `ai_warnlist_search_action` | `String?` | `nil` |
| `ai_warnlist_recommendations_action` | `String?` | `nil` |
| `ai_warnlist_other_pages_action` | `String?` | `nil` |

`default_user_preferences.default_playlist` is annotated YAML-ignored and cannot seed a playlist through this structure. Runtime user `timezone` and `theme_random_next_at` initialize to nil rather than copying the similarly named configuration fields. See the [runtime preference expressions](preferences.md) for exact initialization.

## Jobs

`jobs` is generated from `BaseJob` subclasses. Each structure has `enable: true`. The current startup path registers fresh job objects without assigning `CONFIG.jobs` to their `cfg`; the parsed nested values are therefore not an effective job-disable mechanism in this checkout. Use the documented top-level startup switches where provided. See [operations](../operations.md).
