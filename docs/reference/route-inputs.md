# Route input reference

[Documentation index](../README.md)

Generated from registered handlers under [src/invidious/routes](../../src/invidious/routes) by [generate_reference.py](../tools/generate_reference.py). Regenerate after changing the source; do not edit generated tables manually.

This companion to the [route list](routes.md) records literal input names read directly by each registered handler, including browser forms. These are observed names, not a required-field schema. A dash means no literal reads of that kind in this method. Shared helpers add inputs: search filters, video query overrides, authentication/CSRF, pagination, native JSON wrappers and preference converters. Read the linked implementation and the narrative API guides for validation, defaults, nested objects and response schemas. `data[...]` includes locally parsed objects and may include internal data; it is listed separately to avoid treating it as a guaranteed request field.

## Routes::Misc.home

`GET /`. Source: [src/invidious/routes/misc.cr](../../src/invidious/routes/misc.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Misc.privacy

`GET /privacy`. Source: [src/invidious/routes/misc.cr](../../src/invidious/routes/misc.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Misc.licenses

`GET /licenses`. Source: [src/invidious/routes/misc.cr](../../src/invidious/routes/misc.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Misc.cross_instance_redirect

`GET /redirect`. Source: [src/invidious/routes/misc.cr](../../src/invidious/routes/misc.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Feeds.push_notifications_get

`GET /feed/webhook/:token`. Source: [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr).

- Path: `token`.
- Query: `hub.challenge`, `hub.mode`, `hub.topic`.

## Routes::Feeds.push_notifications_post

`POST /feed/webhook/:token`. Source: [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Notifications.modify

`GET /modify_notifications`. Source: [src/invidious/routes/notifications.cr](../../src/invidious/routes/notifications.cr).

- Query: `redirect`.

## Routes::Login.signup_page

`GET /signup`. Source: [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Login.signup

`POST /signup`. Source: [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Clips.new_page

`GET /create_clip`. Source: [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Clips.create

`POST /create_clip`. Source: [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr).

- Form: `endTime`, `startTime`, `title`, `videoId`.

## Routes::Clips.delete_page

`GET /delete_clip`. Source: [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr).

- Query: `id`.

## Routes::Clips.delete

`POST /delete_clip`. Source: [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr).

- Form: `id`.

## Routes::Account.get_account

`GET /account`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Account.post_username

`POST /account/username`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Login.login_page

`GET /login`. Source: [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Login.login

`POST /login`. Source: [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Login.signout

`POST /signout`. Source: [src/invidious/routes/login.cr](../../src/invidious/routes/login.cr).

- Form: `csrf_token`.

## Routes::TvPairing.show

`GET /tv`. Source: [src/invidious/routes/tv_pairing.cr](../../src/invidious/routes/tv_pairing.cr).

- Query: `user_code`.
- Form: `user_code`.

## Routes::TvPairing.submit

`POST /tv`. Source: [src/invidious/routes/tv_pairing.cr](../../src/invidious/routes/tv_pairing.cr).

- Form: `csrf_token`, `decision`, `user_code`.

## Routes::BlockedChannels.index

`GET /blocked_channels`. Source: [src/invidious/routes/blocked_channels.cr](../../src/invidious/routes/blocked_channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::BlockedChannels.update

`POST /blocked_channels`. Source: [src/invidious/routes/blocked_channels.cr](../../src/invidious/routes/blocked_channels.cr).

- Query: `redirect`.
- Form: `action`, `csrf_token`, `name`, `ucid`.

## Routes::DeArrowContributions.submit

`POST /dearrow_submit`. Source: [src/invidious/routes/dearrow_contributions.cr](../../src/invidious/routes/dearrow_contributions.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::DeArrowContributions.identity

`POST /dearrow_identity`. Source: [src/invidious/routes/dearrow_contributions.cr](../../src/invidious/routes/dearrow_contributions.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::BlockedChannels.video_actions

`GET /video_actions`. Source: [src/invidious/routes/blocked_channels.cr](../../src/invidious/routes/blocked_channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::SponsorBlockPreferences.show

`GET /preferences/sponsorblock/channels`. Source: [src/invidious/routes/sponsorblock_preferences.cr](../../src/invidious/routes/sponsorblock_preferences.cr).

- Query: `channel`.

## Routes::SponsorBlockPreferences.update

`POST /preferences/sponsorblock/channels`. Source: [src/invidious/routes/sponsorblock_preferences.cr](../../src/invidious/routes/sponsorblock_preferences.cr).

- Form: `action`, `channel`, `csrf_token`, `enabled`, `mode_#{category}`.

## Routes::ChannelSpoilerPreferences.show

`GET /preferences/spoilers/channels`. Source: [src/invidious/routes/channel_spoiler_preferences.cr](../../src/invidious/routes/channel_spoiler_preferences.cr).

- Query: `channel`.

## Routes::ChannelSpoilerPreferences.update

`POST /preferences/spoilers/channels`. Source: [src/invidious/routes/channel_spoiler_preferences.cr](../../src/invidious/routes/channel_spoiler_preferences.cr).

- Form: `action`, `channel`, `csrf_token`, `hide_thumbnail`, `hide_title`, `reveal_after_days`.

## Routes::PreferencesRoute.show

`GET /preferences`. Source: [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::PreferencesRoute.update

`POST /preferences`. Source: [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr).

- Form: `admin_default_home`, `admin_feed_menu[#{index}]`, `ai_blocklist_action`, `ai_blocklist_feeds`, `ai_blocklist_other_pages`, `ai_blocklist_recommendations`, `ai_blocklist_search`, `ai_filter_enabled`, `ai_filter_form_version`, `ai_warnlist_action`, `ai_warnlist_feeds`, `ai_warnlist_other_pages`, `ai_warnlist_recommendations`, `ai_warnlist_search`, `ai_{{ kind.id }}_{{ surface.id }}_action`, `annotations`, `annotations_subscribed`, `automatic_instance_redirect`, `autoplay`, `captcha_enabled`, `captions[#{i}]`, `comments[#{i}]`, `continue`, `continue_autoplay`, `dark_mode`, `dearrow_enabled`, `dearrow_show_original`, `default_home`, `default_playlist`, `extend_desc`, `feed_menu[#{index}]`, `latest_only`, `listen`, `local`, `locale`, `login_enabled`, `max_results`, `modified_source_code_url`, `notifications_only`, `player_style`, `popular_enabled`, `preferred_audio`, `preload`, `quality`, `quality_dash`, `region`, `registration_enabled`, `related_videos`, `save_player_pos`, `search_privacy`, `seek_seconds`, `show_member_videos`, `show_nick`, `show_original_title`, `show_original_title_present`, `sort`, `speed`, `sponsorblock_color_#{category}`, `sponsorblock_enabled`, `sponsorblock_mode_#{category}`, `statistics_enabled`, `theme`, `theme_random_interval_hours`, `thin_mode`, `timezone`, `ui_density`, `unseen_only`, `video_codec`, `video_loop`, `vr_mode`, `watch_history`.

## Routes::PreferencesRoute.detect_timezone

`POST /preferences/timezone`. Source: [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr).

- Form: `csrf_token`, `timezone`.

## Routes::PreferencesRoute.toggle_theme

`POST /toggle_theme`. Source: [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr).

- Query: `mode`, `redirect`.

## Routes::PreferencesRoute.data_control

`GET /data_control`. Source: [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::PreferencesRoute.update_data_control

`POST /data_control`. Source: [src/invidious/routes/preferences.cr](../../src/invidious/routes/preferences.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Account.get_change_password

`GET /change_password`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Account.post_change_password

`POST /change_password`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Account.get_delete

`GET /delete_account`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Account.post_delete

`POST /delete_account`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

- Form: `csrf_token`, `password`.

## Routes::Account.get_clear_history

`GET /clear_watch_history`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Account.post_clear_history

`POST /clear_watch_history`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

- Form: `csrf_token`.

## Routes::Account.get_authorize_token

`GET /authorize_token`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

- Query: `callback_url`, `expire`, `scopes`.

## Routes::Account.post_authorize_token

`POST /authorize_token`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

- Form: `callbackUrl`, `csrf_token`, `expire`.

## Routes::Account.token_manager

`GET /token_manager`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Account.token_ajax

`POST /token_ajax`. Source: [src/invidious/routes/account.cr](../../src/invidious/routes/account.cr).

- Query: `action`, `redirect`, `session`.
- Form: `csrf_token`.

## Routes::Subscriptions.toggle_subscription

`POST /subscription_ajax`. Source: [src/invidious/routes/subscriptions.cr](../../src/invidious/routes/subscriptions.cr).

- Query: `action`, `c`, `redirect`.
- Form: `csrf_token`.

## Routes::Subscriptions.subscription_manager

`GET /subscription_manager`. Source: [src/invidious/routes/subscriptions.cr](../../src/invidious/routes/subscriptions.cr).

- Query: `action_takeout`, `format`.

## Routes::Playlists.new

`GET /create_playlist`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Playlists.create

`POST /create_playlist`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

- Query: `redirect`.
- Form: `csrf_token`, `privacy`, `title`.

## Routes::Playlists.subscribe

`POST /subscribe_playlist`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

- Query: `continuation`, `list`.

## Routes::Playlists.delete_page

`GET /delete_playlist`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

- Query: `list`.

## Routes::Playlists.delete

`POST /delete_playlist`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

- Query: `list`.
- Form: `csrf_token`.

## Routes::Playlists.edit

`GET /edit_playlist`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

- Query: `list`, `page`.

## Routes::Playlists.update

`POST /edit_playlist`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

- Query: `list`.
- Form: `csrf_token`, `description`, `privacy`, `title`.

## Routes::Playlists.add_playlist_items_page

`GET /add_playlist_items`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

- Query: `list`, `page`, `region`.

## Routes::Playlists.playlist_ajax

`POST /playlist_ajax`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

- Query: `action`, `playlist_id`, `redirect`, `set_video_id`, `video_id`.
- Form: `csrf_token`.

## Routes::Feeds.view_all_playlists_redirect

`GET /view_all_playlists`. Source: [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Feeds.playlists

`GET /feed/playlists`. Source: [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Feeds.popular

`GET /feed/popular`. Source: [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Feeds.trending

`GET /feed/trending`. Source: [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr).

- Query: `region`, `type`.

## Routes::Feeds.subscriptions

`GET /feed/subscriptions`. Source: [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr).

- Query: `max_results`, `page`.

## Routes::Feeds.history

`GET /feed/history`. Source: [src/invidious/routes/feeds.cr](../../src/invidious/routes/feeds.cr).

- Query: `max_results`, `page`, `q`.

## Routes::Clips.index

`GET /feed/clips`. Source: [src/invidious/routes/clips.cr](../../src/invidious/routes/clips.cr).

- Query: `page`.

## Routes::Feeds.rss_channel

`GET /feed/channel/:ucid`. Source: [src/invidious/routes/rss_feeds.cr](../../src/invidious/routes/rss_feeds.cr).

- Path: `ucid`.
- Query: `params`.

## Routes::Feeds.rss_private

`GET /feed/private`. Source: [src/invidious/routes/rss_feeds.cr](../../src/invidious/routes/rss_feeds.cr).

- Query: `max_results`, `page`, `params`, `token`.

## Routes::Feeds.rss_playlist

`GET /feed/playlist/:plid`. Source: [src/invidious/routes/rss_feeds.cr](../../src/invidious/routes/rss_feeds.cr).

- Path: `plid`.
- Query: `continuation`, `params`.

## Routes::Feeds.rss_videos

`GET /feeds/videos.xml`. Source: [src/invidious/routes/rss_feeds.cr](../../src/invidious/routes/rss_feeds.cr).

- Query: `channel_id`, `playlist_id`, `user`.

## Routes::Channels.home

`GET /channel/:ucid`; `GET /channel/:ucid/home`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Channels.videos

`GET /channel/:ucid/videos`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

- Query: `sort_by`.

## Routes::Channels.search

`GET /channel/:ucid/search`; `POST /channel/:ucid/search`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Channels.shorts

`GET /channel/:ucid/shorts`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

- Query: `sort_by`.

## Routes::Channels.streams

`GET /channel/:ucid/streams`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

- Query: `sort_by`.

## Routes::Channels.podcasts

`GET /channel/:ucid/podcasts`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Channels.releases

`GET /channel/:ucid/releases`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Channels.courses

`GET /channel/:ucid/courses`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Channels.playlists

`GET /channel/:ucid/playlists`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

- Query: `sort_by`.

## Routes::Channels.clips

`GET /channel/:ucid/clips`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

- Query: `page`.

## Routes::Channels.community

`GET /channel/:ucid/community`; `GET /channel/:ucid/posts`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

- Query: `continuation`, `lb`, `thin_mode`.

## Routes::Channels.channels

`GET /channel/:ucid/channels`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Channels.about

`GET /channel/:ucid/about`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Channels.live

`GET /channel/:ucid/live`; `GET /user/:user/live`; `GET /c/:user/live`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Channels.post

`GET /post/:id`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

- Path: `id`.
- Query: `nojs`, `thin_mode`, `ucid`.

## Routes::Channels.redirect_home

`GET /channel/:ucid/*`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

- Path: `ucid`.

## Routes::Channels.brand_redirect

`GET /c/:user`; `GET /c/:user/:tab`; `GET /user/:user`; `GET /user/:user/:tab`; `GET /@:user`; `GET /@:user/:tab`; `GET /attribution_link`; `GET /attribution_link/:tab`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

- Path: `tab`.

## Routes::Channels.profile

`GET /profile`; `GET /profile/*`. Source: [src/invidious/routes/channels.cr](../../src/invidious/routes/channels.cr).

- Query: `user`.

## Routes::Watch.handle

`GET /watch`. Source: [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr).

- Query: `clip_preview`, `end`, `iv_load_policy`, `list`, `listen`, `nojs`, `quality`, `region`, `start`, `v`.

## Routes::Watch.mark_watched

`POST /watch_ajax`. Source: [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr).

- Query: `action`, `id`, `redirect`.
- Form: `csrf_token`, `position`.

## Routes::Watch.redirect

`GET /watch/:id`; `GET /live/:id`; `GET /shorts/:id`; `GET /w/:id`; `GET /v/:id`; `GET /e/:id`. Source: [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr).

- Path: `id`.

## Routes::Watch.clip

`GET /clip/:clip`. Source: [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr).

- Path: `clip`.
- Query: `end`, `start`.

## Routes::Watch.download

`POST /download`. Source: [src/invidious/routes/watch.cr](../../src/invidious/routes/watch.cr).

- Path: `id`.
- Query: `id`, `label`, `local`, `title`.
- Form: `download_widget`, `id`, `title`.

## Routes::Embed.redirect

`GET /embed/`. Source: [src/invidious/routes/embed.cr](../../src/invidious/routes/embed.cr).

- Query: `index`, `list`.

## Routes::Embed.show

`GET /embed/:id`. Source: [src/invidious/routes/embed.cr](../../src/invidious/routes/embed.cr).

- Path: `id`.
- Query: `channel`, `clip_preview`, `end`, `index`, `iv_load_policy`, `list`, `listen`, `playlist`, `start`.

## Routes::Playlists.show

`GET /playlist`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

- Query: `list`, `page`.

## Routes::Playlists.mix

`GET /mix`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

- Query: `continuation`, `list`.

## Routes::Playlists.watch_videos

`GET /watch_videos`. Source: [src/invidious/routes/playlists.cr](../../src/invidious/routes/playlists.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Search.opensearch

`GET /opensearch.xml`. Source: [src/invidious/routes/search.cr](../../src/invidious/routes/search.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Search.results

`GET /results`. Source: [src/invidious/routes/search.cr](../../src/invidious/routes/search.cr).

- Query: `page`, `q`, `search_query`.

## Routes::Search.search

`GET /search`; `POST /search`. Source: [src/invidious/routes/search.cr](../../src/invidious/routes/search.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Search.hashtag

`GET /hashtag/:hashtag`. Source: [src/invidious/routes/search.cr](../../src/invidious/routes/search.cr).

- Path: `hashtag`.
- Query: `page`.

## Routes::API::Manifest.get_dash_video_id

`GET /api/manifest/dash/id/:id`. Source: [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr).

- Path: `id`.
- Query: `local`, `region`, `unique_res`.

## Routes::API::Manifest.get_dash_video_playback

`GET /api/manifest/dash/id/videoplayback`. Source: [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::Manifest.get_dash_video_playback_greedy

`GET /api/manifest/dash/id/videoplayback/*`. Source: [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::Manifest.options_dash_video_playback

`OPTIONS /api/manifest/dash/id/videoplayback`; `OPTIONS /api/manifest/dash/id/videoplayback/*`. Source: [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::Manifest.get_hls_playlist

`GET /api/manifest/hls_playlist/*`. Source: [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr).

- Query: `local`.

## Routes::API::Manifest.get_hls_variant

`GET /api/manifest/hls_variant/*`. Source: [src/invidious/routes/api/manifest.cr](../../src/invidious/routes/api/manifest.cr).

- Query: `local`.

## Routes::VideoPlayback.get_video_playback

`GET /videoplayback`. Source: [src/invidious/routes/video_playback.cr](../../src/invidious/routes/video_playback.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::VideoPlayback.get_video_playback_greedy

`GET /videoplayback/*`. Source: [src/invidious/routes/video_playback.cr](../../src/invidious/routes/video_playback.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::VideoPlayback.options_video_playback

`OPTIONS /videoplayback`; `OPTIONS /videoplayback/*`. Source: [src/invidious/routes/video_playback.cr](../../src/invidious/routes/video_playback.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::VideoPlayback.latest_version

`GET /latest_version`. Source: [src/invidious/routes/video_playback.cr](../../src/invidious/routes/video_playback.cr).

- Query: `audio_track`, `id`, `is_drc`, `itag`, `local`, `region`, `title`.

## Routes::Images.ggpht

`GET /ggpht/*`. Source: [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Images.options_storyboard

`OPTIONS /sb/:authority/:id/:storyboard/:index`. Source: [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Images.get_storyboard

`GET /sb/:authority/:id/:storyboard/:index`. Source: [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr).

- Path: `authority`, `id`, `index`, `storyboard`.

## Routes::Images.s_p_image

`GET /s_p/:id/:name`. Source: [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr).

- Path: `id`, `name`.

## Routes::Images.yts_image

`GET /yts/img/:name`. Source: [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Images.thumbnails

`GET /vi/:id/:name`. Source: [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr).

- Path: `id`, `name`.

## Routes::Images.pl_c_image

`GET /pl_c/:id/:name`. Source: [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Images.tvfilm_banner_image

`GET /tvfilm_banner/:id/:name`. Source: [src/invidious/routes/images.cr](../../src/invidious/routes/images.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Companion.get_companion

`GET /companion/*`. Source: [src/invidious/routes/companion.cr](../../src/invidious/routes/companion.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Companion.post_companion

`POST /companion/*`. Source: [src/invidious/routes/companion.cr](../../src/invidious/routes/companion.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::Companion.options_companion

`OPTIONS /companion/*`. Source: [src/invidious/routes/companion.cr](../../src/invidious/routes/companion.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::TvPairing.start

`POST /api/v1/tv/pairing/start`. Source: [src/invidious/routes/api/v1/tv_pairing.cr](../../src/invidious/routes/api/v1/tv_pairing.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::TvPairing.token

`POST /api/v1/tv/pairing/token`. Source: [src/invidious/routes/api/v1/tv_pairing.cr](../../src/invidious/routes/api/v1/tv_pairing.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::ChannelSpoilers.publications

`GET /api/v1/spoilers/publications`. Source: [src/invidious/routes/api/v1/channel_spoilers.cr](../../src/invidious/routes/api/v1/channel_spoilers.cr).

- Query: `ids`.

## Routes::API::V1::AiChannels.status

`GET /api/v1/ai/status`. Source: [src/invidious/routes/api/v1/ai_channels.cr](../../src/invidious/routes/api/v1/ai_channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::AiChannels.channels

`GET /api/v1/ai/channels`. Source: [src/invidious/routes/api/v1/ai_channels.cr](../../src/invidious/routes/api/v1/ai_channels.cr).

- Query: `ids`, `lists`.

## Routes::API::V1::SponsorBlock.segments

`GET /api/v1/sponsorblock/:id`. Source: [src/invidious/routes/api/v1/sponsorblock.cr](../../src/invidious/routes/api/v1/sponsorblock.cr).

- Path: `id`.

## Routes::API::V1::DeArrow.title

`GET /api/v1/dearrow/:id`. Source: [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr).

- Path: `id`.

## Routes::API::V1::DeArrow.submissions

`GET /api/v1/dearrow/:id/submissions`; `GET /api/v1/auth/dearrow/:id/submissions`. Source: [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr).

- Path: `id`.

## Routes::API::V1::Videos.downloads

`GET /api/v1/videos/:id/downloads`. Source: [src/invidious/routes/api/v1/downloads.cr](../../src/invidious/routes/api/v1/downloads.cr).

- Path: `id`.
- Query: `region`.

## Routes::API::V1::Videos.download_file

`GET /api/v1/videos/:id/download`. Source: [src/invidious/routes/api/v1/downloads.cr](../../src/invidious/routes/api/v1/downloads.cr).

- Path: `id`.
- Query: `key`, `label`, `title`.

## Routes::API::V1::Videos.videos

`GET /api/v1/videos/:id`. Source: [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr).

- Path: `id`.
- Query: `local`, `region`.

## Routes::API::V1::Videos.storyboards

`GET /api/v1/storyboards/:id`. Source: [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr).

- Path: `id`.
- Query: `height`, `region`, `width`.

## Routes::API::V1::Videos.captions

`GET /api/v1/captions/:id`. Source: [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr).

- Path: `id`.
- Query: `label`, `lang`, `region`, `title`, `tlang`.
- Form: `region`.

## Routes::API::V1::Videos.annotations

`GET /api/v1/annotations/:id`. Source: [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr).

- Path: `id`.
- Query: `source`.

## Routes::API::V1::Videos.comments

`GET /api/v1/comments/:id`. Source: [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr).

- Path: `id`.
- Query: `action`, `continuation`, `format`, `region`, `sort_by`, `source`, `thin_mode`.

## Routes::API::V1::Videos.clips

`GET /api/v1/clips/:id`. Source: [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr).

- Path: `id`.
- Query: `local`, `region`.

## Routes::API::V1::Clips.channel

`GET /api/v1/channels/:ucid/clips`. Source: [src/invidious/routes/api/v1/clips.cr](../../src/invidious/routes/api/v1/clips.cr).

- Path: `ucid`.
- Query: `page`.

## Routes::API::V1::Videos.transcripts

`GET /api/v1/transcripts/:id`. Source: [src/invidious/routes/api/v1/videos.cr](../../src/invidious/routes/api/v1/videos.cr).

- Path: `id`.
- Query: `autogen`, `label`, `lang`.

## Routes::API::V1::LiveChat.replay

`GET /api/v1/live_chat/:id`. Source: [src/invidious/routes/api/v1/live_chat.cr](../../src/invidious/routes/api/v1/live_chat.cr).

- Path: `id`.
- Query: `continuation`, `offset_ms`.

## Routes::API::V1::Feeds.trending

`GET /api/v1/trending`. Source: [src/invidious/routes/api/v1/feeds.cr](../../src/invidious/routes/api/v1/feeds.cr).

- Query: `region`, `type`.

## Routes::API::V1::Feeds.popular

`GET /api/v1/popular`. Source: [src/invidious/routes/api/v1/feeds.cr](../../src/invidious/routes/api/v1/feeds.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Channels.home

`GET /api/v1/channels/:ucid`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `sort_by`.

## Routes::API::V1::Channels.latest

`GET /api/v1/channels/:ucid/latest`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Channels.videos

`GET /api/v1/channels/:ucid/videos`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `continuation`, `sort_by`.

## Routes::API::V1::Channels.shorts

`GET /api/v1/channels/:ucid/shorts`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `continuation`, `sort_by`.

## Routes::API::V1::Channels.streams

`GET /api/v1/channels/:ucid/streams`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `continuation`, `sort_by`.

## Routes::API::V1::Channels.podcasts

`GET /api/v1/channels/:ucid/podcasts`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `continuation`.

## Routes::API::V1::Channels.releases

`GET /api/v1/channels/:ucid/releases`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `continuation`.

## Routes::API::V1::Channels.courses

`GET /api/v1/channels/:ucid/courses`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `continuation`.

## Routes::API::V1::Channels.playlists

`GET /api/v1/channels/:ucid/playlists`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `continuation`, `sort`, `sort_by`.

## Routes::API::V1::Channels.community

`GET /api/v1/channels/:ucid/community`; `GET /api/v1/channels/:ucid/posts`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `continuation`, `format`, `sort_by`, `thin_mode`.

## Routes::API::V1::Channels.channels

`GET /api/v1/channels/:ucid/channels`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `continuation`.

## Routes::API::V1::Channels.search

`GET /api/v1/channels/:ucid/search`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.
- Query: `region`.

## Routes::API::V1::Channels.post

`GET /api/v1/post/:id`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `id`.
- Query: `format`, `thin_mode`, `ucid`.

## Routes::API::V1::Channels.post_comments

`GET /api/v1/post/:id/comments`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `id`.
- Query: `continuation`, `format`, `sort_by`, `thin_mode`, `ucid`.

## Routes::API::V1::Channels.channel_comments_redirect

`GET /api/v1/channels/comments/:ucid`; `GET /api/v1/channels/:ucid/comments`. Source: [src/invidious/routes/api/v1/channels.cr](../../src/invidious/routes/api/v1/channels.cr).

- Path: `ucid`.

## Routes::API::V1::Search.search

`GET /api/v1/search`. Source: [src/invidious/routes/api/v1/search.cr](../../src/invidious/routes/api/v1/search.cr).

- Query: `region`.

## Routes::API::V1::Search.search_suggestions

`GET /api/v1/search/suggestions`. Source: [src/invidious/routes/api/v1/search.cr](../../src/invidious/routes/api/v1/search.cr).

- Query: `q`, `region`.

## Routes::API::V1::Search.hashtag

`GET /api/v1/hashtag/:hashtag`. Source: [src/invidious/routes/api/v1/search.cr](../../src/invidious/routes/api/v1/search.cr).

- Path: `hashtag`.
- Query: `page`, `region`.

## Routes::API::V1::Mobile.login

`POST /api/v1/mobile/login`. Source: [src/invidious/routes/api/v1/mobile.cr](../../src/invidious/routes/api/v1/mobile.cr).

- Local data keys: `password`, `username`.

## Routes::API::V1::Mobile.registration

`GET /api/v1/mobile/registration`. Source: [src/invidious/routes/api/v1/mobile.cr](../../src/invidious/routes/api/v1/mobile.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Mobile.register

`POST /api/v1/mobile/register`. Source: [src/invidious/routes/api/v1/mobile.cr](../../src/invidious/routes/api/v1/mobile.cr).

- Local data keys: `captchaAnswer`, `captchaToken`, `password`, `passwordConfirmation`, `username`.

## Routes::API::V1::Account.username

`POST /api/v1/auth/account/username`. Source: [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr).

- Local data keys: `password`, `username`.

## Routes::API::V1::Account.password

`POST /api/v1/auth/account/password`. Source: [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr).

- Local data keys: `newPassword`, `password`, `passwordConfirmation`.

## Routes::API::V1::Account.delete

`POST /api/v1/auth/account/delete`. Source: [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr).

- Local data keys: `password`.

## Routes::API::V1::Account.sessions

`GET /api/v1/auth/account/sessions`. Source: [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Account.revoke

`POST /api/v1/auth/account/sessions/revoke`. Source: [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr).

- Local data keys: `id`.

## Routes::API::V1::Account.token

`POST /api/v1/auth/account/tokens`. Source: [src/invidious/routes/api/v1/account.cr](../../src/invidious/routes/api/v1/account.cr).

- Local data keys: `expiresAt`, `password`, `scopes`.

## Routes::API::V1::BlockedChannels.index

`GET /api/v1/auth/blocked_channels`. Source: [src/invidious/routes/api/v1/blocked_channels.cr](../../src/invidious/routes/api/v1/blocked_channels.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::BlockedChannels.block

`POST /api/v1/auth/blocked_channels/:ucid`. Source: [src/invidious/routes/api/v1/blocked_channels.cr](../../src/invidious/routes/api/v1/blocked_channels.cr).

- Path: `ucid`.
- Local data keys: `name`.

## Routes::API::V1::BlockedChannels.unblock

`DELETE /api/v1/auth/blocked_channels/:ucid`. Source: [src/invidious/routes/api/v1/blocked_channels.cr](../../src/invidious/routes/api/v1/blocked_channels.cr).

- Path: `ucid`.

## Routes::API::V1::DeArrow.identity

`GET /api/v1/auth/dearrow/identity`. Source: [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::DeArrow.import_identity

`PUT /api/v1/auth/dearrow/identity`. Source: [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr).

- Local data keys: `privateId`.

## Routes::API::V1::DeArrow.submit

`POST /api/v1/auth/dearrow/:id`. Source: [src/invidious/routes/api/v1/dearrow.cr](../../src/invidious/routes/api/v1/dearrow.cr).

- Path: `id`.
- Local data keys: `action`, `confirmed`, `original`, `title`, `uuid`.

## Routes::API::V1::Clips.index

`GET /api/v1/auth/clips`. Source: [src/invidious/routes/api/v1/clips.cr](../../src/invidious/routes/api/v1/clips.cr).

- Query: `page`.

## Routes::API::V1::Clips.create

`POST /api/v1/auth/clips`. Source: [src/invidious/routes/api/v1/clips.cr](../../src/invidious/routes/api/v1/clips.cr).

- Local data keys: `endTime`, `startTime`, `title`, `videoId`.

## Routes::API::V1::Clips.delete

`DELETE /api/v1/auth/clips/:id`. Source: [src/invidious/routes/api/v1/clips.cr](../../src/invidious/routes/api/v1/clips.cr).

- Path: `id`.

## Routes::API::V1::Authenticated.get_csrf

`GET /api/v1/auth/csrf`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.get_preferences

`GET /api/v1/auth/preferences`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.set_preferences

`POST /api/v1/auth/preferences`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.patch_preferences

`PATCH /api/v1/auth/preferences`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Local data keys: `channel_spoiler_settings`, `save_player_pos`, `sponsorblock_channel_overrides`.

## Routes::API::V1::Authenticated.set_chat_preferences

`PATCH /api/v1/auth/chat_preferences`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Local data keys: `chat_font_scale`, `chat_overlay_height`, `chat_overlay_mode`, `chat_overlay_opacity`, `chat_overlay_width`, `chat_overlay_x`, `chat_overlay_y`, `chat_show_timestamps`, `chat_user_blacklist`, `chat_width_px`, `chat_word_blacklist`.

## Routes::API::V1::Authenticated.get_chat_timing

`GET /api/v1/auth/chat_timing/:id`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `id`.

## Routes::API::V1::Authenticated.set_chat_timing

`PUT /api/v1/auth/chat_timing/:id`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `id`.

## Routes::API::V1::Authenticated.export_invidious

`GET /api/v1/auth/export/invidious`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.import_invidious

`POST /api/v1/auth/import/invidious`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.get_history

`GET /api/v1/auth/history`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Query: `details`, `max_results`, `organized`, `page`, `q`.

## Routes::API::V1::Authenticated.mark_watched

`POST /api/v1/auth/history/:id`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `id`.

## Routes::API::V1::Authenticated.mark_unwatched

`DELETE /api/v1/auth/history/:id`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `id`.

## Routes::API::V1::Authenticated.clear_history

`DELETE /api/v1/auth/history`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.get_playback_positions

`GET /api/v1/auth/playback`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.get_playback_position

`GET /api/v1/auth/playback/:id`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `id`.

## Routes::API::V1::Authenticated.set_playback_position

`PUT /api/v1/auth/playback/:id`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `id`.
- JSON via Kemal: `position`.

## Routes::API::V1::Authenticated.delete_playback_position

`DELETE /api/v1/auth/playback/:id`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `id`.

## Routes::API::V1::Authenticated.clear_playback_positions

`DELETE /api/v1/auth/playback`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.rss_link

`GET /api/v1/auth/feed/rss`. Source: [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.feed

`GET /api/v1/auth/feed`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Query: `max_results`, `page`.

## Routes::API::V1::Authenticated.get_subscriptions

`GET /api/v1/auth/subscriptions`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Query: `include_stats`.

## Routes::API::V1::Authenticated.export_subscriptions

`GET /api/v1/auth/subscriptions/export`. Source: [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr).

- Query: `format`.

## Routes::API::V1::Authenticated.search_subscriptions

`GET /api/v1/auth/subscriptions/search`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Query: `page`, `q`.

## Routes::API::V1::Authenticated.subscribe_channel

`POST /api/v1/auth/subscriptions/:ucid`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `ucid`.

## Routes::API::V1::Authenticated.unsubscribe_channel

`DELETE /api/v1/auth/subscriptions/:ucid`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `ucid`.

## Routes::API::V1::Authenticated.save_external_playlist

`PUT /api/v1/auth/saved_playlists/:id`. Source: [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr).

- Path: `id`.
- Local data keys: `seedVideoId`.

## Routes::API::V1::Authenticated.unsave_external_playlist

`DELETE /api/v1/auth/saved_playlists/:id`. Source: [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr).

- Path: `id`.

## Routes::API::V1::Authenticated.playlist_feed

`GET /api/v1/auth/playlists/:plid/feed`. Source: [src/invidious/routes/api/v1/native_library.cr](../../src/invidious/routes/api/v1/native_library.cr).

- Path: `plid`.

## Routes::API::V1::Authenticated.list_playlists

`GET /api/v1/auth/playlists`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.create_playlist

`POST /api/v1/auth/playlists`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- JSON via Kemal: `privacy`, `title`.

## Routes::API::V1::Authenticated.update_playlist_attribute

`PATCH /api/v1/auth/playlists/:plid`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `plid`.
- JSON via Kemal: `description`, `privacy`, `title`.

## Routes::API::V1::Authenticated.delete_playlist

`DELETE /api/v1/auth/playlists/:plid`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `plid`.

## Routes::API::V1::Authenticated.insert_video_into_playlist

`POST /api/v1/auth/playlists/:plid/videos`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `plid`.
- JSON via Kemal: `videoId`.

## Routes::API::V1::Authenticated.delete_video_in_playlist

`DELETE /api/v1/auth/playlists/:plid/videos/:index`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Path: `index`, `plid`.

## Routes::API::V1::Authenticated.get_tokens

`GET /api/v1/auth/tokens`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Authenticated.register_token

`POST /api/v1/auth/tokens/register`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Form: `callbackUrl`, `expire`.
- JSON via Kemal: `callbackUrl`, `expire`, `scopes`.

## Routes::API::V1::Authenticated.unregister_token

`POST /api/v1/auth/tokens/unregister`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- JSON via Kemal: `session`.

## Routes::API::V1::Authenticated.notifications

`GET /api/v1/auth/notifications`; `POST /api/v1/auth/notifications`. Source: [src/invidious/routes/api/v1/authenticated.cr](../../src/invidious/routes/api/v1/authenticated.cr).

- Query: `topics`.
- Form: `topics`.

## Routes::API::V1::Misc.stats

`GET /api/v1/stats`. Source: [src/invidious/routes/api/v1/misc.cr](../../src/invidious/routes/api/v1/misc.cr).

Inputs are supplied by shared helpers/context, or this handler takes no literal named inputs.

## Routes::API::V1::Misc.get_playlist

`GET /api/v1/playlists/:plid`; `GET /api/v1/auth/playlists/:plid`. Source: [src/invidious/routes/api/v1/misc.cr](../../src/invidious/routes/api/v1/misc.cr).

- Path: `plid`, `rdid`.
- Query: `continuation`, `current_removed`, `format`, `index`, `listen`, `page`.

## Routes::API::V1::Misc.mixes

`GET /api/v1/mixes/:rdid`. Source: [src/invidious/routes/api/v1/misc.cr](../../src/invidious/routes/api/v1/misc.cr).

- Path: `rdid`.
- Query: `continuation`, `format`, `listen`.

## Routes::API::V1::Misc.resolve_url

`GET /api/v1/resolveurl`. Source: [src/invidious/routes/api/v1/misc.cr](../../src/invidious/routes/api/v1/misc.cr).

- Query: `url`.

