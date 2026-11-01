# D5 player implementation contract

[Master plan](README.md) · [Tasks](tasks.md) · [Progress](progress.md)

D5 is complete. This remains its source inventory and validation contract; the
[acceptance record](d5-acceptance.md) and [evidence](review/d5-evidence.json) record
the completed gates and their limits. D6 owns full utility-feature migration.

## Ownership

- `components/player.ecr` and `player_sources.ecr` keep source ordering, Companion/local delivery, audio identities, captions, VR and annotation assets. The native preference model and query overrides remain intact.
- `player.js` owns the Video.js instance, timeline, resume/sync, buffer refresh, captions, shortcuts and per-field persistence. Layout and utility UI must retain that instance and media element.
- `InvidiousStreamMenus` provides quality/audio descriptors and existing selection callbacks, including codec, bitrate, language, DRC and Auto identity. The new Settings hierarchy consumes those callbacks. The fallback selector retains its safe source/time/paused behavior.
- `player.statsForNerds` retains local diagnostics and sampling; `player.refreshBuffer` retains quality/audio/caption restoration. Their actions move under advanced Settings.
- `player-ui.js` owns standard/theater state through validated profile storage. `player-dock.js` owns opt-in docking, a stable placeholder, controls, exclusions and cleanup. Neither creates media.
- `watch.ecr` owns production details, creator/actions, one utility panel and existing metadata. The D1 watch fixture becomes the same production projection after migration. Public clip playback shares that shell; clip editor/library work retains D6 ownership.
- Queue recommendations reuse occurrence identity, cache-derived personalization, safe metadata and existing advancement semantics. Replay chat must stay outside the media container. D6 owns its complete panel-only control cleanup, transcripts and compact comment migration.

## Required validation

Verify standard/theater across videos, sessions and profiles; Queue → replay Chat → Up next precedence; Transcript opens only deliberately; available/empty/error states; unchanged media/time/rate/audio/captions through layout and tab changes. Verify default-off/opt-in docking, original space, return/dismiss, fullscreen/PiP/audio/clip exclusions, resize and cached-page cleanup.

Use the real Video.js synthetic media fixtures in Chromium and Firefox at 1280, 1440 and 1920 pixels. Verify DASH and fallback quality/codec/audio identity, custom current speed, caption selection/appearance/shortcuts, refresh and diagnostics; retain chapters/storyboards/SponsorBlock/annotations/VR and native/API contracts. Record browser/device limitations without claiming unsupported execution. Inspect light/dark, long/masked/unknown/RTL content, enlarged text and error recovery manually.
