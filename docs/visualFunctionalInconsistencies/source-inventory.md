# Audited source inventory

[Audit index](README.md) · [Coverage](coverage.md) · [Findings](findings.md)

Baseline: `ce40c0a018d4071e16de8ac0cb92bcd1f54cd745`, inspected 2026-11-02. Every entry is assigned to the desktop coverage checklist. Inclusion records a reviewed presentation/interaction surface, not a claim that every branch or content combination was executed. Vendor minified code and assets are exercised through the shared player and excluded from these first-party counts.

## Templates and shared components (93)

| Source | Review coverage |
| --- | --- |
| [add_playlist_items.ecr](../../src/invidious/views/add_playlist_items.ecr) | Discovery, channel and library surfaces |
| [admin/bot_protection.ecr](../../src/invidious/views/admin/bot_protection.ecr) | Administration/verification |
| [admin/settings.ecr](../../src/invidious/views/admin/settings.ecr) | Administration/verification |
| [admin/standalone_shell.ecr](../../src/invidious/views/admin/standalone_shell.ecr) | Administration/verification |
| [channel.ecr](../../src/invidious/views/channel.ecr) | Discovery, channel and library surfaces |
| [channel_clips.ecr](../../src/invidious/views/channel_clips.ecr) | Clips |
| [channel_search.ecr](../../src/invidious/views/channel_search.ecr) | Discovery, channel and library surfaces |
| [clip_unavailable.ecr](../../src/invidious/views/clip_unavailable.ecr) | Clips |
| [community.ecr](../../src/invidious/views/community.ecr) | Discovery, channel and library surfaces |
| [components/ai-filter-empty.ecr](../../src/invidious/views/components/ai-filter-empty.ecr) | Discovery, channel and library surfaces |
| [components/ai-filter-status.ecr](../../src/invidious/views/components/ai-filter-status.ecr) | Discovery, channel and library surfaces |
| [components/browse_controls.ecr](../../src/invidious/views/components/browse_controls.ecr) | Discovery, channel and library surfaces |
| [components/channel_info.ecr](../../src/invidious/views/components/channel_info.ecr) | Discovery, channel and library surfaces |
| [components/channel_spoiler_scripts.ecr](../../src/invidious/views/components/channel_spoiler_scripts.ecr) | Discovery, channel and library surfaces |
| [components/clip_editor.ecr](../../src/invidious/views/components/clip_editor.ecr) | Watch, player and utility interactions |
| [components/clips.ecr](../../src/invidious/views/components/clips.ecr) | Clips |
| [components/dearrow_contributions.ecr](../../src/invidious/views/components/dearrow_contributions.ecr) | Watch, player and utility interactions |
| [components/item.ecr](../../src/invidious/views/components/item.ecr) | Discovery, channel and library surfaces |
| [components/items_paginated.ecr](../../src/invidious/views/components/items_paginated.ecr) | Discovery, channel and library surfaces |
| [components/player.ecr](../../src/invidious/views/components/player.ecr) | Watch, player and utility interactions |
| [components/player_sources.ecr](../../src/invidious/views/components/player_sources.ecr) | Watch, player and utility interactions |
| [components/video-actions-dialog.ecr](../../src/invidious/views/components/video-actions-dialog.ecr) | Discovery, channel and library surfaces |
| [create_clip.ecr](../../src/invidious/views/create_clip.ecr) | Clips |
| [create_playlist.ecr](../../src/invidious/views/create_playlist.ecr) | Discovery, channel and library surfaces |
| [delete_clip.ecr](../../src/invidious/views/delete_clip.ecr) | Clips |
| [delete_playlist.ecr](../../src/invidious/views/delete_playlist.ecr) | Discovery, channel and library surfaces |
| [edit_playlist.ecr](../../src/invidious/views/edit_playlist.ecr) | Discovery, channel and library surfaces |
| [embed.ecr](../../src/invidious/views/embed.ecr) | Discovery, channel and library surfaces |
| [error.ecr](../../src/invidious/views/error.ecr) | Reading/status/error and verification |
| [feeds/clips.ecr](../../src/invidious/views/feeds/clips.ecr) | Clips |
| [feeds/history.ecr](../../src/invidious/views/feeds/history.ecr) | Discovery, channel and library surfaces |
| [feeds/playlists.ecr](../../src/invidious/views/feeds/playlists.ecr) | Discovery, channel and library surfaces |
| [feeds/popular.ecr](../../src/invidious/views/feeds/popular.ecr) | Discovery, channel and library surfaces |
| [feeds/subscriptions.ecr](../../src/invidious/views/feeds/subscriptions.ecr) | Discovery, channel and library surfaces |
| [feeds/trending.ecr](../../src/invidious/views/feeds/trending.ecr) | Discovery, channel and library surfaces |
| [hashtag.ecr](../../src/invidious/views/hashtag.ecr) | Discovery, channel and library surfaces |
| [licenses.ecr](../../src/invidious/views/licenses.ecr) | Reading/status/error and verification |
| [message.ecr](../../src/invidious/views/message.ecr) | Reading/status/error and verification |
| [mix.ecr](../../src/invidious/views/mix.ecr) | Discovery, channel and library surfaces |
| [overhaul/ai_filter_matrix.ecr](../../src/invidious/views/overhaul/ai_filter_matrix.ecr) | Settings and enhancements |
| [overhaul/chat_preferences.ecr](../../src/invidious/views/overhaul/chat_preferences.ecr) | Watch, player and utility interactions |
| [overhaul/chat_settings.ecr](../../src/invidious/views/overhaul/chat_settings.ecr) | Watch, player and utility interactions |
| [overhaul/clips.ecr](../../src/invidious/views/overhaul/clips.ecr) | Clips |
| [overhaul/collection_toolbar.ecr](../../src/invidious/views/overhaul/collection_toolbar.ecr) | Discovery, channel and library surfaces |
| [overhaul/comment_config.ecr](../../src/invidious/views/overhaul/comment_config.ecr) | Watch, player and utility interactions |
| [overhaul/filter_chip.ecr](../../src/invidious/views/overhaul/filter_chip.ecr) | Discovery, channel and library surfaces |
| [overhaul/history_item.ecr](../../src/invidious/views/overhaul/history_item.ecr) | Discovery, channel and library surfaces |
| [overhaul/item.ecr](../../src/invidious/views/overhaul/item.ecr) | Discovery, channel and library surfaces |
| [overhaul/item_menu.ecr](../../src/invidious/views/overhaul/item_menu.ecr) | Discovery, channel and library surfaces |
| [overhaul/navigation.ecr](../../src/invidious/views/overhaul/navigation.ecr) | Shared shell and status |
| [overhaul/playlist_fields.ecr](../../src/invidious/views/overhaul/playlist_fields.ecr) | Discovery, channel and library surfaces |
| [overhaul/playlist_reference_actions.ecr](../../src/invidious/views/overhaul/playlist_reference_actions.ecr) | Discovery, channel and library surfaces |
| [overhaul/selection.ecr](../../src/invidious/views/overhaul/selection.ecr) | Discovery, channel and library surfaces |
| [overhaul/settings.ecr](../../src/invidious/views/overhaul/settings.ecr) | Settings and enhancements |
| [overhaul/settings_legacy_entry.ecr](../../src/invidious/views/overhaul/settings_legacy_entry.ecr) | Settings and enhancements |
| [overhaul/settings_navigation.ecr](../../src/invidious/views/overhaul/settings_navigation.ecr) | Settings and enhancements |
| [overhaul/shell.ecr](../../src/invidious/views/overhaul/shell.ecr) | Shared shell and status |
| [overhaul/sponsorblock_defaults.ecr](../../src/invidious/views/overhaul/sponsorblock_defaults.ecr) | Settings and enhancements |
| [overhaul/standalone_notice.ecr](../../src/invidious/views/overhaul/standalone_notice.ecr) | Shared shell and status |
| [overhaul/status_shell.ecr](../../src/invidious/views/overhaul/status_shell.ecr) | Shared shell and status |
| [overhaul/subscribe.ecr](../../src/invidious/views/overhaul/subscribe.ecr) | Discovery, channel and library surfaces |
| [overhaul/watch_chat.ecr](../../src/invidious/views/overhaul/watch_chat.ecr) | Watch, player and utility interactions |
| [overhaul/watch_clip_config.ecr](../../src/invidious/views/overhaul/watch_clip_config.ecr) | Watch, player and utility interactions |
| [overhaul/watch_clip_editor.ecr](../../src/invidious/views/overhaul/watch_clip_editor.ecr) | Watch, player and utility interactions |
| [overhaul/watch_comments.ecr](../../src/invidious/views/overhaul/watch_comments.ecr) | Watch, player and utility interactions |
| [overhaul/watch_description.ecr](../../src/invidious/views/overhaul/watch_description.ecr) | Watch, player and utility interactions |
| [overhaul/watch_destinations.ecr](../../src/invidious/views/overhaul/watch_destinations.ecr) | Watch, player and utility interactions |
| [overhaul/watch_heading.ecr](../../src/invidious/views/overhaul/watch_heading.ecr) | Watch, player and utility interactions |
| [overhaul/watch_queue.ecr](../../src/invidious/views/overhaul/watch_queue.ecr) | Watch, player and utility interactions |
| [overhaul/watch_recommendation.ecr](../../src/invidious/views/overhaul/watch_recommendation.ecr) | Watch, player and utility interactions |
| [overhaul/watch_recommendations.ecr](../../src/invidious/views/overhaul/watch_recommendations.ecr) | Watch, player and utility interactions |
| [overhaul/watch_transcript.ecr](../../src/invidious/views/overhaul/watch_transcript.ecr) | Watch, player and utility interactions |
| [playlist.ecr](../../src/invidious/views/playlist.ecr) | Discovery, channel and library surfaces |
| [post.ecr](../../src/invidious/views/post.ecr) | Discovery, channel and library surfaces |
| [privacy.ecr](../../src/invidious/views/privacy.ecr) | Reading/status/error and verification |
| [search.ecr](../../src/invidious/views/search.ecr) | Discovery, channel and library surfaces |
| [search_homepage.ecr](../../src/invidious/views/search_homepage.ecr) | Discovery, channel and library surfaces |
| [template.ecr](../../src/invidious/views/template.ecr) | Shared shell and status |
| [user/account.ecr](../../src/invidious/views/user/account.ecr) | Account, library or dedicated Settings |
| [user/authorize_token.ecr](../../src/invidious/views/user/authorize_token.ecr) | Account, library or dedicated Settings |
| [user/blocked_channels.ecr](../../src/invidious/views/user/blocked_channels.ecr) | Account, library or dedicated Settings |
| [user/channel_spoilers.ecr](../../src/invidious/views/user/channel_spoilers.ecr) | Account, library or dedicated Settings |
| [user/clear_watch_history.ecr](../../src/invidious/views/user/clear_watch_history.ecr) | Account, library or dedicated Settings |
| [user/data_control.ecr](../../src/invidious/views/user/data_control.ecr) | Account, library or dedicated Settings |
| [user/dearrow_identity.ecr](../../src/invidious/views/user/dearrow_identity.ecr) | Account, library or dedicated Settings |
| [user/delete_account.ecr](../../src/invidious/views/user/delete_account.ecr) | Account, library or dedicated Settings |
| [user/login.ecr](../../src/invidious/views/user/login.ecr) | Account, library or dedicated Settings |
| [user/sponsorblock_channels.ecr](../../src/invidious/views/user/sponsorblock_channels.ecr) | Account, library or dedicated Settings |
| [user/subscription_manager.ecr](../../src/invidious/views/user/subscription_manager.ecr) | Account, library or dedicated Settings |
| [user/token_manager.ecr](../../src/invidious/views/user/token_manager.ecr) | Account, library or dedicated Settings |
| [user/tv_pairing.ecr](../../src/invidious/views/user/tv_pairing.ecr) | Account, library or dedicated Settings |
| [verification.ecr](../../src/invidious/views/verification.ecr) | Reading/status/error and verification |
| [watch.ecr](../../src/invidious/views/watch.ecr) | Watch, player and utility interactions |

## Browser modules (50)

| Source | Review coverage |
| --- | --- |
| [_helpers.js](../../assets/js/_helpers.js) | Shared shell, storage and lifecycle suites |
| [account-forms.js](../../assets/js/account-forms.js) | Account/admin/verification suites |
| [blocked-channels.js](../../assets/js/blocked-channels.js) | Enhancement and dedicated-editor suites |
| [bot-protection.js](../../assets/js/bot-protection.js) | Account/admin/verification suites |
| [browse.js](../../assets/js/browse.js) | Discovery/library/actions suites |
| [browser-storage.js](../../assets/js/browser-storage.js) | Discovery/library/actions suites |
| [channel-spoiler-preferences.js](../../assets/js/channel-spoiler-preferences.js) | Enhancement and dedicated-editor suites |
| [channel-spoilers.js](../../assets/js/channel-spoilers.js) | Enhancement and dedicated-editor suites |
| [chat-preferences.js](../../assets/js/chat-preferences.js) | Player, watch, embed or utility suites |
| [chat-timing.js](../../assets/js/chat-timing.js) | Player, watch, embed or utility suites |
| [clip-editor.js](../../assets/js/clip-editor.js) | Player, watch, embed or utility suites |
| [clip-loader.js](../../assets/js/clip-loader.js) | Player, watch, embed or utility suites |
| [clip-player.js](../../assets/js/clip-player.js) | Player, watch, embed or utility suites |
| [clip-session.js](../../assets/js/clip-session.js) | Player, watch, embed or utility suites |
| [comment-threads.js](../../assets/js/comment-threads.js) | Player, watch, embed or utility suites |
| [dearrow-contributions.js](../../assets/js/dearrow-contributions.js) | Enhancement and dedicated-editor suites |
| [dearrow-identity.js](../../assets/js/dearrow-identity.js) | Enhancement and dedicated-editor suites |
| [dearrow-loader.js](../../assets/js/dearrow-loader.js) | Enhancement and dedicated-editor suites |
| [dearrow.js](../../assets/js/dearrow.js) | Enhancement and dedicated-editor suites |
| [embed.js](../../assets/js/embed.js) | Player, watch, embed or utility suites |
| [enhancements.js](../../assets/js/enhancements.js) | Enhancement and dedicated-editor suites |
| [handlers.js](../../assets/js/handlers.js) | Shared shell, storage and lifecycle suites |
| [library.js](../../assets/js/library.js) | Discovery/library/actions suites |
| [live-chat.js](../../assets/js/live-chat.js) | Player, watch, embed or utility suites |
| [notifications.js](../../assets/js/notifications.js) | Discovery/library/actions suites |
| [overhaul.js](../../assets/js/overhaul.js) | Shared shell, storage and lifecycle suites |
| [player-chapters.js](../../assets/js/player-chapters.js) | Player, watch, embed or utility suites |
| [player-dock.js](../../assets/js/player-dock.js) | Player, watch, embed or utility suites |
| [player-mobile.js](../../assets/js/player-mobile.js) | Player, watch, embed or utility suites |
| [player-settings.js](../../assets/js/player-settings.js) | Player, watch, embed or utility suites |
| [player-stats.js](../../assets/js/player-stats.js) | Player, watch, embed or utility suites |
| [player-stream-menu.js](../../assets/js/player-stream-menu.js) | Player, watch, embed or utility suites |
| [player-ui.js](../../assets/js/player-ui.js) | Player, watch, embed or utility suites |
| [player.js](../../assets/js/player.js) | Player, watch, embed or utility suites |
| [playlist-forms.js](../../assets/js/playlist-forms.js) | Discovery/library/actions suites |
| [settings-navigation.js](../../assets/js/settings-navigation.js) | Settings and preferences |
| [settings.js](../../assets/js/settings.js) | Settings and preferences |
| [sponsorblock-preferences.js](../../assets/js/sponsorblock-preferences.js) | Enhancement and dedicated-editor suites |
| [sponsorblock.js](../../assets/js/sponsorblock.js) | Enhancement and dedicated-editor suites |
| [sse.js](../../assets/js/sse.js) | Discovery/library/actions suites |
| [subscriptions.js](../../assets/js/subscriptions.js) | Discovery/library/actions suites |
| [themes.js](../../assets/js/themes.js) | Settings and preferences |
| [timezone.js](../../assets/js/timezone.js) | Settings and preferences |
| [transcript.js](../../assets/js/transcript.js) | Player, watch, embed or utility suites |
| [ui.js](../../assets/js/ui.js) | Shared shell, storage and lifecycle suites |
| [verification.js](../../assets/js/verification.js) | Account/admin/verification suites |
| [video-actions.js](../../assets/js/video-actions.js) | Discovery/library/actions suites |
| [watch-enhancements.js](../../assets/js/watch-enhancements.js) | Player, watch, embed or utility suites |
| [watch.js](../../assets/js/watch.js) | Player, watch, embed or utility suites |
| [watched_indicator.js](../../assets/js/watched_indicator.js) | Player, watch, embed or utility suites |

## Stylesheets (13)

| Source | Review coverage |
| --- | --- |
| [channel-spoilers.css](../../assets/css/channel-spoilers.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [chat-preferences.css](../../assets/css/chat-preferences.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [clips.css](../../assets/css/clips.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [dearrow-contributions.css](../../assets/css/dearrow-contributions.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [dearrow.css](../../assets/css/dearrow.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [embed.css](../../assets/css/embed.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [foundation.css](../../assets/css/foundation.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [live-chat.css](../../assets/css/live-chat.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [player-interface.css](../../assets/css/player-interface.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [player.css](../../assets/css/player.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [quality-selector.css](../../assets/css/quality-selector.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [verification.css](../../assets/css/verification.css) | Rendered page geometry and visual review; integrated feature screenshots |
| [watch-tools.css](../../assets/css/watch-tools.css) | Rendered page geometry and visual review; integrated feature screenshots |
