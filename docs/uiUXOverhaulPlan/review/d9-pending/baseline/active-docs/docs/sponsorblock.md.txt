# SponsorBlock

[Documentation index](README.md)

SponsorBlock provides community timestamps for supported watch/embed players, excluding live streams. It defaults off. Enable it in Preferences; disabling the master preserves category choices.

| Mode | Behavior |
| --- | --- |
| `auto` | Seek past matching segments and briefly announce the category |
| `manual` | Show a Skip prompt while inside the segment; Enter activates it when focus permits |
| `marker` | Display the colored range without skipping/prompting |
| `disabled` | Hide the category and skip no segments |

Auto/manual modes also show colored ranges. Dismissing a manual prompt hides it until playback leaves the segment; re-entering offers it again. Keyboard handling respects focused input/controls. Category colors accept six-digit hex values; invalid colors fall back to defaults.

## Categories and overrides

The eight keys are `sponsor`, `selfpromo`, `interaction`, `intro`, `outro`, `preview` (Recap), `music_offtopic`, and `filler`. Missing/invalid mode entries fall back to manual. Preferences serialize the master, mode/color maps and per-channel overrides; instance defaults support the global maps.

`/preferences/sponsorblock/channels` manages account channel overrides. Overrides identify canonical channel IDs, retain display names, and inherit unset global choices. Per-channel master/modes can change effective behavior without duplicating every setting. Native sparse-patch null/removal and merge rules are in [mobile API](mobile-api.md#native-sponsorblock-settings).

Watch-page/browser controls can maintain current-profile temporary/local changes. They do not automatically mean that account defaults were saved. On sign-in/switch, storage follows the active profile and avoids reusing another account's choices.

## API and upstream data

`GET /api/v1/sponsorblock/:id` returns:

```json
{"segments":[{"id":"segment-id","category":"sponsor","start":10.0,"end":20.0}]}
```

Times are seconds. Invalid video IDs return 400. Missing data/upstream failure returns an empty segment list so ordinary playback can continue. The server requests all categories through the four-character SHA-256 prefix API; browsers call the instance rather than SponsorBlock directly. This implementation sends no segment submissions or votes.

Successful lookups cache for one hour, missing results for ten minutes and failures for thirty seconds. Caches are bounded at 10,000 entries with at most four concurrent upstream requests. SponsorBlock ranges coexist with manual chapter ticks and storyboard previews.

The source and data attribution are retained in [SPONSORBLOCK.md](../SPONSORBLOCK.md). Implementation: [sponsorblock.cr](../src/invidious/sponsorblock.cr), [browser player](../assets/js/sponsorblock.js), [channel settings](../src/invidious/routes/sponsorblock_preferences.cr). Tests: [spec/sponsorblock_spec.cr](../spec/sponsorblock_spec.cr) and [frontend checks](../tests/frontend/sponsorblock_checks.cr).
