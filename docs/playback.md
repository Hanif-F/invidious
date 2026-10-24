# Playback, media and chat

[Documentation index](README.md)

`/watch?v=<video-id>` renders video metadata and a Video.js player. Invidious Companion supplies video extraction/playback information; configuring the web process and PostgreSQL alone is insufficient for working video playback. Media delivery also depends on upstream availability, browser decoding, selected formats and proxy settings.

## Streams and controls

The player supports adaptive DASH, upstream HLS where available, supported combined streams and audio-only listening. A detailed video response exposes `adaptiveFormats`, `formatStreams`, captions, DASH/HLS URLs and available audio metadata. Separate adaptive video/audio tracks must be played together by a capable player; downloading one does not produce a combined movie automatically.

Quality menus include resolution, FPS, codec and bitrate where known. Codec preference accepts Auto, AV1 or H.264 and applies to DASH. Resolution presets select resolution first, then codec/FPS/bitrate. Auto keeps the bandwidth selector within the preferred playable codec and falls back when unavailable. Manual selection overrides the preference for that video; choosing Auto restores it. Large resolution/FPS groups abbreviate manual options while retaining representative codec bitrate extremes; Auto still considers the full playable list.

Audio menus retain track identity/language and distinguish original/DRC or Stable Volume variants. An itag alone may not uniquely identify an audio track. Missing metadata should not be invented as a language/bitrate/codec guarantee. Physical decoding and browser fullscreen behavior require device checks beyond synthetic fixture tests.

The Preferred audio track setting selects Original Audio, Original Audio (Stable Volume), or a language, including regional variants. It applies to DASH and audio-only playback on watch/embed pages. Missing choices fall back to regular original audio; a general language can match regional tracks, while a specific variant must match exactly. Manual audio choices override the saved preference for the current video and survive buffer refreshes. Audio-only quality changes retain the selected language and processing variant. `/latest_version` accepts optional `audio_track` (the complete upstream track ID, or empty for legacy audio) and `is_drc=true|false` selectors alongside `itag`; these resolve against server metadata before Companion delegation. A vanished variant falls back to original audio. Requests without these selectors retain existing behavior.

Desktop volume persists per browser profile, independently from account preference JSON. It defaults to 100%; mute does not persist. Coarse-pointer mobile players use website volume 100% and device volume controls. Guest speed changes update guest preferences; account speed uses a CSRF-protected sparse PATCH. Volume query parameters and old volume preference fields do not control current persistence.

## Watch and embed query options

[video_preferences.cr](../src/invidious/videos/video_preferences.cr) resolves query values, saved preferences and instance defaults. Boolean video options normally accept `true` or `1`; explicit `false`/`0` disables where parsed. Site rendering overrides use their own rules.

| Query | Meaning |
| --- | --- |
| `v`, `list`, `index` | Watch video and optional playlist/occurrence context |
| `t`, `time_continue`, `start` | Start time, in that precedence; accepts the time forms supported by `decode_time` |
| `end` | End boundary; default is unrestricted |
| `autoplay`, `preload`, `loop` | Start/loading/repeat behavior |
| `continue`, `continue_autoplay` | Next-video continuation and autoplay policy |
| `listen`, `local` | Audio-only and instance proxy preference |
| `quality`, `quality_dash`, `video_codec` | Stream/quality/codec choices |
| `preferred_audio` | Initial audio choice: `original`, `original_stable`, or a supported language tag |
| `speed` | Playback rate, optionally suffixed `x` |
| `subtitles` | Comma-separated preferred caption languages |
| `comments` | Comma-separated comment-source priority |
| `related_videos`, `extend_desc`, `vr_mode`, `save_player_pos` | Page/player feature overrides |
| `player_style` | Player presentation style |
| `iv_load_policy` | Annotation policy; enabled value is 1 in this parser |
| `controls` | Numeric player control switch, enabled at values >=1 |
| `raw` | Numeric raw mode switch, enabled at 1 |
| `region` | Optional fetch region; not automatically inherited from every page preference |
| `hl`, `dark_mode`, `thin_mode` | Shared rendering overrides |

Server restrictions override requests: disabled DASH falls back to the alternate configured quality path, and disabled local proxy cannot be enabled by the query. Do not use URL overrides as authorization or durable account updates.

`/watch/:id`, `/shorts/:id`, `/live/:id`, `/w/:id`, `/v/:id`, `/e/:id` normalize compatible links. `/clip/:clip` distinguishes native/YouTube clips. `/embed/:id` renders the embeddable player, with `/embed/` handling compatible redirects/series. Private playlist access is owner-checked, including embed redirects and indexes. Native clip embeds are not implemented.

## Keyboard and mobile input

Page-wide shortcuts avoid focused inputs, links/buttons, menus, dialogs and editable content.

| Key | Action |
| --- | --- |
| Space or `k` | Play/pause |
| `m` | Mute |
| Up/down arrows | Volume ±10% |
| Left/right arrows | Seek by the selected interval in video seconds |
| `j` / `l` | Seek by the selected interval in video seconds |
| Top-row `0`–`9` | Seek to 0%–90%; numeric keypad ignored |
| `c` / `f` | Captions/fullscreen |
| Shift+`n` (`N`) | Next video when available |
| `,` / `.` | Pause and step approximately one 29.97-FPS frame backward/forward |
| `<` / `>` | Step playback rate |
| `-` / `=` | Caption size |
| `w` / `o` | Cycle caption window/text opacity |
| Enter | Active manual SponsorBlock skip prompt, when focus permits |

The existing `P` previous-video branch is a TODO; do not expect previous-video keyboard navigation. On desktop, wheel changes volume only while hovering the volume control. Mobile settings use a full-viewport dialog. Double-tapping an outer third queues signed seek steps; subsequent taps accumulate and commit after 500 ms inactivity while preserving playback state. These enhancements need JavaScript.

Playback preferences offer a Seek interval of 5, 10 (default), 20 or 30 seconds.
The shared player configuration supplies `seek_seconds` to watch, embed and clips,
including mobile tap batches and existing fixed-distance media-key actions.
Every jump uses video timeline seconds at any playback speed and keeps existing
seek bounds. Chapter jumps, frame steps, percentage shortcuts and queue navigation
retain their own behavior. See [preferences](preferences.md) for storage and sync.

## Captions, transcripts, chapters and annotations

Captions expose available labels/language codes and VTT track responses. Selected untranslated tracks use the configured Companion's private caption endpoint with a generated request check; public API URLs and attachment filenames stay unchanged. Without Companion, or for translation requests, the existing timedtext/Innertube backend remains in use. Empty/header-only, malformed and failed upstream responses return an error instead of a silent caption track. A modern Companion with captions enabled is required for the Companion path. Transcript selection uses its dedicated API; translation support differs by backend. The transcript UI supports text/timestamp navigation when upstream supplies data.

Manual chapter boundaries come from labeled description lines such as `1:23 Introduction` or `1:02:03 Finale`. Two distinct valid timestamps are sufficient; neither a zero timestamp nor ten-second sections is required. Automatic YouTube chapters and comment timestamps do not supply these chapters. The UI shows current chapter, ticks and combined SponsorBlock hover labels.

Storyboards provide sprite thumbnails and VTT references for seek previews. Legacy annotations are fetched from the archive path and optionally cached. They may be missing independently of video playback. VR applies only to supported projection metadata and capable players. See [API](api.md) for selectors and response representations.

Missing, null or incorrectly shaped storyboard containers/renderers produce an
empty storyboard list. This includes newly ended livestream recordings whose
preview metadata is not available yet; their video metadata and stream URLs stay
usable. An unavailable requested preview returns 404. Unexpected video metadata
serialization failures are logged and return an HTTP 500 JSON error, rather than
an empty successful response.

## Queue, recommendations and clips

Watch pages load playlist/mix queues using existing JSON/HTML endpoints. Current item state is occurrence-aware, so duplicate video IDs remain distinct. Owners can remove a local playlist occurrence. Removing the playing occurrence leaves its successor eligible rather than skipping it. Loading failures expose retry/end/empty states. Next-video continuation, recommendation autoplay and loop choices are separate preferences.

Recommendations respect supported manual blocks, member visibility and AI discovery-hide choices before autoplay selection. AI replacement preserves eligibility; library/queue AI actions never remove/reorder entries. Public playlist/mix JSON remains unfiltered and includes membership metadata; personalized HTML queues and native clients apply supported display settings.

Native clips use immutable stored boundaries and a local timeline while still depending on the source media. An unavailable/out-of-range source shows an unavailable clip without deleting its record. [Native clips](native-clips.md) covers bounded playback/editor behavior.

## Resume and synchronization

`save_player_pos` defaults false. With account sync enabled, the browser reads/writes `/api/v1/auth/playback/:id` and uses account state for resume/progress. Periodic saving runs at a 15-second interval with serialized ordinary requests; lifecycle/background delivery attempts improve persistence. Failed saves must not be treated as acknowledged. Operating-system termination can still prevent delivery.

`GET /api/v1/auth/playback` returns `{positions: {videoId: seconds}, watched: [videoId]}` once per page and refreshes on return, providing consistent thumbnail bars. Positions retain at most 1000 videos per account and expire after 365 days. Missing/invalid duration prevents partial bars. Turning sync off clears account positions; clearing watch history clears them too. A missing single position returns 404 and writes while sync is off return 409.

Without account sync, existing profile-local fallback is available. Local state is never silently copied from guest to account. Switching accounts invalidates stale tabs/callbacks. Physical mobile process-unload behavior remains a manual test, described in [frontend test notes](../tests/frontend/README.md#playback-sync).

## Archived chat replay

Replay is read-only and offered when `liveChatReplay` is true and the video is neither live nor upcoming. The public replay API returns messages, removals and an opaque continuation, with an offset in milliseconds. Initial requests obtain a replay continuation; subsequent requests reuse it. Invalid IDs, negative offsets, oversized continuations or offsets beyond duration are rejected. No replay returns 404; upstream failures return 503 without requiring playback to stop.

The browser synchronizes chat with playback and supports timestamps, font/panel sizing, user/word filters and a movable/resizable translucent overlay. Account preferences and per-video offsets use separate authenticated APIs; guests store supported choices locally. Positive offsets delay chat relative to video. Zero clears the stored offset. Native filters have their own RE2/J restrictions and should not be assumed identical to browser regular expressions; see [native chat contract](mobile-api.md#archive-chat-replay).

## Downloads and delivery

Browser `/download` and public native catalogs respect download restrictions and the selected source. Native `GET /api/v1/videos/:id/downloads` returns `{video, allowed, reason, choices}` for finite separate audio/video tracks and captions. It excludes combined `formatStreams`, active/upcoming/live-only segments and restricted IDs. Select a catalog key through `/download?key=...`; the server re-fetches metadata, verifies restrictions and resolves that exact track. It does not silently replace a removed track. Caption selections use the catalog label.

Media URLs can pass through `/videoplayback`, manifest rewrite routes or `/companion/*`; external public companion paths are separately configured. Image/storyboard routes use fixed upstream hosts. Proxy destinations/redirects are validated; a downloader cannot supply an arbitrary server redirect target. A proxy-disabled deployment may intentionally expose direct media URLs and cannot satisfy all locally proxied download workflows.

Downloads do not server-side mux/transcode separate tracks into a new file. Native app offline playback/export workflows described in the existing mobile guide belong to that external client, not this Crystal server.

## Diagnostics

Stats for nerds is opt-in from desktop controls or mobile settings. It shows available timing, buffering, rendition, codec/frame and network/player measurements, with unavailable values left unknown. Copy diagnostics creates an allowlisted local JSON snapshot; the panel performs no diagnostics upload. Disable stops observation. Native fullscreen/PiP cannot display the HTML overlay; return to inline playback to inspect it.
