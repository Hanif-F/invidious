# Preference fields

[Documentation index](../README.md)

Generated from [src/invidious/user/preferences.cr](../../src/invidious/user/preferences.cr) by [generate_reference.py](../tools/generate_reference.py). Regenerate after changing the source; do not edit generated tables manually.

Preference defaults usually refer to `CONFIG.default_user_preferences`; that complete table is in [configuration defaults](configuration.md). This is a field inventory for the serialized model, not the narrower native PATCH allowlist. See [preferences](../preferences.md) and [native API](../mobile-api.md#safe-preference-updates) for normalization and update behavior.

| Field | Type | Initial expression |
| --- | --- | --- |
| `annotations` | `Bool` | `CONFIG.default_user_preferences.annotations` |
| `annotations_subscribed` | `Bool` | `CONFIG.default_user_preferences.annotations_subscribed` |
| `preload` | `Bool` | `CONFIG.default_user_preferences.preload` |
| `autoplay` | `Bool` | `CONFIG.default_user_preferences.autoplay` |
| `automatic_instance_redirect` | `Bool` | `CONFIG.default_user_preferences.automatic_instance_redirect` |
| `captions` | `Array(String)` | `CONFIG.default_user_preferences.captions` |
| `comments` | `Array(String)` | `CONFIG.default_user_preferences.comments` |
| `continue` | `Bool` | `CONFIG.default_user_preferences.continue` |
| `continue_autoplay` | `Bool` | `CONFIG.default_user_preferences.continue_autoplay` |
| `dark_mode` | `String` | `CONFIG.default_user_preferences.dark_mode` |
| `theme` | `String` | `Invidious::Themes.normalize(CONFIG.default_user_preferences.theme)` |
| `theme_random` | `Bool` | `CONFIG.default_user_preferences.theme_random` |
| `theme_random_interval_hours` | `Int32` | `CONFIG.default_user_preferences.theme_random_interval_hours` |
| `theme_random_next_at` | `Int64?` | `nil` |
| `latest_only` | `Bool` | `CONFIG.default_user_preferences.latest_only` |
| `listen` | `Bool` | `CONFIG.default_user_preferences.listen` |
| `local` | `Bool` | `CONFIG.default_user_preferences.local` |
| `watch_history` | `Bool` | `CONFIG.default_user_preferences.watch_history` |
| `vr_mode` | `Bool` | `CONFIG.default_user_preferences.vr_mode` |
| `show_nick` | `Bool` | `CONFIG.default_user_preferences.show_nick` |
| `locale` | `String` | `CONFIG.default_user_preferences.locale` |
| `region` | `String?` | `CONFIG.default_user_preferences.region` |
| `timezone` | `String?` | `nil` |
| `max_results` | `Int32` | `CONFIG.default_user_preferences.max_results` |
| `notifications_only` | `Bool` | `CONFIG.default_user_preferences.notifications_only` |
| `player_style` | `String` | `CONFIG.default_user_preferences.player_style` |
| `video_codec` | `String` | `CONFIG.default_user_preferences.video_codec` |
| `preferred_audio` | `String` | `CONFIG.default_user_preferences.preferred_audio` |
| `quality` | `String` | `CONFIG.default_user_preferences.quality` |
| `quality_dash` | `String` | `CONFIG.default_user_preferences.quality_dash` |
| `default_home` | `String?` | `CONFIG.default_user_preferences.default_home` |
| `feed_menu` | `Array(String)` | `CONFIG.default_user_preferences.feed_menu` |
| `show_member_videos` | `Bool` | `CONFIG.default_user_preferences.show_member_videos` |
| `related_videos` | `Bool` | `CONFIG.default_user_preferences.related_videos` |
| `sort` | `String` | `CONFIG.default_user_preferences.sort` |
| `speed` | `Float32` | `CONFIG.default_user_preferences.speed` |
| `seek_seconds` | `Int32` | `Invidious::Videos::SeekPreferences.normalize(CONFIG.default_user_preferences.seek_seconds)` |
| `thin_mode` | `Bool` | `CONFIG.default_user_preferences.thin_mode` |
| `ui_density` | `String` | `CONFIG.default_user_preferences.ui_density` |
| `unseen_only` | `Bool` | `CONFIG.default_user_preferences.unseen_only` |
| `video_loop` | `Bool` | `CONFIG.default_user_preferences.video_loop` |
| `extend_desc` | `Bool` | `CONFIG.default_user_preferences.extend_desc` |
| `save_player_pos` | `Bool` | `CONFIG.default_user_preferences.save_player_pos` |
| `default_playlist` | `String?` | `nil` |
| `channel_spoiler_settings` | `Hash(String, Invidious::ChannelSpoilers::Rule)` | `{} of String => Invidious::ChannelSpoilers::Rule` |
| `sponsorblock_channel_overrides` | `Hash(String, Invidious::SponsorBlock::ChannelOverride)` | `{} of String => Invidious::SponsorBlock::ChannelOverride` |
| `sponsorblock_enabled` | `Bool` | `CONFIG.default_user_preferences.sponsorblock_enabled` |
| `sponsorblock_modes` | `Hash(String, String)` | `CONFIG.default_user_preferences.sponsorblock_modes.dup` |
| `sponsorblock_colors` | `Hash(String, String)` | `CONFIG.default_user_preferences.sponsorblock_colors.dup` |
| `dearrow_enabled` | `Bool` | `CONFIG.default_user_preferences.dearrow_enabled` |
| `ai_filter_enabled` | `Bool?` | `nil` |
| `dearrow_show_original` | `Bool` | `CONFIG.default_user_preferences.dearrow_show_original` |
| `search_privacy` | `Bool` | `CONFIG.default_user_preferences.search_privacy` |
| `chat_show_timestamps` | `Bool` | `true` |
| `chat_font_scale` | `Int32` | `100` |
| `chat_width_px` | `Int32` | `440` |
| `chat_overlay_mode` | `Bool` | `false` |
| `chat_overlay_opacity` | `Int32` | `75` |
| `chat_overlay_x` | `Int32` | `560` |
| `chat_overlay_y` | `Int32` | `50` |
| `chat_overlay_width` | `Int32` | `400` |
| `chat_overlay_height` | `Int32` | `750` |
| `chat_user_blacklist` | `String` | `""` |
| `chat_word_blacklist` | `String` | `""` |
| `ai_blocklist_action` | `String` | Legacy shared action; instance default |
| `ai_blocklist_feeds` | `Bool` | Legacy page switch; instance default |
| `ai_blocklist_feeds_action` | `String` effective getter | Explicit action, instance default, or legacy conversion |
| `ai_blocklist_search` | `Bool` | Legacy page switch; instance default |
| `ai_blocklist_search_action` | `String` effective getter | Explicit action, instance default, or legacy conversion |
| `ai_blocklist_recommendations` | `Bool` | Legacy page switch; instance default |
| `ai_blocklist_recommendations_action` | `String` effective getter | Explicit action, instance default, or legacy conversion |
| `ai_blocklist_other_pages` | `Bool` | Legacy page switch; instance default |
| `ai_blocklist_other_pages_action` | `String` effective getter | Explicit action, instance default, or legacy conversion |
| `ai_warnlist_action` | `String` | Legacy shared action; instance default |
| `ai_warnlist_feeds` | `Bool` | Legacy page switch; instance default |
| `ai_warnlist_feeds_action` | `String` effective getter | Explicit action, instance default, or legacy conversion |
| `ai_warnlist_search` | `Bool` | Legacy page switch; instance default |
| `ai_warnlist_search_action` | `String` effective getter | Explicit action, instance default, or legacy conversion |
| `ai_warnlist_recommendations` | `Bool` | Legacy page switch; instance default |
| `ai_warnlist_recommendations_action` | `String` effective getter | Explicit action, instance default, or legacy conversion |
| `ai_warnlist_other_pages` | `Bool` | Legacy page switch; instance default |
| `ai_warnlist_other_pages_action` | `String` effective getter | Explicit action, instance default, or legacy conversion |

`ai_filter_enabled` is stored as nullable internally but serializes its effective boolean. Canonical actions serialize their effective strings. Internal presence bookkeeping is excluded.
