# Preferences

Per-channel title and thumbnail hiding is available from Preferences and channel
or watch pages. Both switches share an optional upload-age delay, with explicit
thumbnail reveal and DeArrow title cycling. See [channel titles and thumbnails](channel-spoilers.md).

[Documentation index](README.md)

Open `/preferences` and save the form to apply settings. Guests store serialized preferences in the `PREFS` cookie, normally expiring after two years. Signed-in users store JSON in `users.preferences`. Defaults come from `default_user_preferences`, with converters and compatibility rules in [preferences.cr](../src/invidious/user/preferences.cr).

The [field inventory](reference/preferences.md) lists every model field, and [configuration defaults](reference/configuration.md) lists instance defaults. This guide explains behavior and scope rather than duplicating those tables.

## Persistence and precedence

Saved account fields or guest cookie values are parsed over instance defaults. A request may then override rendering through `hl`, `dark_mode`, `thin_mode` or [video query parameters](playback.md#watch-and-embed-query-options). Browser-local settings such as volume, search choices, temporary player changes and guest enhancements use isolated browser profiles; not every UI action rewrites account preferences.

Browser/account state must go through `InvidiousStorage`, not raw unscoped storage keys. Profile IDs are HMAC-derived ownership markers, not authentication tokens. Sign-in, signout, expiry and account switching change the active profile; stale tabs detect a mismatch and stop/reload instead of saving to the wrong account. See [frontend](frontend.md).

## Appearance and navigation

| Fields | Behavior |
| --- | --- |
| `locale`, `region`, `timezone` | Translation, supported regional requests, and history/calendar grouping; invalid timezone resolves to unset/UTC behavior |
| `dark_mode` | Empty/system, `light` or `dark`; separate from visual theme |
| `theme` | Supported theme ID; invalid values normalize to the default |
| `theme_random`, `theme_random_interval_hours`, `theme_random_next_at` | Automatic theme selection with persisted deadline; interval must be 1–168 hours, otherwise 6 |
| `ui_density` | `balanced` or `compact`; invalid values normalize to balanced |
| `thin_mode` | Reduced-image presentation; underlying content links/actions remain |
| `default_home`, `feed_menu` | Home destination and feed navigation entries |
| `show_nick` | Display username in supported navigation |
| `automatic_instance_redirect` | Automatic fallback-instance behavior where supported |

Registered theme options are Modern Neon (the default) and Diary. Theme rotation is applied during eligible document requests rather than by a permanent server timer. Theme-specific CSS/preview/font artwork lives in `assets/themes/`; [theming](theming.md) explains authoring.

## Playback and content

Playback preferences include autoplay/preload, listen/local proxy, quality/DASH quality, codec, speed, loop, continue/continue-autoplay, related videos, annotations, captions/comments source priority, expanded description, VR, player style and position saving. Defaults include autoplay false, DASH quality, codec `auto`, speed 1, watch history true and `save_player_pos` false.

`video_codec` accepts `auto`, `av1` or `h264`; invalid input becomes `auto`. Availability and decoding support determine what can actually play. Caption language preferences accept up to three selections in supported native patches; comments prioritize YouTube/Reddit. `save_player_pos` is an explicit opt-in independent of watch history, and disabling it deletes stored account positions.

`preferred_audio` selects the initial audio track for DASH video and audio-only playback on watch and embed pages. The default `original` uses original audio without Stable Volume; `original_stable` requests its Stable Volume variant. Language tags such as `id`, `en` and `pt-BR` select regular audio in that language. General languages can match regional variants; specific regional choices require an exact match. Missing languages or Stable Volume tracks fall back to regular original audio. Unsupported values become `original`. Where original identity is unknown, the existing playable default is retained. Manual player changes last for the current video, including buffer refreshes, and do not overwrite this preference. Progressive video with one embedded audio track retains that audio. The native sparse PATCH allowlist is unchanged.

Feed/library choices include `latest_only`, `unseen_only`, `notifications_only`, `max_results`, `sort`, `show_member_videos` and account `default_playlist`. Browser parsing clamps result counts to the application's maximum 1500; the native sparse patch requires 1–1500. Legacy and native validation are not identical.

`show_member_videos` defaults false and controls visibility rather than entitlement. `search_privacy` changes browser search submission. Manual channel blocks are stored separately from preferences. Detailed behavior is in [playback](playback.md), [discovery](search-and-feeds.md) and [accounts](accounts-and-library.md).

## Enhancements

SponsorBlock stores `sponsorblock_enabled`, category `sponsorblock_modes`, `sponsorblock_colors` and `sponsorblock_channel_overrides`. Defaults are disabled with manual category modes. Account saves, guest settings and temporary watch-page changes have different persistence boundaries. See [SponsorBlock](sponsorblock.md).

DeArrow uses `dearrow_enabled` and `dearrow_show_original`. Contributions/identity import are independent dedicated actions, and private identity material is excluded from preference JSON. See [DeArrow contributions](dearrow-contributions.md).

AI filtering uses a master plus eight page/list action strings. Discovery groups allow `off`, `hide`, `replace_thumbnail`; library/channel/queue allows only `off` and `replace_thumbnail`. All actions initially off. Legacy booleans/shared actions remain readable; effective canonical settings serialize on save/export. Explicit new values, saved legacy choices and instance defaults follow the precedence described in [AI filter](ai-channel-filter.md).

## Chat preferences

Archived-chat settings include timestamps, font scale, panel width, overlay enablement/opacity/geometry, user blacklist and word blacklist. Account API defaults are timestamps true, font scale 100, width 440 px, overlay false, opacity 75, and normalized geometry x=560/y=50/width=400/height=750 on a 0–1000 coordinate plane.

`PATCH /api/v1/auth/chat_preferences` validates known fields only: font 75–150, width 280–640, opacity 0–100, geometry within the normalized area, and each blacklist at most 1024 bytes. Concurrent conflicting updates can return 409. Guest browser controls can use a broader local UI range; do not assume they are all accepted by account API validation. Timing offsets are stored separately per account/video and range from -3,600,000 to +3,600,000 milliseconds.

## API update choices

`GET /api/v1/auth/preferences` returns the preference object. Legacy `POST` deserializes an entire replacement object; omitted fields can fall back to defaults and it does not behave like a sparse merge. Prefer supported native `PATCH` fields for clients that implement only part of the preference model: validation completes first, then stored JSON is locked/merged while retaining unrelated fields. Unsupported keys or invalid types return 400.

Native PATCH intentionally excludes some web-only fields, including theme rotation. Chat uses its own PATCH route. Retrieve updated values after saving where useful. Cookie-authenticated writes need CSRF; bearer tokens need the exact method/path scope. Full native allowlists and schemas are in [mobile API](mobile-api.md#safe-preference-updates).
