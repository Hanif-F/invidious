# HTTP route reference

[Documentation index](../README.md)

Generated from [src/invidious/routing.cr](../../src/invidious/routing.cr) by [generate_reference.py](../tools/generate_reference.py). Regenerate after changing the source; do not edit generated tables manually.

All **253 explicit method/path registrations** are listed in registration order. `:id` and other colon names are path parameters; `*` is a wildcard. Static assets and Kemal's implicit handling (such as HEAD) are not separate rows.

GUI groups are omitted by `-Dapi_only`. RSS, JSON API, manifests, image/media proxies and configured companion routes remain. `/companion/*` requires a nonempty companion configuration. Notification registrations require `enable_user_notifications`. Public routes can still enforce resource privacy; `/api/v1/auth/*` always passes authentication. See [API conventions](../api.md), [security](../security.md), and [playback](../playback.md) for contracts.


## All

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/verify` | `Routes::Verification.page` | [src/invidious/routes/verification.cr](../../src/invidious/routes/verification.cr) |
| GET | `/api/v1/verification` | `Routes::Verification.status` | [src/invidious/routes/verification.cr](../../src/invidious/routes/verification.cr) |
| POST | `/api/v1/verification/complete` | `Routes::Verification.complete` | [src/invidious/routes/verification.cr](../../src/invidious/routes/verification.cr) |
| GET | `/admin/bot-protection` | `Routes::Verification.admin` | [src/invidious/routes/verification.cr](../../src/invidious/routes/verification.cr) |
| POST | `/admin/bot-protection` | `Routes::Verification.admin` | [src/invidious/routes/verification.cr](../../src/invidious/routes/verification.cr) |
| GET | `/login` | `Routes::Login.login_page` | [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr) |
| POST | `/login` | `Routes::Login.login` | [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr) |
| POST | `/signout` | `Routes::Login.signout` | [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr) |
| GET | `/` | `Routes::Misc.home` | [src/invidious/routes/misc.cr](../../src/invidious/routes/misc.cr) |
| GET | `/privacy` | `Routes::Misc.privacy` | [src/invidious/routes/misc.cr](../../src/invidious/routes/misc.cr) |
| GET | `/licenses` | `Routes::Misc.licenses` | [src/invidious/routes/misc.cr](../../src/invidious/routes/misc.cr) |
| GET | `/redirect` | `Routes::Misc.cross_instance_redirect` | [src/invidious/routes/misc.cr](../../src/invidious/routes/misc.cr) |
| GET | `/feed/webhook/:token` | `Routes::Feeds.push_notifications_get` | [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr) |
| POST | `/feed/webhook/:token` | `Routes::Feeds.push_notifications_post` | [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr) |
| GET | `/modify_notifications` | `Routes::Notifications.modify` | [src/invidious/routes/notifications.cr](../../src/invidious/routes/notifications.cr) |

## User routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/signup` | `Routes::Login.signup_page` | [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr) |
| POST | `/signup` | `Routes::Login.signup` | [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr) |
| GET | `/create_clip` | `Routes::Clips.new_page` | [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr) |
| POST | `/create_clip` | `Routes::Clips.create` | [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr) |
| GET | `/delete_clip` | `Routes::Clips.delete_page` | [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr) |
| POST | `/delete_clip` | `Routes::Clips.delete` | [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr) |
| GET | `/account` | `Routes::Account.get_account` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| POST | `/account/username` | `Routes::Account.post_username` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| GET | `/login` | `Routes::Login.login_page` | [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr) |
| POST | `/login` | `Routes::Login.login` | [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr) |
| POST | `/signout` | `Routes::Login.signout` | [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr) |
| GET | `/tv` | `Routes::TvPairing.show` | [src/invidious/routes/tv_pairing.cr](../../src/invidious/routes/tv_pairing.cr) |
| POST | `/tv` | `Routes::TvPairing.submit` | [src/invidious/routes/tv_pairing.cr](../../src/invidious/routes/tv_pairing.cr) |
| GET | `/blocked_channels` | `Routes::BlockedChannels.index` | [src/invidious/routes/blocked_channels.cr](../../src/invidious/routes/blocked_channels.cr) |
| POST | `/blocked_channels` | `Routes::BlockedChannels.update` | [src/invidious/routes/blocked_channels.cr](../../src/invidious/routes/blocked_channels.cr) |
| POST | `/dearrow_submit` | `Routes::DeArrowContributions.submit` | [src/invidious/routes/dearrow_contributions.cr](../../src/invidious/routes/dearrow_contributions.cr) |
| POST | `/dearrow_identity` | `Routes::DeArrowContributions.identity` | [src/invidious/routes/dearrow_contributions.cr](../../src/invidious/routes/dearrow_contributions.cr) |
| GET | `/video_actions` | `Routes::BlockedChannels.video_actions` | [src/invidious/routes/blocked_channels.cr](../../src/invidious/routes/blocked_channels.cr) |
| GET | `/preferences/sponsorblock/channels` | `Routes::SponsorBlockPreferences.show` | [src/invidious/routes/sponsorblock_preferences.cr](../../src/invidious/routes/sponsorblock_preferences.cr) |
| POST | `/preferences/sponsorblock/channels` | `Routes::SponsorBlockPreferences.update` | [src/invidious/routes/sponsorblock_preferences.cr](../../src/invidious/routes/sponsorblock_preferences.cr) |
| GET | `/preferences/spoilers/channels` | `Routes::ChannelSpoilerPreferences.show` | [src/invidious/routes/channel_spoiler_preferences.cr](../../src/invidious/routes/channel_spoiler_preferences.cr) |
| POST | `/preferences/spoilers/channels` | `Routes::ChannelSpoilerPreferences.update` | [src/invidious/routes/channel_spoiler_preferences.cr](../../src/invidious/routes/channel_spoiler_preferences.cr) |
| GET | `/preferences` | `Routes::PreferencesRoute.show` | [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr) |
| POST | `/preferences` | `Routes::PreferencesRoute.update` | [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr) |
| POST | `/preferences/timezone` | `Routes::PreferencesRoute.detect_timezone` | [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr) |
| POST | `/toggle_theme` | `Routes::PreferencesRoute.toggle_theme` | [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr) |
| GET | `/data_control` | `Routes::PreferencesRoute.data_control` | [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr) |
| POST | `/data_control` | `Routes::PreferencesRoute.update_data_control` | [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr) |
| GET | `/change_password` | `Routes::Account.get_change_password` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| POST | `/change_password` | `Routes::Account.post_change_password` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| GET | `/delete_account` | `Routes::Account.get_delete` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| POST | `/delete_account` | `Routes::Account.post_delete` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| GET | `/clear_watch_history` | `Routes::Account.get_clear_history` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| POST | `/clear_watch_history` | `Routes::Account.post_clear_history` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| GET | `/authorize_token` | `Routes::Account.get_authorize_token` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| POST | `/authorize_token` | `Routes::Account.post_authorize_token` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| GET | `/token_manager` | `Routes::Account.token_manager` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| POST | `/token_ajax` | `Routes::Account.token_ajax` | [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr) |
| POST | `/subscription_ajax` | `Routes::Subscriptions.toggle_subscription` | [src/invidious/routes/subscriptions.cr](../../src/invidious/routes/subscriptions.cr) |
| GET | `/subscription_manager` | `Routes::Subscriptions.subscription_manager` | [src/invidious/routes/subscriptions.cr](../../src/invidious/routes/subscriptions.cr) |

## Iv playlist routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/create_playlist` | `Routes::Playlists.new` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |
| POST | `/create_playlist` | `Routes::Playlists.create` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |
| POST | `/subscribe_playlist` | `Routes::Playlists.subscribe` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |
| GET | `/delete_playlist` | `Routes::Playlists.delete_page` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |
| POST | `/delete_playlist` | `Routes::Playlists.delete` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |
| GET | `/edit_playlist` | `Routes::Playlists.edit` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |
| POST | `/edit_playlist` | `Routes::Playlists.update` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |
| GET | `/add_playlist_items` | `Routes::Playlists.add_playlist_items_page` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |
| POST | `/playlist_ajax` | `Routes::Playlists.playlist_ajax` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |

## Feed routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/view_all_playlists` | `Routes::Feeds.view_all_playlists_redirect` | [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr) |
| GET | `/feed/playlists` | `Routes::Feeds.playlists` | [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr) |
| GET | `/feed/popular` | `Routes::Feeds.popular` | [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr) |
| GET | `/feed/trending` | `Routes::Feeds.trending` | [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr) |
| GET | `/feed/subscriptions` | `Routes::Feeds.subscriptions` | [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr) |
| GET | `/feed/history` | `Routes::Feeds.history` | [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr) |
| GET | `/feed/clips` | `Routes::Clips.index` | [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr) |

## Rss routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/feed/channel/:ucid` | `Routes::Feeds.rss_channel` | [src/invidious/routes/rss_feeds.cr](../../src/invidious/routes/rss_feeds.cr) |
| GET | `/feed/private` | `Routes::Feeds.rss_private` | [src/invidious/routes/rss_feeds.cr](../../src/invidious/routes/rss_feeds.cr) |
| GET | `/feed/playlist/:plid` | `Routes::Feeds.rss_playlist` | [src/invidious/routes/rss_feeds.cr](../../src/invidious/routes/rss_feeds.cr) |
| GET | `/feeds/videos.xml` | `Routes::Feeds.rss_videos` | [src/invidious/routes/rss_feeds.cr](../../src/invidious/routes/rss_feeds.cr) |

## Channel routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/channel/:ucid` | `Routes::Channels.home` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/home` | `Routes::Channels.home` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/videos` | `Routes::Channels.videos` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/search` | `Routes::Channels.search` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| POST | `/channel/:ucid/search` | `Routes::Channels.search` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/shorts` | `Routes::Channels.shorts` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/streams` | `Routes::Channels.streams` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/podcasts` | `Routes::Channels.podcasts` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/releases` | `Routes::Channels.releases` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/courses` | `Routes::Channels.courses` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/playlists` | `Routes::Channels.playlists` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/clips` | `Routes::Channels.clips` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/community` | `Routes::Channels.community` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/posts` | `Routes::Channels.community` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/channels` | `Routes::Channels.channels` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/about` | `Routes::Channels.about` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/live` | `Routes::Channels.live` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/user/:user/live` | `Routes::Channels.live` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/c/:user/live` | `Routes::Channels.live` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/post/:id` | `Routes::Channels.post` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/channel/:ucid/*` | `Routes::Channels.redirect_home` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/c/:user` | `Routes::Channels.brand_redirect` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/c/:user/:tab` | `Routes::Channels.brand_redirect` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/user/:user` | `Routes::Channels.brand_redirect` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/user/:user/:tab` | `Routes::Channels.brand_redirect` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/@:user` | `Routes::Channels.brand_redirect` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/@:user/:tab` | `Routes::Channels.brand_redirect` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/attribution_link` | `Routes::Channels.brand_redirect` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/attribution_link/:tab` | `Routes::Channels.brand_redirect` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/profile` | `Routes::Channels.profile` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |
| GET | `/profile/*` | `Routes::Channels.profile` | [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr) |

## Watch routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/watch` | `Routes::Watch.handle` | [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) |
| POST | `/watch_ajax` | `Routes::Watch.mark_watched` | [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) |
| GET | `/watch/:id` | `Routes::Watch.redirect` | [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) |
| GET | `/live/:id` | `Routes::Watch.redirect` | [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) |
| GET | `/shorts/:id` | `Routes::Watch.redirect` | [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) |
| GET | `/clip/:clip` | `Routes::Watch.clip` | [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) |
| GET | `/w/:id` | `Routes::Watch.redirect` | [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) |
| GET | `/v/:id` | `Routes::Watch.redirect` | [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) |
| GET | `/e/:id` | `Routes::Watch.redirect` | [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) |
| POST | `/download` | `Routes::Watch.download` | [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr) |
| GET | `/embed/` | `Routes::Embed.redirect` | [src/invidious/routes/embed.cr](../../src/invidious/routes/embed.cr) |
| GET | `/embed/:id` | `Routes::Embed.show` | [src/invidious/routes/embed.cr](../../src/invidious/routes/embed.cr) |

## Yt playlist routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/playlist` | `Routes::Playlists.show` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |
| GET | `/mix` | `Routes::Playlists.mix` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |
| GET | `/watch_videos` | `Routes::Playlists.watch_videos` | [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr) |

## Search routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/opensearch.xml` | `Routes::Search.opensearch` | [src/invidious/routes/search.cr](../../src/invidious/routes/search.cr) |
| GET | `/results` | `Routes::Search.results` | [src/invidious/routes/search.cr](../../src/invidious/routes/search.cr) |
| GET | `/search` | `Routes::Search.search` | [src/invidious/routes/search.cr](../../src/invidious/routes/search.cr) |
| POST | `/search` | `Routes::Search.search` | [src/invidious/routes/search.cr](../../src/invidious/routes/search.cr) |
| GET | `/hashtag/:hashtag` | `Routes::Search.hashtag` | [src/invidious/routes/search.cr](../../src/invidious/routes/search.cr) |

## Api manifest routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/api/manifest/dash/id/:id` | `Routes::API::Manifest.get_dash_video_id` | [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr) |
| GET | `/api/manifest/dash/id/videoplayback` | `Routes::API::Manifest.get_dash_video_playback` | [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr) |
| GET | `/api/manifest/dash/id/videoplayback/*` | `Routes::API::Manifest.get_dash_video_playback_greedy` | [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr) |
| OPTIONS | `/api/manifest/dash/id/videoplayback` | `Routes::API::Manifest.options_dash_video_playback` | [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr) |
| OPTIONS | `/api/manifest/dash/id/videoplayback/*` | `Routes::API::Manifest.options_dash_video_playback` | [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr) |
| GET | `/api/manifest/hls_playlist/*` | `Routes::API::Manifest.get_hls_playlist` | [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr) |
| GET | `/api/manifest/hls_variant/*` | `Routes::API::Manifest.get_hls_variant` | [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr) |

## Video playback routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/videoplayback` | `Routes::VideoPlayback.get_video_playback` | [src/invidious/routes/video_playback.cr](../../src/invidious/routes/video_playback.cr) |
| GET | `/videoplayback/*` | `Routes::VideoPlayback.get_video_playback_greedy` | [src/invidious/routes/video_playback.cr](../../src/invidious/routes/video_playback.cr) |
| OPTIONS | `/videoplayback` | `Routes::VideoPlayback.options_video_playback` | [src/invidious/routes/video_playback.cr](../../src/invidious/routes/video_playback.cr) |
| OPTIONS | `/videoplayback/*` | `Routes::VideoPlayback.options_video_playback` | [src/invidious/routes/video_playback.cr](../../src/invidious/routes/video_playback.cr) |
| GET | `/latest_version` | `Routes::VideoPlayback.latest_version` | [src/invidious/routes/video_playback.cr](../../src/invidious/routes/video_playback.cr) |

## Image routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/ggpht/*` | `Routes::Images.ggpht` | [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr) |
| OPTIONS | `/sb/:authority/:id/:storyboard/:index` | `Routes::Images.options_storyboard` | [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr) |
| GET | `/sb/:authority/:id/:storyboard/:index` | `Routes::Images.get_storyboard` | [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr) |
| GET | `/s_p/:id/:name` | `Routes::Images.s_p_image` | [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr) |
| GET | `/yts/img/:name` | `Routes::Images.yts_image` | [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr) |
| GET | `/vi/:id/:name` | `Routes::Images.thumbnails` | [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr) |
| GET | `/pl_c/:id/:name` | `Routes::Images.pl_c_image` | [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr) |
| GET | `/tvfilm_banner/:id/:name` | `Routes::Images.tvfilm_banner_image` | [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr) |

## Companion routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/companion/*` | `Routes::Companion.get_companion` | [src/invidious/routes/companion.cr](../../src/invidious/routes/companion.cr) |
| POST | `/companion/*` | `Routes::Companion.post_companion` | [src/invidious/routes/companion.cr](../../src/invidious/routes/companion.cr) |
| OPTIONS | `/companion/*` | `Routes::Companion.options_companion` | [src/invidious/routes/companion.cr](../../src/invidious/routes/companion.cr) |

## Tv pairing api routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| POST | `/api/v1/tv/pairing/start` | `Routes::API::V1::TvPairing.start` | [src/invidious/routes/api/v1/tv_pairing.cr](../../src/invidious/routes/api/v1/tv_pairing.cr) |
| POST | `/api/v1/tv/pairing/token` | `Routes::API::V1::TvPairing.token` | [src/invidious/routes/api/v1/tv_pairing.cr](../../src/invidious/routes/api/v1/tv_pairing.cr) |

## Api v1 routes

| Method | Path | Handler | Implementation |
| --- | --- | --- | --- |
| GET | `/api/v1/spoilers/publications` | `Routes::API::V1::ChannelSpoilers.publications` | [src/invidious/routes/api/v1/channel_spoilers.cr](../../src/invidious/routes/api/v1/channel_spoilers.cr) |
| GET | `/api/v1/ai/status` | `Routes::API::V1::AiChannels.status` | [src/invidious/routes/api/v1/ai_channels.cr](../../src/invidious/routes/api/v1/ai_channels.cr) |
| GET | `/api/v1/ai/channels` | `Routes::API::V1::AiChannels.channels` | [src/invidious/routes/api/v1/ai_channels.cr](../../src/invidious/routes/api/v1/ai_channels.cr) |
| GET | `/api/v1/sponsorblock/:id` | `Routes::API::V1::SponsorBlock.segments` | [src/invidious/routes/api/v1/sponsorblock.cr](../../src/invidious/routes/api/v1/sponsorblock.cr) |
| GET | `/api/v1/dearrow/:id` | `Routes::API::V1::DeArrow.title` | [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr) |
| GET | `/api/v1/dearrow/:id/submissions` | `Routes::API::V1::DeArrow.submissions` | [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr) |
| GET | `/api/v1/videos/:id/downloads` | `Routes::API::V1::Videos.downloads` | [src/invidious/routes/api/v1/downloads.cr](../../src/invidious/routes/api/v1/downloads.cr) |
| GET | `/api/v1/videos/:id/download` | `Routes::API::V1::Videos.download_file` | [src/invidious/routes/api/v1/downloads.cr](../../src/invidious/routes/api/v1/downloads.cr) |
| GET | `/api/v1/videos/:id` | `Routes::API::V1::Videos.videos` | [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr) |
| GET | `/api/v1/storyboards/:id` | `Routes::API::V1::Videos.storyboards` | [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr) |
| GET | `/api/v1/captions/:id` | `Routes::API::V1::Videos.captions` | [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr) |
| GET | `/api/v1/annotations/:id` | `Routes::API::V1::Videos.annotations` | [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr) |
| GET | `/api/v1/comments/:id` | `Routes::API::V1::Videos.comments` | [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr) |
| GET | `/api/v1/clips/:id` | `Routes::API::V1::Videos.clips` | [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr) |
| GET | `/api/v1/channels/:ucid/clips` | `Routes::API::V1::Clips.channel` | [src/invidious/routes/api/v1/clips.cr](../../src/invidious/routes/api/v1/clips.cr) |
| GET | `/api/v1/transcripts/:id` | `Routes::API::V1::Videos.transcripts` | [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr) |
| GET | `/api/v1/live_chat/:id` | `Routes::API::V1::LiveChat.replay` | [src/invidious/routes/api/v1/live_chat.cr](../../src/invidious/routes/api/v1/live_chat.cr) |
| GET | `/api/v1/trending` | `Routes::API::V1::Feeds.trending` | [src/invidious/routes/api/v1/feeds.cr](../../src/invidious/routes/api/v1/feeds.cr) |
| GET | `/api/v1/popular` | `Routes::API::V1::Feeds.popular` | [src/invidious/routes/api/v1/feeds.cr](../../src/invidious/routes/api/v1/feeds.cr) |
| GET | `/api/v1/channels/:ucid` | `Routes::API::V1::Channels.home` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/latest` | `Routes::API::V1::Channels.latest` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/videos` | `Routes::API::V1::Channels.videos` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/shorts` | `Routes::API::V1::Channels.shorts` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/streams` | `Routes::API::V1::Channels.streams` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/podcasts` | `Routes::API::V1::Channels.podcasts` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/releases` | `Routes::API::V1::Channels.releases` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/courses` | `Routes::API::V1::Channels.courses` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/playlists` | `Routes::API::V1::Channels.playlists` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/community` | `Routes::API::V1::Channels.community` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/posts` | `Routes::API::V1::Channels.community` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/channels` | `Routes::API::V1::Channels.channels` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/search` | `Routes::API::V1::Channels.search` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/post/:id` | `Routes::API::V1::Channels.post` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/post/:id/comments` | `Routes::API::V1::Channels.post_comments` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/comments/:ucid` | `Routes::API::V1::Channels.channel_comments_redirect` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/channels/:ucid/comments` | `Routes::API::V1::Channels.channel_comments_redirect` | [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr) |
| GET | `/api/v1/search` | `Routes::API::V1::Search.search` | [src/invidious/routes/api/v1/search.cr](../../src/invidious/routes/api/v1/search.cr) |
| GET | `/api/v1/search/suggestions` | `Routes::API::V1::Search.search_suggestions` | [src/invidious/routes/api/v1/search.cr](../../src/invidious/routes/api/v1/search.cr) |
| GET | `/api/v1/hashtag/:hashtag` | `Routes::API::V1::Search.hashtag` | [src/invidious/routes/api/v1/search.cr](../../src/invidious/routes/api/v1/search.cr) |
| POST | `/api/v1/mobile/login` | `Routes::API::V1::Mobile.login` | [src/invidious/routes/api/v1/mobile.cr](../../src/invidious/routes/api/v1/mobile.cr) |
| GET | `/api/v1/mobile/registration` | `Routes::API::V1::Mobile.registration` | [src/invidious/routes/api/v1/mobile.cr](../../src/invidious/routes/api/v1/mobile.cr) |
| POST | `/api/v1/mobile/register` | `Routes::API::V1::Mobile.register` | [src/invidious/routes/api/v1/mobile.cr](../../src/invidious/routes/api/v1/mobile.cr) |
| POST | `/api/v1/auth/account/username` | `Routes::API::V1::Account.username` | [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr) |
| POST | `/api/v1/auth/account/password` | `Routes::API::V1::Account.password` | [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr) |
| POST | `/api/v1/auth/account/delete` | `Routes::API::V1::Account.delete` | [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr) |
| GET | `/api/v1/auth/account/sessions` | `Routes::API::V1::Account.sessions` | [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr) |
| POST | `/api/v1/auth/account/sessions/revoke` | `Routes::API::V1::Account.revoke` | [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr) |
| POST | `/api/v1/auth/account/tokens` | `Routes::API::V1::Account.token` | [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr) |
| GET | `/api/v1/auth/blocked_channels` | `Routes::API::V1::BlockedChannels.index` | [src/invidious/routes/api/v1/blocked_channels.cr](../../src/invidious/routes/api/v1/blocked_channels.cr) |
| POST | `/api/v1/auth/blocked_channels/:ucid` | `Routes::API::V1::BlockedChannels.block` | [src/invidious/routes/api/v1/blocked_channels.cr](../../src/invidious/routes/api/v1/blocked_channels.cr) |
| DELETE | `/api/v1/auth/blocked_channels/:ucid` | `Routes::API::V1::BlockedChannels.unblock` | [src/invidious/routes/api/v1/blocked_channels.cr](../../src/invidious/routes/api/v1/blocked_channels.cr) |
| GET | `/api/v1/auth/dearrow/identity` | `Routes::API::V1::DeArrow.identity` | [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr) |
| PUT | `/api/v1/auth/dearrow/identity` | `Routes::API::V1::DeArrow.import_identity` | [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr) |
| GET | `/api/v1/auth/dearrow/:id/submissions` | `Routes::API::V1::DeArrow.submissions` | [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr) |
| POST | `/api/v1/auth/dearrow/:id` | `Routes::API::V1::DeArrow.submit` | [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr) |
| GET | `/api/v1/auth/clips` | `Routes::API::V1::Clips.index` | [src/invidious/routes/api/v1/clips.cr](../../src/invidious/routes/api/v1/clips.cr) |
| POST | `/api/v1/auth/clips` | `Routes::API::V1::Clips.create` | [src/invidious/routes/api/v1/clips.cr](../../src/invidious/routes/api/v1/clips.cr) |
| DELETE | `/api/v1/auth/clips/:id` | `Routes::API::V1::Clips.delete` | [src/invidious/routes/api/v1/clips.cr](../../src/invidious/routes/api/v1/clips.cr) |
| GET | `/api/v1/auth/csrf` | `Routes::API::V1::Authenticated.get_csrf` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/preferences` | `Routes::API::V1::Authenticated.get_preferences` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| POST | `/api/v1/auth/preferences` | `Routes::API::V1::Authenticated.set_preferences` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| PATCH | `/api/v1/auth/preferences` | `Routes::API::V1::Authenticated.patch_preferences` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| PATCH | `/api/v1/auth/chat_preferences` | `Routes::API::V1::Authenticated.set_chat_preferences` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/chat_timing/:id` | `Routes::API::V1::Authenticated.get_chat_timing` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| PUT | `/api/v1/auth/chat_timing/:id` | `Routes::API::V1::Authenticated.set_chat_timing` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/export/invidious` | `Routes::API::V1::Authenticated.export_invidious` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| POST | `/api/v1/auth/import/invidious` | `Routes::API::V1::Authenticated.import_invidious` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/history` | `Routes::API::V1::Authenticated.get_history` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| POST | `/api/v1/auth/history/:id` | `Routes::API::V1::Authenticated.mark_watched` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| DELETE | `/api/v1/auth/history/:id` | `Routes::API::V1::Authenticated.mark_unwatched` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| DELETE | `/api/v1/auth/history` | `Routes::API::V1::Authenticated.clear_history` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/playback` | `Routes::API::V1::Authenticated.get_playback_positions` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/playback/:id` | `Routes::API::V1::Authenticated.get_playback_position` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| PUT | `/api/v1/auth/playback/:id` | `Routes::API::V1::Authenticated.set_playback_position` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| DELETE | `/api/v1/auth/playback/:id` | `Routes::API::V1::Authenticated.delete_playback_position` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| DELETE | `/api/v1/auth/playback` | `Routes::API::V1::Authenticated.clear_playback_positions` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/feed/rss` | `Routes::API::V1::Authenticated.rss_link` | [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr) |
| GET | `/api/v1/auth/feed` | `Routes::API::V1::Authenticated.feed` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/subscriptions` | `Routes::API::V1::Authenticated.get_subscriptions` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/subscriptions/export` | `Routes::API::V1::Authenticated.export_subscriptions` | [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr) |
| GET | `/api/v1/auth/subscriptions/search` | `Routes::API::V1::Authenticated.search_subscriptions` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| POST | `/api/v1/auth/subscriptions/:ucid` | `Routes::API::V1::Authenticated.subscribe_channel` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| DELETE | `/api/v1/auth/subscriptions/:ucid` | `Routes::API::V1::Authenticated.unsubscribe_channel` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| PUT | `/api/v1/auth/saved_playlists/:id` | `Routes::API::V1::Authenticated.save_external_playlist` | [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr) |
| DELETE | `/api/v1/auth/saved_playlists/:id` | `Routes::API::V1::Authenticated.unsave_external_playlist` | [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr) |
| GET | `/api/v1/auth/playlists/:plid/feed` | `Routes::API::V1::Authenticated.playlist_feed` | [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr) |
| GET | `/api/v1/auth/playlists` | `Routes::API::V1::Authenticated.list_playlists` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| POST | `/api/v1/auth/playlists` | `Routes::API::V1::Authenticated.create_playlist` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| PATCH | `/api/v1/auth/playlists/:plid` | `Routes::API::V1::Authenticated.update_playlist_attribute` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| DELETE | `/api/v1/auth/playlists/:plid` | `Routes::API::V1::Authenticated.delete_playlist` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| POST | `/api/v1/auth/playlists/:plid/videos` | `Routes::API::V1::Authenticated.insert_video_into_playlist` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| DELETE | `/api/v1/auth/playlists/:plid/videos/:index` | `Routes::API::V1::Authenticated.delete_video_in_playlist` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/tokens` | `Routes::API::V1::Authenticated.get_tokens` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| POST | `/api/v1/auth/tokens/register` | `Routes::API::V1::Authenticated.register_token` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| POST | `/api/v1/auth/tokens/unregister` | `Routes::API::V1::Authenticated.unregister_token` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/auth/notifications` | `Routes::API::V1::Authenticated.notifications` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| POST | `/api/v1/auth/notifications` | `Routes::API::V1::Authenticated.notifications` | [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr) |
| GET | `/api/v1/stats` | `Routes::API::V1::Misc.stats` | [src/invidious/routes/api/v1/misc.cr](../../src/invidious/routes/api/v1/misc.cr) |
| GET | `/api/v1/playlists/:plid` | `Routes::API::V1::Misc.get_playlist` | [src/invidious/routes/api/v1/misc.cr](../../src/invidious/routes/api/v1/misc.cr) |
| GET | `/api/v1/auth/playlists/:plid` | `Routes::API::V1::Misc.get_playlist` | [src/invidious/routes/api/v1/misc.cr](../../src/invidious/routes/api/v1/misc.cr) |
| GET | `/api/v1/mixes/:rdid` | `Routes::API::V1::Misc.mixes` | [src/invidious/routes/api/v1/misc.cr](../../src/invidious/routes/api/v1/misc.cr) |
| GET | `/api/v1/resolveurl` | `Routes::API::V1::Misc.resolve_url` | [src/invidious/routes/api/v1/misc.cr](../../src/invidious/routes/api/v1/misc.cr) |
