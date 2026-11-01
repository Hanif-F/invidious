# Preferences

Per-channel title and thumbnail hiding is available from Preferences and channel
or watch pages. Both switches share an optional upload-age delay, with explicit
thumbnail reveal and DeArrow title cycling. See [channel titles and thumbnails](channel-spoilers.md).

[Documentation index](README.md)

`/preferences` opens Appearance in the category interface; `/preferences?section=<category>` opens a specific category. Search finds the owning category or dedicated editor. Category saves merge only their declared fields into the latest persisted preferences; cached legacy full-form POSTs remain compatible. Administrators use `/admin/settings` for instance configuration. Personal saves never change instance settings. Guests store serialized preferences in the `PREFS` cookie, normally expiring after two years. Signed-in users store JSON in `users.preferences`. Defaults come from `default_user_preferences`, with converters and compatibility rules in [preferences.cr](../src/invidious/user/preferences.cr).

Recognized old `/preferences#...` bookmarks open their current category and focus the field where possible. This includes array positions, SponsorBlock category controls, AI filtering, channel masking and the dedicated DeArrow identity editor. When scripting is absent or its navigation asset fails, the old anchor exposes an ordinary link naming the current destination. Unknown/malformed anchors leave Appearance usable. An explicit `section` takes precedence, and browser Back does not acquire an extra redirect entry. Old compact/reduced-image/player-style bookmarks explain their retirement without changing saved compatibility values.

The [field inventory](reference/preferences.md) lists every model field, and [configuration defaults](reference/configuration.md) lists instance defaults. This guide explains behavior and scope rather than duplicating those tables.

## Persistence and precedence

Saved account fields or guest cookie values are parsed over instance defaults. A request may then override rendering through `hl`, `dark_mode` or [video query parameters](playback.md#watch-and-embed-query-options). `thin_mode` remains supported by ordinary API HTML and native/legacy callers; desktop pages and `ui=desktop` fragments use the shared imagery/layout. Browser-local settings such as volume, search choices, temporary player changes and guest enhancements use isolated browser profiles; not every UI action rewrites account preferences.

Browser/account state must go through `InvidiousStorage`, not raw unscoped storage keys. Profile IDs are HMAC-derived ownership markers, not authentication tokens. Sign-in, signout, expiry and account switching change the active profile; stale tabs detect a mismatch and stop/reload instead of saving to the wrong account. See [frontend](frontend.md).

## Category ownership and writes

The authoritative ownership and validation manifest is [web_preferences.cr](../src/invidious/web_preferences.cr).
`POST /preferences` with a `section` owns only that category's fields:

| Category | Owned serialized fields |
| --- | --- |
| appearance | `dark_mode`, `show_nick` |
| language | `locale`, `region`, `timezone` |
| browsing | `default_home`, `feed_menu`, `show_member_videos`, `show_original_title`, `search_privacy`, `automatic_instance_redirect` |
| playback | `preload`, `autoplay`, `continue`, `continue_autoplay`, `video_loop`, `listen`, `local`, `quality`, `quality_dash`, `video_codec`, `preferred_audio`, `speed`, `seek_seconds`, `vr_mode`, `annotations`, `annotations_subscribed` |
| captions-comments | `captions`, `comments`, `related_videos`, `extend_desc` |
| library | `watch_history`, `save_player_pos`, `max_results`, `sort`, `latest_only`, `unseen_only`, `notifications_only`, `default_playlist` |
| sponsorblock | `sponsorblock_enabled`, `sponsorblock_modes`, `sponsorblock_colors` |
| dearrow | `dearrow_enabled`, `dearrow_show_original` |
| ai-filter | `ai_filter_enabled`, `ai_blocklist_feeds_action`, `ai_blocklist_search_action`, `ai_blocklist_recommendations_action`, `ai_blocklist_other_pages_action`, `ai_warnlist_feeds_action`, `ai_warnlist_search_action`, `ai_warnlist_recommendations_action`, `ai_warnlist_other_pages_action` |

Account category writes validate and merge into the latest raw JSON under an
account row lock. Unrelated, native-only and unknown fields survive, including
unknown SponsorBlock map entries. An omitted checkbox means false only within
the submitted category; omitted scalars, arrays and array positions retain their
latest values. Invalid input rejects the whole transaction. Disabling position
synchronization clears positions in the same transaction without disabling history.

Guest writes merge the actual raw `PREFS` cookie. Fresh browsers inherit defaults
through a sparse document; an oversized result is rejected rather than truncating
unrelated fields. Account writes never import the guest cookie. The library
category requires an account.

Dedicated owners stay outside category replacement: chat fields use the chat
endpoint, `channel_spoiler_settings` uses the channel visibility editor, and
`sponsorblock_channel_overrides` uses the per-channel SponsorBlock editor. Manual
blocks are separate database records, offsets are per video, and private DeArrow
identity is outside preference JSON and ordinary page configuration. See
[chat preferences](#chat-preferences), [channel visibility](channel-spoilers.md),
[SponsorBlock](sponsorblock.md), [account blocks](accounts-and-library.md) and
[DeArrow identity](dearrow-contributions.md) for their save and recovery behavior.

Native/legacy `ui_density`, `thin_mode`, `player_style`, chat overlay and legacy AI
fields remain readable/round-trippable without browser editors. The manifest's
`DEDICATED` and `PRESERVED_ONLY` lists define these boundaries; only the explicitly
retired theme keys described below are removed on saves.

## Appearance and navigation

| Fields | Behavior |
| --- | --- |
| `locale`, `region`, `timezone` | Translation, supported regional requests, and history/calendar grouping; invalid timezone resolves to unset/UTC behavior |
| `dark_mode` | System (empty), `light` or `dark` in the shared desktop design |
| `ui_density` | Retained for native/legacy round trips; the desktop interface uses one layout |
| `thin_mode` | Retained for native/legacy round trips; migrated desktop pages retain their images |
| `default_home`, `feed_menu` | Home destination and feed navigation entries |
| `show_nick` | Display username in supported navigation |
| `automatic_instance_redirect` | Automatic fallback-instance behavior where supported |

Desktop pages use shared neutral Light/Dark/System styles. Diary assets and the alternate browser layouts were retired after all page families migrated. Legacy `theme`, `theme_random`, `theme_random_interval_hours`, and `theme_random_next_at` fields are ignored in old preferences and configuration, omitted from new serialized output, and removed on subsequent saves. This explicit cleanup preserves other unknown fields. No database migration is required for the interface change.

## Playback and content

Playback preferences include autoplay/preload, listen/local proxy, quality/DASH quality, codec, speed, loop, continue/continue-autoplay, related videos, annotations, captions/comments source priority, expanded description, VR, player style and position saving. Defaults include autoplay false, DASH quality, codec `auto`, speed 1, watch history true and `save_player_pos` false.

**Seek interval** (`seek_seconds`) accepts integer 5, 10, 20 or 30, default 10.
It applies to mobile double-taps, arrows, J/L and fixed media-key jumps in video
timeline seconds, independently of playback speed. Android shares the account
field for taps, accessibility, PiP and Media3 commands. Signed-out web users use
the existing PREFS cookie; Android guests save per instance on their device.
Invalid/missing saved values use 10. Native PATCH rejects invalid values/types
atomically; older web forms that omit the field preserve it. JSON/YAML and portable
exports/imports retain it. Clients refresh on the existing account refresh/page
load schedule, without live push. Deploy backend support before distributing the
Android update; older servers retain Android's 10-second fallback and reject
unsupported account saves. No new endpoint, token scope or migration is required.

`video_codec` accepts `auto`, `av1` or `h264`; invalid input becomes `auto`. Availability and decoding support determine what can actually play. Caption language preferences accept up to three selections in supported native patches; comments prioritize YouTube/Reddit. `save_player_pos` is an explicit opt-in independent of watch history, and disabling it deletes stored account positions.

`preferred_audio` selects the initial audio track for DASH video and audio-only playback on watch and embed pages. The default `original` uses original audio without Stable Volume; `original_stable` requests its Stable Volume variant. Language tags such as `id`, `en` and `pt-BR` select regular audio in that language. General languages can match regional variants; specific regional choices require an exact match. Missing languages or Stable Volume tracks fall back to regular original audio. Unsupported values become `original`. Where original identity is unknown, the existing playable default is retained. Manual player changes last for the current video, including buffer refreshes, and do not overwrite this preference. Progressive video with one embedded audio track retains that audio. The native sparse PATCH accepts canonical `preferred_audio` choices with the existing preference scopes; invalid values reject the entire patch.

Feed/library choices include `latest_only`, `unseen_only`, `notifications_only`, `max_results`, `sort`, `show_member_videos` and account `default_playlist`. Browser parsing clamps result counts to the application's maximum 1500; the native sparse patch requires 1–1500. Legacy and native validation are not identical.

`show_member_videos` defaults false and controls visibility rather than entitlement. `search_privacy` changes browser search submission. Manual channel blocks are stored separately from preferences. Detailed behavior is in [playback](playback.md), [discovery](search-and-feeds.md) and [accounts](accounts-and-library.md).

**Show original title** (`show_original_title`) is in Browsing & feeds → Video pages
and defaults true, including older account preferences and guest cookies that omit
the field. It selects a video's non-translated title when available across browsing,
history, queues, watch/embed pages and video-bearing API responses. Turning it off
retains the existing upstream title; it does not request a translation in the UI's
language. Custom clip titles, playlist names and channel names are preserved.
DeArrow may still replace the selected title, and spoiler rules still hide it.

Original titles come from server-side YouTube oEmbed requests, using the configured
outbound proxy. A separate cache retains successes for six hours, unavailable
titles for ten minutes and transient failures for thirty seconds. Cold responses
wait up to five additional seconds with at most four outbound lookups per process;
failed or unfinished lookups retain the existing title. Migration 24 creates the
cache and requires no metadata backfill. Older preference forms that omit this
control preserve the saved choice. JSON/YAML preferences and portable backups
retain it; the native sparse PATCH accepts only booleans.

## Enhancements

SponsorBlock stores `sponsorblock_enabled`, category `sponsorblock_modes`, `sponsorblock_colors` and `sponsorblock_channel_overrides`. Defaults are disabled with manual category modes. Account saves, guest settings and temporary watch-page changes have different persistence boundaries. See [SponsorBlock](sponsorblock.md).

DeArrow uses `dearrow_enabled` and `dearrow_show_original`. Contributions/identity import are independent dedicated actions, and private identity material is excluded from preference JSON. See [DeArrow contributions](dearrow-contributions.md).

AI filtering uses a master plus eight page/list action strings. Discovery groups allow `off`, `hide`, `replace_thumbnail`; library/channel/queue allows only `off` and `replace_thumbnail`. All actions initially off. Legacy booleans/shared actions remain readable; effective canonical settings serialize on save/export. Explicit new values, saved legacy choices and instance defaults follow the precedence described in [AI filter](ai-channel-filter.md).

## Chat preferences

Archived-chat settings include timestamps, font scale, panel width, overlay enablement/opacity/geometry, user blacklist and word blacklist. Account API defaults are timestamps true, font scale 100, width 440 px, overlay false, opacity 75, and normalized geometry x=560/y=50/width=400/height=750 on a 0–1000 coordinate plane.

`PATCH /api/v1/auth/chat_preferences` validates known fields only: font 75–150, width 280–640, opacity 0–100, geometry within the normalized area, and each blacklist at most 1024 bytes. Concurrent conflicting updates can return 409. The browser is panel-only and exposes no overlay editor. Its font scale (75–150%), panel width (280–640 px) and hide-user-ID choice are profile-local, including for signed-in users. Account saves patch timestamps and the two blacklists only, preserving native font/width/overlay values. Guest choices remain in the guest profile. Timing offsets are stored separately per account/video and range from -3,600,000 to +3,600,000 milliseconds.

## Browser drafts and save verification

The category interface searches public field/category descriptions and option metadata locally and retains at most nine category drafts in page memory. It excludes private playlist names from the search index and never serializes drafts into history or browser storage. Save/Discard affects the active category; Discard restores its last confirmed page snapshot, and leaving dirty drafts retains the departure warning. `redirect=false` retains canonical preferences/fingerprint and adds owning category values/profile; an independent `format=json` GET verifies those values before reporting Saved. An unrelated category change does not invalidate the save. Failed or unconfirmed saves retain the draft and offer reload without automatically retrying a write. The read-back also detects a guest cookie that the browser did not retain. Language changes apply on subsequent pages. Ordinary HTML POST redirects and no-JavaScript category forms remain supported.

Cached legacy full-form POSTs and their canonical receipts remain server-compatible;
their template and browser controller have been retired. Traditional checkboxes
retain unchecked semantics, while omitted scalars, array positions and native-only
choices come from the latest stored document. A presence marker distinguishes
an unchecked legacy reduced-image control from omission. Recognized old AI forms
retain their group semantics; version-2 forms own the master and canonical actions.
Dedicated chat, identity, block and channel-rule data stays separate. Legacy saves,
header color-mode changes and timezone detection use transactional compare-and-set
with bounded retries after a known database conflict, preserving other fields.

## API update choices

`GET /api/v1/auth/preferences` returns the preference object. Legacy `POST` deserializes an entire replacement object; omitted fields can fall back to defaults and it does not behave like a sparse merge. Prefer supported native `PATCH` fields for clients that implement only part of the preference model: validation completes first, then stored JSON is locked/merged while retaining unrelated fields. Unsupported keys or invalid types return 400.

Native PATCH intentionally excludes some web-only fields, including chat settings. Chat uses its own PATCH route. Retrieve updated values after saving where useful. Cookie-authenticated writes need CSRF; bearer tokens need the exact method/path scope. Full native allowlists and schemas are in [mobile API](mobile-api.md#safe-preference-updates).
