# Source and asset map

[Documentation index](../README.md)

Generated from the first-party source tree, styles, browser modules and project tooling by [generate_reference.py](../tools/generate_reference.py). Regenerate after changing the source; do not edit generated tables manually.

This inventory covers **371 implementation and tooling files**. Names below describe each file's subject; directory introductions explain its role. Vendored `lib/` and `assets/videojs/`, translated locale JSON, binary artwork, mock data and generated test artifacts are described as families in [development](../development.md) and [frontend](../frontend.md). They are not expanded into duplicate source inventories.

## .github/workflows

CI, browser/database regression checks, container/release publishing and issue maintenance.

| File | Subject |
| --- | --- |
| [.github/workflows/auto-close-duplicate.yaml](../../.github/workflows/auto-close-duplicate.yaml) | auto close duplicate |
| [.github/workflows/build-nightly-container.yml](../../.github/workflows/build-nightly-container.yml) | build nightly container |
| [.github/workflows/build-stable-container.yml](../../.github/workflows/build-stable-container.yml) | build stable container |
| [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | ci |
| [.github/workflows/create-release.yml](../../.github/workflows/create-release.yml) | create release |
| [.github/workflows/frontend.yml](../../.github/workflows/frontend.yml) | frontend |
| [.github/workflows/stale.yml](../../.github/workflows/stale.yml) | stale |
## assets/css

Base, player, feature and layout styles; minified third-party styles retain their upstream role.

| File | Subject |
| --- | --- |
| [assets/css/carousel.css](../../assets/css/carousel.css) | carousel |
| [assets/css/clips.css](../../assets/css/clips.css) | clips |
| [assets/css/dearrow-contributions.css](../../assets/css/dearrow-contributions.css) | dearrow contributions |
| [assets/css/dearrow.css](../../assets/css/dearrow.css) | dearrow |
| [assets/css/default.css](../../assets/css/default.css) | default |
| [assets/css/embed.css](../../assets/css/embed.css) | embed |
| [assets/css/empty.css](../../assets/css/empty.css) | empty |
| [assets/css/grids-responsive-min.css](../../assets/css/grids-responsive-min.css) | grids responsive min |
| [assets/css/ionicons.min.css](../../assets/css/ionicons.min.css) | ionicons.min |
| [assets/css/live-chat.css](../../assets/css/live-chat.css) | live chat |
| [assets/css/player.css](../../assets/css/player.css) | player |
| [assets/css/pure-min.css](../../assets/css/pure-min.css) | pure min |
| [assets/css/quality-selector.css](../../assets/css/quality-selector.css) | quality selector |
| [assets/css/search.css](../../assets/css/search.css) | search |
| [assets/css/theme-picker.css](../../assets/css/theme-picker.css) | theme picker |
| [assets/css/video-actions.css](../../assets/css/video-actions.css) | video actions |
| [assets/css/videojs-youtube-annotations.min.css](../../assets/css/videojs-youtube-annotations.min.css) | videojs youtube annotations.min |
## assets/js

Browser behavior; individual module responsibilities are described in frontend documentation.

| File | Subject |
| --- | --- |
| [assets/js/_helpers.js](../../assets/js/_helpers.js) |  helpers |
| [assets/js/browser-storage.js](../../assets/js/browser-storage.js) | browser storage |
| [assets/js/clip-editor.js](../../assets/js/clip-editor.js) | clip editor |
| [assets/js/clip-loader.js](../../assets/js/clip-loader.js) | clip loader |
| [assets/js/clip-player.js](../../assets/js/clip-player.js) | clip player |
| [assets/js/comments.js](../../assets/js/comments.js) | comments |
| [assets/js/community.js](../../assets/js/community.js) | community |
| [assets/js/dearrow-contributions.js](../../assets/js/dearrow-contributions.js) | dearrow contributions |
| [assets/js/dearrow-loader.js](../../assets/js/dearrow-loader.js) | dearrow loader |
| [assets/js/dearrow.js](../../assets/js/dearrow.js) | dearrow |
| [assets/js/embed.js](../../assets/js/embed.js) | embed |
| [assets/js/handlers.js](../../assets/js/handlers.js) | handlers |
| [assets/js/interface.js](../../assets/js/interface.js) | interface |
| [assets/js/live-chat.js](../../assets/js/live-chat.js) | live chat |
| [assets/js/notifications.js](../../assets/js/notifications.js) | notifications |
| [assets/js/pagination.js](../../assets/js/pagination.js) | pagination |
| [assets/js/player-chapters.js](../../assets/js/player-chapters.js) | player chapters |
| [assets/js/player-mobile.js](../../assets/js/player-mobile.js) | player mobile |
| [assets/js/player-stats.js](../../assets/js/player-stats.js) | player stats |
| [assets/js/player-stream-menu.js](../../assets/js/player-stream-menu.js) | player stream menu |
| [assets/js/player-ui.js](../../assets/js/player-ui.js) | player ui |
| [assets/js/player.js](../../assets/js/player.js) | player |
| [assets/js/playlist_widget.js](../../assets/js/playlist_widget.js) | playlist widget |
| [assets/js/post.js](../../assets/js/post.js) | post |
| [assets/js/silvermine-videojs-quality-selector.min.js](../../assets/js/silvermine-videojs-quality-selector.min.js) | silvermine videojs quality selector.min |
| [assets/js/sponsorblock-preferences.js](../../assets/js/sponsorblock-preferences.js) | sponsorblock preferences |
| [assets/js/sponsorblock.js](../../assets/js/sponsorblock.js) | sponsorblock |
| [assets/js/sse.js](../../assets/js/sse.js) | sse |
| [assets/js/subscribe_widget.js](../../assets/js/subscribe_widget.js) | subscribe widget |
| [assets/js/themes.js](../../assets/js/themes.js) | themes |
| [assets/js/timezone.js](../../assets/js/timezone.js) | timezone |
| [assets/js/transcript.js](../../assets/js/transcript.js) | transcript |
| [assets/js/video-actions.js](../../assets/js/video-actions.js) | video actions |
| [assets/js/videojs-youtube-annotations.min.js](../../assets/js/videojs-youtube-annotations.min.js) | videojs youtube annotations.min |
| [assets/js/watch.js](../../assets/js/watch.js) | watch |
| [assets/js/watched_indicator.js](../../assets/js/watched_indicator.js) | watched indicator |
| [assets/js/watched_widget.js](../../assets/js/watched_widget.js) | watched widget |
## assets/themes

Theme stylesheets; companion previews, fonts and SVG artwork live alongside them.

| File | Subject |
| --- | --- |
| [assets/themes/diary/theme.css](../../assets/themes/diary/theme.css) | theme |
| [assets/themes/modern-neon/theme.css](../../assets/themes/modern-neon/theme.css) | theme |
## config/migrate-scripts

Historical shell migrations retained for legacy upgrades; not the modern migration runner.

| File | Subject |
| --- | --- |
| [config/migrate-scripts/migrate-db-17cf077.sh](../../config/migrate-scripts/migrate-db-17cf077.sh) | migrate db 17cf077 |
| [config/migrate-scripts/migrate-db-1c8075c.sh](../../config/migrate-scripts/migrate-db-1c8075c.sh) | migrate db 1c8075c |
| [config/migrate-scripts/migrate-db-1eca969.sh](../../config/migrate-scripts/migrate-db-1eca969.sh) | migrate db 1eca969 |
| [config/migrate-scripts/migrate-db-30e6d29.sh](../../config/migrate-scripts/migrate-db-30e6d29.sh) | migrate db 30e6d29 |
| [config/migrate-scripts/migrate-db-3646395.sh](../../config/migrate-scripts/migrate-db-3646395.sh) | migrate db 3646395 |
| [config/migrate-scripts/migrate-db-3bcb98e.sh](../../config/migrate-scripts/migrate-db-3bcb98e.sh) | migrate db 3bcb98e |
| [config/migrate-scripts/migrate-db-52cb239.sh](../../config/migrate-scripts/migrate-db-52cb239.sh) | migrate db 52cb239 |
| [config/migrate-scripts/migrate-db-6e51189.sh](../../config/migrate-scripts/migrate-db-6e51189.sh) | migrate db 6e51189 |
| [config/migrate-scripts/migrate-db-701b5ea.sh](../../config/migrate-scripts/migrate-db-701b5ea.sh) | migrate db 701b5ea |
| [config/migrate-scripts/migrate-db-88b7097.sh](../../config/migrate-scripts/migrate-db-88b7097.sh) | migrate db 88b7097 |
| [config/migrate-scripts/migrate-db-8e884fe.sh](../../config/migrate-scripts/migrate-db-8e884fe.sh) | migrate db 8e884fe |
## config/sql

Fresh-install table/index/constraint definitions.

| File | Subject |
| --- | --- |
| [config/sql/ai_slist_snapshots.sql](../../config/sql/ai_slist_snapshots.sql) | ai slist snapshots |
| [config/sql/annotations.sql](../../config/sql/annotations.sql) | annotations |
| [config/sql/auth_rate_limits.sql](../../config/sql/auth_rate_limits.sql) | auth rate limits |
| [config/sql/blocked_channels.sql](../../config/sql/blocked_channels.sql) | blocked channels |
| [config/sql/channel_avatars.sql](../../config/sql/channel_avatars.sql) | channel avatars |
| [config/sql/channel_handles.sql](../../config/sql/channel_handles.sql) | channel handles |
| [config/sql/channel_videos.sql](../../config/sql/channel_videos.sql) | channel videos |
| [config/sql/channels.sql](../../config/sql/channels.sql) | channels |
| [config/sql/chat_timing_offsets.sql](../../config/sql/chat_timing_offsets.sql) | chat timing offsets |
| [config/sql/clips.sql](../../config/sql/clips.sql) | clips |
| [config/sql/dearrow_identities.sql](../../config/sql/dearrow_identities.sql) | dearrow identities |
| [config/sql/nonces.sql](../../config/sql/nonces.sql) | nonces |
| [config/sql/playback_positions.sql](../../config/sql/playback_positions.sql) | playback positions |
| [config/sql/playlist_videos.sql](../../config/sql/playlist_videos.sql) | playlist videos |
| [config/sql/playlists.sql](../../config/sql/playlists.sql) | playlists |
| [config/sql/saved_playlists.sql](../../config/sql/saved_playlists.sql) | saved playlists |
| [config/sql/session_ids.sql](../../config/sql/session_ids.sql) | session ids |
| [config/sql/tv_pairings.sql](../../config/sql/tv_pairings.sql) | tv pairings |
| [config/sql/users.sql](../../config/sql/users.sql) | users |
| [config/sql/videos.sql](../../config/sql/videos.sql) | videos |
| [config/sql/watch_history.sql](../../config/sql/watch_history.sql) | watch history |
## docker

Image build and fresh-volume database initialization.

| File | Subject |
| --- | --- |
| [docker/Dockerfile](../../docker/Dockerfile) | Dockerfile |
| [docker/init-invidious-db.sh](../../docker/init-invidious-db.sh) | init invidious db |
## nix

Nix development shell and package definitions.

| File | Subject |
| --- | --- |
| [nix/flake.lock](../../nix/flake.lock) | flake |
| [nix/flake.nix](../../nix/flake.nix) | flake |
| [nix/packages.nix](../../nix/packages.nix) | packages |
| [nix/shell.nix](../../nix/shell.nix) | shell |
## scripts

Build, dependency, database, release and Git-hook tooling.

| File | Subject |
| --- | --- |
| [scripts/create-release.py](../../scripts/create-release.py) | create release |
| [scripts/deploy-database.sh](../../scripts/deploy-database.sh) | deploy database |
| [scripts/fetch-player-dependencies.cr](../../scripts/fetch-player-dependencies.cr) | fetch player dependencies |
| [scripts/generate_js_licenses.cr](../../scripts/generate_js_licenses.cr) | generate js licenses |
| [scripts/git/pre-commit](../../scripts/git/pre-commit) | pre commit |
| [scripts/install-dependencies.sh](../../scripts/install-dependencies.sh) | install dependencies |
## src/ext

Kemal compatibility overrides.

| File | Subject |
| --- | --- |
| [src/ext/kemal_static_file_handler.cr](../../src/ext/kemal_static_file_handler.cr) | kemal static file handler |
## src/invidious

Domain models and cross-cutting integrations, configuration and routing.

| File | Subject |
| --- | --- |
| [src/invidious/ai_slist.cr](../../src/invidious/ai_slist.cr) | ai slist |
| [src/invidious/ai_slist_api.cr](../../src/invidious/ai_slist_api.cr) | ai slist api |
| [src/invidious/ai_slist_runtime.cr](../../src/invidious/ai_slist_runtime.cr) | ai slist runtime |
| [src/invidious/browser_profiles.cr](../../src/invidious/browser_profiles.cr) | browser profiles |
| [src/invidious/clips.cr](../../src/invidious/clips.cr) | clips |
| [src/invidious/config.cr](../../src/invidious/config.cr) | config |
| [src/invidious/dearrow.cr](../../src/invidious/dearrow.cr) | dearrow |
| [src/invidious/dearrow_account.cr](../../src/invidious/dearrow_account.cr) | dearrow account |
| [src/invidious/dearrow_contributions.cr](../../src/invidious/dearrow_contributions.cr) | dearrow contributions |
| [src/invidious/dearrow_identity.cr](../../src/invidious/dearrow_identity.cr) | dearrow identity |
| [src/invidious/exceptions.cr](../../src/invidious/exceptions.cr) | exceptions |
| [src/invidious/hashtag.cr](../../src/invidious/hashtag.cr) | hashtag |
| [src/invidious/history.cr](../../src/invidious/history.cr) | history |
| [src/invidious/jobs.cr](../../src/invidious/jobs.cr) | jobs |
| [src/invidious/mixes.cr](../../src/invidious/mixes.cr) | mixes |
| [src/invidious/native_playlists.cr](../../src/invidious/native_playlists.cr) | native playlists |
| [src/invidious/native_preferences.cr](../../src/invidious/native_preferences.cr) | native preferences |
| [src/invidious/playlists.cr](../../src/invidious/playlists.cr) | playlists |
| [src/invidious/routing.cr](../../src/invidious/routing.cr) | routing |
| [src/invidious/rss.cr](../../src/invidious/rss.cr) | rss |
| [src/invidious/sponsorblock.cr](../../src/invidious/sponsorblock.cr) | sponsorblock |
| [src/invidious/themes.cr](../../src/invidious/themes.cr) | themes |
| [src/invidious/trending.cr](../../src/invidious/trending.cr) | trending |
| [src/invidious/users.cr](../../src/invidious/users.cr) | users |
| [src/invidious/videos.cr](../../src/invidious/videos.cr) | videos |
## src/invidious/channels

Channel metadata and tabs, community posts and upstream pagination.

| File | Subject |
| --- | --- |
| [src/invidious/channels/about.cr](../../src/invidious/channels/about.cr) | about |
| [src/invidious/channels/channels.cr](../../src/invidious/channels/channels.cr) | channels |
| [src/invidious/channels/community.cr](../../src/invidious/channels/community.cr) | community |
| [src/invidious/channels/playlists.cr](../../src/invidious/channels/playlists.cr) | playlists |
| [src/invidious/channels/videos.cr](../../src/invidious/channels/videos.cr) | videos |
## src/invidious/clips

Native clip range, timestamp and ID validation.

| File | Subject |
| --- | --- |
| [src/invidious/clips/validation.cr](../../src/invidious/clips/validation.cr) | validation |
## src/invidious/comments

YouTube and Reddit comment parsing, content and safe link handling.

| File | Subject |
| --- | --- |
| [src/invidious/comments/content.cr](../../src/invidious/comments/content.cr) | content |
| [src/invidious/comments/links_util.cr](../../src/invidious/comments/links_util.cr) | links util |
| [src/invidious/comments/reddit.cr](../../src/invidious/comments/reddit.cr) | reddit |
| [src/invidious/comments/reddit_types.cr](../../src/invidious/comments/reddit_types.cr) | reddit types |
| [src/invidious/comments/youtube.cr](../../src/invidious/comments/youtube.cr) | youtube |
## src/invidious/database

PostgreSQL persistence, ownership checks, cache queries and migration infrastructure.

| File | Subject |
| --- | --- |
| [src/invidious/database/accounts.cr](../../src/invidious/database/accounts.cr) | accounts |
| [src/invidious/database/ai_slist.cr](../../src/invidious/database/ai_slist.cr) | ai slist |
| [src/invidious/database/annotations.cr](../../src/invidious/database/annotations.cr) | annotations |
| [src/invidious/database/base.cr](../../src/invidious/database/base.cr) | base |
| [src/invidious/database/blocked_channels.cr](../../src/invidious/database/blocked_channels.cr) | blocked channels |
| [src/invidious/database/channel_avatars.cr](../../src/invidious/database/channel_avatars.cr) | channel avatars |
| [src/invidious/database/channels.cr](../../src/invidious/database/channels.cr) | channels |
| [src/invidious/database/chat_timing_offsets.cr](../../src/invidious/database/chat_timing_offsets.cr) | chat timing offsets |
| [src/invidious/database/clips.cr](../../src/invidious/database/clips.cr) | clips |
| [src/invidious/database/dearrow_identities.cr](../../src/invidious/database/dearrow_identities.cr) | dearrow identities |
| [src/invidious/database/migration.cr](../../src/invidious/database/migration.cr) | migration |
| [src/invidious/database/migrator.cr](../../src/invidious/database/migrator.cr) | migrator |
| [src/invidious/database/nonces.cr](../../src/invidious/database/nonces.cr) | nonces |
| [src/invidious/database/playback_positions.cr](../../src/invidious/database/playback_positions.cr) | playback positions |
| [src/invidious/database/playlists.cr](../../src/invidious/database/playlists.cr) | playlists |
| [src/invidious/database/saved_playlists.cr](../../src/invidious/database/saved_playlists.cr) | saved playlists |
| [src/invidious/database/sessions.cr](../../src/invidious/database/sessions.cr) | sessions |
| [src/invidious/database/statistics.cr](../../src/invidious/database/statistics.cr) | statistics |
| [src/invidious/database/subscription_manager.cr](../../src/invidious/database/subscription_manager.cr) | subscription manager |
| [src/invidious/database/tv_pairings.cr](../../src/invidious/database/tv_pairings.cr) | tv pairings |
| [src/invidious/database/users.cr](../../src/invidious/database/users.cr) | users |
| [src/invidious/database/videos.cr](../../src/invidious/database/videos.cr) | videos |
| [src/invidious/database/watch_history.cr](../../src/invidious/database/watch_history.cr) | watch history |
## src/invidious/database/migrations

Versioned transactional schema changes.

| File | Subject |
| --- | --- |
| [src/invidious/database/migrations/0001_create_channels_table.cr](../../src/invidious/database/migrations/0001_create_channels_table.cr) | 0001 create channels table |
| [src/invidious/database/migrations/0002_create_videos_table.cr](../../src/invidious/database/migrations/0002_create_videos_table.cr) | 0002 create videos table |
| [src/invidious/database/migrations/0003_create_channel_videos_table.cr](../../src/invidious/database/migrations/0003_create_channel_videos_table.cr) | 0003 create channel videos table |
| [src/invidious/database/migrations/0004_create_users_table.cr](../../src/invidious/database/migrations/0004_create_users_table.cr) | 0004 create users table |
| [src/invidious/database/migrations/0005_create_session_ids_table.cr](../../src/invidious/database/migrations/0005_create_session_ids_table.cr) | 0005 create session ids table |
| [src/invidious/database/migrations/0006_create_nonces_table.cr](../../src/invidious/database/migrations/0006_create_nonces_table.cr) | 0006 create nonces table |
| [src/invidious/database/migrations/0007_create_annotations_table.cr](../../src/invidious/database/migrations/0007_create_annotations_table.cr) | 0007 create annotations table |
| [src/invidious/database/migrations/0008_create_playlists_table.cr](../../src/invidious/database/migrations/0008_create_playlists_table.cr) | 0008 create playlists table |
| [src/invidious/database/migrations/0009_create_playlist_videos_table.cr](../../src/invidious/database/migrations/0009_create_playlist_videos_table.cr) | 0009 create playlist videos table |
| [src/invidious/database/migrations/0010_make_videos_unlogged.cr](../../src/invidious/database/migrations/0010_make_videos_unlogged.cr) | 0010 make videos unlogged |
| [src/invidious/database/migrations/0011_create_playback_positions_table.cr](../../src/invidious/database/migrations/0011_create_playback_positions_table.cr) | 0011 create playback positions table |
| [src/invidious/database/migrations/0012_create_blocked_channels_table.cr](../../src/invidious/database/migrations/0012_create_blocked_channels_table.cr) | 0012 create blocked channels table |
| [src/invidious/database/migrations/0013_create_dearrow_identities_table.cr](../../src/invidious/database/migrations/0013_create_dearrow_identities_table.cr) | 0013 create dearrow identities table |
| [src/invidious/database/migrations/0014_create_watch_history_table.cr](../../src/invidious/database/migrations/0014_create_watch_history_table.cr) | 0014 create watch history table |
| [src/invidious/database/migrations/0015_add_members_only.cr](../../src/invidious/database/migrations/0015_add_members_only.cr) | 0015 add members only |
| [src/invidious/database/migrations/0016_add_history_duration.cr](../../src/invidious/database/migrations/0016_add_history_duration.cr) | 0016 add history duration |
| [src/invidious/database/migrations/0017_secure_accounts.cr](../../src/invidious/database/migrations/0017_secure_accounts.cr) | 0017 secure accounts |
| [src/invidious/database/migrations/0018_create_chat_timing_offsets_table.cr](../../src/invidious/database/migrations/0018_create_chat_timing_offsets_table.cr) | 0018 create chat timing offsets table |
| [src/invidious/database/migrations/0019_create_clips_table.cr](../../src/invidious/database/migrations/0019_create_clips_table.cr) | 0019 create clips table |
| [src/invidious/database/migrations/0020_create_saved_playlists_table.cr](../../src/invidious/database/migrations/0020_create_saved_playlists_table.cr) | 0020 create saved playlists table |
| [src/invidious/database/migrations/0021_create_channel_avatars_table.cr](../../src/invidious/database/migrations/0021_create_channel_avatars_table.cr) | 0021 create channel avatars table |
| [src/invidious/database/migrations/0022_create_ai_slist_cache.cr](../../src/invidious/database/migrations/0022_create_ai_slist_cache.cr) | 0022 create ai slist cache |
| [src/invidious/database/migrations/0023_create_tv_pairings.cr](../../src/invidious/database/migrations/0023_create_tv_pairings.cr) | 0023 create tv pairings |
## src/invidious/frontend

Presentation helpers for cards, filters, history, channels and page data.

| File | Subject |
| --- | --- |
| [src/invidious/frontend/ai_channels.cr](../../src/invidious/frontend/ai_channels.cr) | ai channels |
| [src/invidious/frontend/ai_thumbnail.cr](../../src/invidious/frontend/ai_thumbnail.cr) | ai thumbnail |
| [src/invidious/frontend/blocked_channels.cr](../../src/invidious/frontend/blocked_channels.cr) | blocked channels |
| [src/invidious/frontend/channel_avatars.cr](../../src/invidious/frontend/channel_avatars.cr) | channel avatars |
| [src/invidious/frontend/channel_page.cr](../../src/invidious/frontend/channel_page.cr) | channel page |
| [src/invidious/frontend/comments_reddit.cr](../../src/invidious/frontend/comments_reddit.cr) | comments reddit |
| [src/invidious/frontend/comments_youtube.cr](../../src/invidious/frontend/comments_youtube.cr) | comments youtube |
| [src/invidious/frontend/member_videos.cr](../../src/invidious/frontend/member_videos.cr) | member videos |
| [src/invidious/frontend/misc.cr](../../src/invidious/frontend/misc.cr) | misc |
| [src/invidious/frontend/pagination.cr](../../src/invidious/frontend/pagination.cr) | pagination |
| [src/invidious/frontend/search_filters.cr](../../src/invidious/frontend/search_filters.cr) | search filters |
| [src/invidious/frontend/search_preferences.cr](../../src/invidious/frontend/search_preferences.cr) | search preferences |
| [src/invidious/frontend/subscription_manager.cr](../../src/invidious/frontend/subscription_manager.cr) | subscription manager |
| [src/invidious/frontend/watch_page.cr](../../src/invidious/frontend/watch_page.cr) | watch page |
| [src/invidious/frontend/watched_indicator.cr](../../src/invidious/frontend/watched_indicator.cr) | watched indicator |
## src/invidious/helpers

Shared rendering, errors, tokens, localization, logging and HTTP handlers.

| File | Subject |
| --- | --- |
| [src/invidious/helpers/channel_avatars.cr](../../src/invidious/helpers/channel_avatars.cr) | channel avatars |
| [src/invidious/helpers/crystal_class_overrides.cr](../../src/invidious/helpers/crystal_class_overrides.cr) | crystal class overrides |
| [src/invidious/helpers/errors.cr](../../src/invidious/helpers/errors.cr) | errors |
| [src/invidious/helpers/handlers.cr](../../src/invidious/helpers/handlers.cr) | handlers |
| [src/invidious/helpers/helpers.cr](../../src/invidious/helpers/helpers.cr) | helpers |
| [src/invidious/helpers/i18n.cr](../../src/invidious/helpers/i18n.cr) | i18n |
| [src/invidious/helpers/i18next.cr](../../src/invidious/helpers/i18next.cr) | i18next |
| [src/invidious/helpers/logger.cr](../../src/invidious/helpers/logger.cr) | logger |
| [src/invidious/helpers/macros.cr](../../src/invidious/helpers/macros.cr) | macros |
| [src/invidious/helpers/membership.cr](../../src/invidious/helpers/membership.cr) | membership |
| [src/invidious/helpers/serialized_yt_data.cr](../../src/invidious/helpers/serialized_yt_data.cr) | serialized yt data |
| [src/invidious/helpers/tokens.cr](../../src/invidious/helpers/tokens.cr) | tokens |
| [src/invidious/helpers/utils.cr](../../src/invidious/helpers/utils.cr) | utils |
| [src/invidious/helpers/webvtt.cr](../../src/invidious/helpers/webvtt.cr) | webvtt |
## src/invidious/http_server

HTTP utilities and static asset serving.

| File | Subject |
| --- | --- |
| [src/invidious/http_server/static_assets_handler.cr](../../src/invidious/http_server/static_assets_handler.cr) | static assets handler |
| [src/invidious/http_server/utils.cr](../../src/invidious/http_server/utils.cr) | utils |
## src/invidious/jobs

Long-running background refresh and cleanup fibers.

| File | Subject |
| --- | --- |
| [src/invidious/jobs/ai_slist_refresh_job.cr](../../src/invidious/jobs/ai_slist_refresh_job.cr) | ai slist refresh job |
| [src/invidious/jobs/base_job.cr](../../src/invidious/jobs/base_job.cr) | base job |
| [src/invidious/jobs/clear_expired_items_job.cr](../../src/invidious/jobs/clear_expired_items_job.cr) | clear expired items job |
| [src/invidious/jobs/instance_refresh_job.cr](../../src/invidious/jobs/instance_refresh_job.cr) | instance refresh job |
| [src/invidious/jobs/notification_job.cr](../../src/invidious/jobs/notification_job.cr) | notification job |
| [src/invidious/jobs/pull_popular_videos_job.cr](../../src/invidious/jobs/pull_popular_videos_job.cr) | pull popular videos job |
| [src/invidious/jobs/refresh_channels_job.cr](../../src/invidious/jobs/refresh_channels_job.cr) | refresh channels job |
| [src/invidious/jobs/refresh_feeds_job.cr](../../src/invidious/jobs/refresh_feeds_job.cr) | refresh feeds job |
| [src/invidious/jobs/statistics_refresh_job.cr](../../src/invidious/jobs/statistics_refresh_job.cr) | statistics refresh job |
| [src/invidious/jobs/subscribe_to_feeds_job.cr](../../src/invidious/jobs/subscribe_to_feeds_job.cr) | subscribe to feeds job |
## src/invidious/jsonify

Public JSON serialization and channel-avatar enrichment.

| File | Subject |
| --- | --- |
| [src/invidious/jsonify/api_v1/channel_avatars.cr](../../src/invidious/jsonify/api_v1/channel_avatars.cr) | channel avatars |
| [src/invidious/jsonify/api_v1/common.cr](../../src/invidious/jsonify/api_v1/common.cr) | common |
| [src/invidious/jsonify/api_v1/video_json.cr](../../src/invidious/jsonify/api_v1/video_json.cr) | video json |
## src/invidious/routes

HTTP page handlers, authentication context, redirects, RSS and proxy handlers.

| File | Subject |
| --- | --- |
| [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) | account |
| [src/invidious/routes/before_all.cr](../../src/invidious/routes/before_all.cr) | before all |
| [src/invidious/routes/blocked_channels.cr](../../src/invidious/routes/blocked_channels.cr) | blocked channels |
| [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) | channels |
| [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr) | clips |
| [src/invidious/routes/companion.cr](../../src/invidious/routes/companion.cr) | companion |
| [src/invidious/routes/dearrow_contributions.cr](../../src/invidious/routes/dearrow_contributions.cr) | dearrow contributions |
| [src/invidious/routes/embed.cr](../../src/invidious/routes/embed.cr) | embed |
| [src/invidious/routes/errors.cr](../../src/invidious/routes/errors.cr) | errors |
| [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr) | feeds |
| [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr) | images |
| [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr) | login |
| [src/invidious/routes/misc.cr](../../src/invidious/routes/misc.cr) | misc |
| [src/invidious/routes/notifications.cr](../../src/invidious/routes/notifications.cr) | notifications |
| [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) | playlists |
| [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr) | preferences |
| [src/invidious/routes/routes.cr](../../src/invidious/routes/routes.cr) | routes |
| [src/invidious/routes/rss_feeds.cr](../../src/invidious/routes/rss_feeds.cr) | rss feeds |
| [src/invidious/routes/search.cr](../../src/invidious/routes/search.cr) | search |
| [src/invidious/routes/sponsorblock_preferences.cr](../../src/invidious/routes/sponsorblock_preferences.cr) | sponsorblock preferences |
| [src/invidious/routes/subscriptions.cr](../../src/invidious/routes/subscriptions.cr) | subscriptions |
| [src/invidious/routes/tv_pairing.cr](../../src/invidious/routes/tv_pairing.cr) | tv pairing |
| [src/invidious/routes/video_playback.cr](../../src/invidious/routes/video_playback.cr) | video playback |
| [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) | watch |
## src/invidious/routes/api

JSON APIs, manifests and authenticated native contracts; see the API and route references.

| File | Subject |
| --- | --- |
| [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr) | manifest |
| [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr) | account |
| [src/invidious/routes/api/v1/ai_channels.cr](../../src/invidious/routes/api/v1/ai_channels.cr) | ai channels |
| [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) | authenticated |
| [src/invidious/routes/api/v1/blocked_channels.cr](../../src/invidious/routes/api/v1/blocked_channels.cr) | blocked channels |
| [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) | channels |
| [src/invidious/routes/api/v1/clips.cr](../../src/invidious/routes/api/v1/clips.cr) | clips |
| [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr) | dearrow |
| [src/invidious/routes/api/v1/downloads.cr](../../src/invidious/routes/api/v1/downloads.cr) | downloads |
| [src/invidious/routes/api/v1/feeds.cr](../../src/invidious/routes/api/v1/feeds.cr) | feeds |
| [src/invidious/routes/api/v1/live_chat.cr](../../src/invidious/routes/api/v1/live_chat.cr) | live chat |
| [src/invidious/routes/api/v1/misc.cr](../../src/invidious/routes/api/v1/misc.cr) | misc |
| [src/invidious/routes/api/v1/mobile.cr](../../src/invidious/routes/api/v1/mobile.cr) | mobile |
| [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr) | native library |
| [src/invidious/routes/api/v1/search.cr](../../src/invidious/routes/api/v1/search.cr) | search |
| [src/invidious/routes/api/v1/sponsorblock.cr](../../src/invidious/routes/api/v1/sponsorblock.cr) | sponsorblock |
| [src/invidious/routes/api/v1/tv_pairing.cr](../../src/invidious/routes/api/v1/tv_pairing.cr) | tv pairing |
| [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr) | videos |
## src/invidious/search

Query classification, filters, protobuf continuation construction and processors.

| File | Subject |
| --- | --- |
| [src/invidious/search/ctoken.cr](../../src/invidious/search/ctoken.cr) | ctoken |
| [src/invidious/search/filters.cr](../../src/invidious/search/filters.cr) | filters |
| [src/invidious/search/processors.cr](../../src/invidious/search/processors.cr) | processors |
| [src/invidious/search/query.cr](../../src/invidious/search/query.cr) | query |
## src/invidious/user

User models, credentials, cookies, preference converters, CAPTCHA and data exchange.

| File | Subject |
| --- | --- |
| [src/invidious/user/authentication.cr](../../src/invidious/user/authentication.cr) | authentication |
| [src/invidious/user/captcha.cr](../../src/invidious/user/captcha.cr) | captcha |
| [src/invidious/user/converters.cr](../../src/invidious/user/converters.cr) | converters |
| [src/invidious/user/cookies.cr](../../src/invidious/user/cookies.cr) | cookies |
| [src/invidious/user/credentials.cr](../../src/invidious/user/credentials.cr) | credentials |
| [src/invidious/user/exports.cr](../../src/invidious/user/exports.cr) | exports |
| [src/invidious/user/imports.cr](../../src/invidious/user/imports.cr) | imports |
| [src/invidious/user/preferences.cr](../../src/invidious/user/preferences.cr) | preferences |
| [src/invidious/user/user.cr](../../src/invidious/user/user.cr) | user |
## src/invidious/videos

Video metadata, captions/transcripts, chapters, music, downloads and archived chat parsing.

| File | Subject |
| --- | --- |
| [src/invidious/videos/audio_metadata.cr](../../src/invidious/videos/audio_metadata.cr) | audio metadata |
| [src/invidious/videos/caption.cr](../../src/invidious/videos/caption.cr) | caption |
| [src/invidious/videos/chapters.cr](../../src/invidious/videos/chapters.cr) | chapters |
| [src/invidious/videos/clip.cr](../../src/invidious/videos/clip.cr) | clip |
| [src/invidious/videos/description.cr](../../src/invidious/videos/description.cr) | description |
| [src/invidious/videos/downloads.cr](../../src/invidious/videos/downloads.cr) | downloads |
| [src/invidious/videos/formats.cr](../../src/invidious/videos/formats.cr) | formats |
| [src/invidious/videos/live_chat.cr](../../src/invidious/videos/live_chat.cr) | live chat |
| [src/invidious/videos/metadata.cr](../../src/invidious/videos/metadata.cr) | metadata |
| [src/invidious/videos/music.cr](../../src/invidious/videos/music.cr) | music |
| [src/invidious/videos/parser.cr](../../src/invidious/videos/parser.cr) | parser |
| [src/invidious/videos/regions.cr](../../src/invidious/videos/regions.cr) | regions |
| [src/invidious/videos/storyboard.cr](../../src/invidious/videos/storyboard.cr) | storyboard |
| [src/invidious/videos/transcript.cr](../../src/invidious/videos/transcript.cr) | transcript |
| [src/invidious/videos/video_preferences.cr](../../src/invidious/videos/video_preferences.cr) | video preferences |
## src/invidious/views

Server-rendered ECR pages and reusable UI components; see frontend documentation.

| File | Subject |
| --- | --- |
| [src/invidious/views/add_playlist_items.ecr](../../src/invidious/views/add_playlist_items.ecr) | add playlist items |
| [src/invidious/views/channel.ecr](../../src/invidious/views/channel.ecr) | channel |
| [src/invidious/views/channel_clips.ecr](../../src/invidious/views/channel_clips.ecr) | channel clips |
| [src/invidious/views/channel_search.ecr](../../src/invidious/views/channel_search.ecr) | channel search |
| [src/invidious/views/clip_unavailable.ecr](../../src/invidious/views/clip_unavailable.ecr) | clip unavailable |
| [src/invidious/views/community.ecr](../../src/invidious/views/community.ecr) | community |
| [src/invidious/views/components/ai-filter-empty.ecr](../../src/invidious/views/components/ai-filter-empty.ecr) | ai filter empty |
| [src/invidious/views/components/ai-filter-preferences.ecr](../../src/invidious/views/components/ai-filter-preferences.ecr) | ai filter preferences |
| [src/invidious/views/components/channel_info.ecr](../../src/invidious/views/components/channel_info.ecr) | channel info |
| [src/invidious/views/components/clip_dialog.ecr](../../src/invidious/views/components/clip_dialog.ecr) | clip dialog |
| [src/invidious/views/components/clip_editor.ecr](../../src/invidious/views/components/clip_editor.ecr) | clip editor |
| [src/invidious/views/components/clips.ecr](../../src/invidious/views/components/clips.ecr) | clips |
| [src/invidious/views/components/dearrow_contributions.ecr](../../src/invidious/views/components/dearrow_contributions.ecr) | dearrow contributions |
| [src/invidious/views/components/feed_menu.ecr](../../src/invidious/views/components/feed_menu.ecr) | feed menu |
| [src/invidious/views/components/item.ecr](../../src/invidious/views/components/item.ecr) | item |
| [src/invidious/views/components/items_paginated.ecr](../../src/invidious/views/components/items_paginated.ecr) | items paginated |
| [src/invidious/views/components/navigation.ecr](../../src/invidious/views/components/navigation.ecr) | navigation |
| [src/invidious/views/components/player.ecr](../../src/invidious/views/components/player.ecr) | player |
| [src/invidious/views/components/player_sources.ecr](../../src/invidious/views/components/player_sources.ecr) | player sources |
| [src/invidious/views/components/search_box.ecr](../../src/invidious/views/components/search_box.ecr) | search box |
| [src/invidious/views/components/subscribe_widget.ecr](../../src/invidious/views/components/subscribe_widget.ecr) | subscribe widget |
| [src/invidious/views/components/video-actions-dialog.ecr](../../src/invidious/views/components/video-actions-dialog.ecr) | video actions dialog |
| [src/invidious/views/components/video-context-buttons.ecr](../../src/invidious/views/components/video-context-buttons.ecr) | video context buttons |
| [src/invidious/views/create_clip.ecr](../../src/invidious/views/create_clip.ecr) | create clip |
| [src/invidious/views/create_playlist.ecr](../../src/invidious/views/create_playlist.ecr) | create playlist |
| [src/invidious/views/delete_clip.ecr](../../src/invidious/views/delete_clip.ecr) | delete clip |
| [src/invidious/views/delete_playlist.ecr](../../src/invidious/views/delete_playlist.ecr) | delete playlist |
| [src/invidious/views/edit_playlist.ecr](../../src/invidious/views/edit_playlist.ecr) | edit playlist |
| [src/invidious/views/embed.ecr](../../src/invidious/views/embed.ecr) | embed |
| [src/invidious/views/error.ecr](../../src/invidious/views/error.ecr) | error |
| [src/invidious/views/feeds/clips.ecr](../../src/invidious/views/feeds/clips.ecr) | clips |
| [src/invidious/views/feeds/history.ecr](../../src/invidious/views/feeds/history.ecr) | history |
| [src/invidious/views/feeds/playlists.ecr](../../src/invidious/views/feeds/playlists.ecr) | playlists |
| [src/invidious/views/feeds/popular.ecr](../../src/invidious/views/feeds/popular.ecr) | popular |
| [src/invidious/views/feeds/subscriptions.ecr](../../src/invidious/views/feeds/subscriptions.ecr) | subscriptions |
| [src/invidious/views/feeds/trending.ecr](../../src/invidious/views/feeds/trending.ecr) | trending |
| [src/invidious/views/hashtag.ecr](../../src/invidious/views/hashtag.ecr) | hashtag |
| [src/invidious/views/licenses.ecr](../../src/invidious/views/licenses.ecr) | licenses |
| [src/invidious/views/message.ecr](../../src/invidious/views/message.ecr) | message |
| [src/invidious/views/mix.ecr](../../src/invidious/views/mix.ecr) | mix |
| [src/invidious/views/playlist.ecr](../../src/invidious/views/playlist.ecr) | playlist |
| [src/invidious/views/post.ecr](../../src/invidious/views/post.ecr) | post |
| [src/invidious/views/privacy.ecr](../../src/invidious/views/privacy.ecr) | privacy |
| [src/invidious/views/search.ecr](../../src/invidious/views/search.ecr) | search |
| [src/invidious/views/search_homepage.ecr](../../src/invidious/views/search_homepage.ecr) | search homepage |
| [src/invidious/views/template.ecr](../../src/invidious/views/template.ecr) | template |
| [src/invidious/views/user/account.ecr](../../src/invidious/views/user/account.ecr) | account |
| [src/invidious/views/user/authorize_token.ecr](../../src/invidious/views/user/authorize_token.ecr) | authorize token |
| [src/invidious/views/user/blocked_channels.ecr](../../src/invidious/views/user/blocked_channels.ecr) | blocked channels |
| [src/invidious/views/user/change_password.ecr](../../src/invidious/views/user/change_password.ecr) | change password |
| [src/invidious/views/user/clear_watch_history.ecr](../../src/invidious/views/user/clear_watch_history.ecr) | clear watch history |
| [src/invidious/views/user/data_control.ecr](../../src/invidious/views/user/data_control.ecr) | data control |
| [src/invidious/views/user/delete_account.ecr](../../src/invidious/views/user/delete_account.ecr) | delete account |
| [src/invidious/views/user/login.ecr](../../src/invidious/views/user/login.ecr) | login |
| [src/invidious/views/user/preferences.ecr](../../src/invidious/views/user/preferences.ecr) | preferences |
| [src/invidious/views/user/sponsorblock_channels.ecr](../../src/invidious/views/user/sponsorblock_channels.ecr) | sponsorblock channels |
| [src/invidious/views/user/subscription_manager.ecr](../../src/invidious/views/user/subscription_manager.ecr) | subscription manager |
| [src/invidious/views/user/token_manager.ecr](../../src/invidious/views/user/token_manager.ecr) | token manager |
| [src/invidious/views/user/tv_pairing.ecr](../../src/invidious/views/user/tv_pairing.ecr) | tv pairing |
| [src/invidious/views/watch.ecr](../../src/invidious/views/watch.ecr) | watch |
## src/invidious/yt_backend

YouTube Innertube requests, extraction, connection pooling, URL validation and outbound proxies.

| File | Subject |
| --- | --- |
| [src/invidious/yt_backend/connection_pool.cr](../../src/invidious/yt_backend/connection_pool.cr) | connection pool |
| [src/invidious/yt_backend/extractors.cr](../../src/invidious/yt_backend/extractors.cr) | extractors |
| [src/invidious/yt_backend/extractors_utils.cr](../../src/invidious/yt_backend/extractors_utils.cr) | extractors utils |
| [src/invidious/yt_backend/socks_proxy.cr](../../src/invidious/yt_backend/socks_proxy.cr) | socks proxy |
| [src/invidious/yt_backend/url_sanitizer.cr](../../src/invidious/yt_backend/url_sanitizer.cr) | url sanitizer |
| [src/invidious/yt_backend/youtube_api.cr](../../src/invidious/yt_backend/youtube_api.cr) | youtube api |
## src

Application entry point and startup wiring.

| File | Subject |
| --- | --- |
| [src/invidious.cr](../../src/invidious.cr) | invidious |
