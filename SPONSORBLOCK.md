# SponsorBlock

Preferences → SponsorBlock enables community segment data for watch and embed
players (excluding live streams). The feature defaults off. Each of the eight
categories defaults to manual skipping and supports these modes:

- `auto`: seek past the segment and briefly announce the skipped category.
- `manual`: show a Skip (Enter) button while inside the segment.
- `marker`: show the colored seek-bar range only.
- `disabled`: hide the category and do not skip or prompt.

Auto and manual modes also show seek-bar ranges. Dismissing a manual prompt hides
it until playback leaves the segment; revisiting the segment offers it again.
Enter respects focused form fields and controls. Colors accept six-digit hex
values. Disabling the master toggle preserves category choices.

Account and anonymous preferences, JSON/YAML import/export, and
`default_user_preferences` support `sponsorblock_enabled`, `sponsorblock_modes`,
and `sponsorblock_colors`. The latter two are maps keyed by `sponsor`, `selfpromo`,
`interaction`, `intro`, `outro`, `preview` (Recap), `music_offtopic`, and `filler`.
Missing or invalid values fall back to manual mode and the category's default color.
New interface strings use the existing English localization fallback.

`GET /api/v1/sponsorblock/:id` returns `{"segments":[{"id":"…","category":"sponsor","start":10.0,"end":20.0}]}`.
Invalid video IDs return HTTP 400. Missing data and upstream failures return an
empty array so playback continues. Invidious requests all eight skip categories
through SponsorBlock's four-character SHA-256 prefix API; browsers contact only
the Invidious instance. Successful, missing, and failed lookups are cached for
one hour, ten minutes, and thirty seconds respectively, with a 10,000-entry bound
and at most four concurrent upstream requests. No segment submissions or votes
are sent.

Data: [SponsorBlock](https://sponsor.ajay.app/),
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
