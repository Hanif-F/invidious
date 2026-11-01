# D5 — watch layout and player hierarchy accepted

[Master plan](README.md) · [Tasks](tasks.md) · [Coverage](coverage.md) · [Evidence](review/d5-evidence.json)

D5 is complete on 27 October 2026. D6–D9 remain required for the overall overhaul.
This checkpoint covers the production watch/player layout and controls; feature
migration inside comments, transcript, replay, clip editing and enhancement
editors remains D6. No remote deployment or Git commit was performed.

## Result and behavior

One existing Video.js media element serves Standard/Theater layouts, utility tabs,
player Settings, fullscreen, native PiP and optional docking. Standard/Theater and
docking use validated profile-local storage; docking defaults off. Utility defaults
are Queue → replay Chat → Up next, while Transcript opens deliberately. Portrait
media is centered within its viewport-height limit, and pages without utilities
use the available column. Creator identity/Subscribe and Save/Share/Clip/More have
deliberate owners. Title cycling uses local SVGs and never reveals masked names
merely through hover/focus; the explicit thumbnail reveal stays separate from Play.
The D1 preview wrapper is removed: every watch fixture uses production directly.

Settings consumes the existing quality/audio callbacks, exact source metadata,
custom speeds, caption selection/appearance, buffer refresh and local diagnostics.
Native progressive loading resets are restored without persisting intermediate
rate changes. Failed/empty and unresolved caption loads retain actionable explicit
retries; the latter reports a waiting state after eight seconds. Media identity,
position, rate, volume and pause survive the relevant layout/control transitions.

Owned queue links carry ordinal and stable decimal occurrence identity. Canonical
optional desktop snapshots preserve duplicates, private visibility, removed-current
successors, positions and counts. Ambiguous removals retry only reads; stale reads
cannot rewrite a newer cached-page lifetime. Default native JSON and ordinary HTML
outer wire fields remain unchanged. Private queue snapshots are no-store.

## Verification and limits

The final full desktop suite passed **130/130** cases, including **40 D5** cases;
the final focused D5 pass is also **40/40**. The broader affected regression set
passed **217/217** before the final D5-only visual refinements. Final masking/player/
clip/stream/sync units passed **36/36**, and final targeted title/reveal checks pass
in both engines. The evidence records commands and exact case names.

Real locally generated media decodes progressive VP8 sizes, portrait frames, AAC
listening and DASH with two H.264 renditions plus distinct language/DRC audio.
Chromium and Firefox cover 1280×720, 1440×900 and 1920×1080, enlarged RTL, forced
colors, profile/tab switching, cached-page interruption, fullscreen and exposed
native PiP APIs. Guarded PostgreSQL, fixtures, normal/API-only type checks, format,
generated-reference/link and whitespace checks pass. Existing monotonic warnings
are recorded; all eight original D1 approval images remain unchanged.

Supplemental existing player checks passed 12/14: desktop shortcuts/volume, codec
initialization, chapters, SponsorBlock hover priority and thumbnail-preview/embed
paths pass. Two 390px touch-only tooltip bounds cases fail; mobile website
acceptance is expressly deferred by the plan, and D8 owns legacy-test reconciliation.
The native/API data contract remains in scope. Local fixtures do not establish
live extraction/Companion availability, physical OS window appearance, specialist
VR hardware behavior, upstream annotation availability or remote deployment.

## Reviewed images

The following images were inspected manually; they are synthetic local content.

### Standard watch / light

![Standard watch / light](review/chromium-d5-single-light-1440.png)

### Owned queue / dark

![Owned queue / dark](review/chromium-d5-owned-dark-1440.png)

### Owned queue / light / Firefox

![Owned queue / light / Firefox](review/firefox-d5-owned-light-1440.png)

### Replay outside media / light / failed read

![Replay outside media / light / failed read](review/chromium-d5-replay-light-1440.png)

### Replay outside media / dark / Firefox

![Replay outside media / dark / Firefox](review/firefox-d5-replay-dark-1440.png)

### Centered portrait / light / Firefox

![Centered portrait / light / Firefox](review/firefox-d5-portrait-light-1440.png)

### Long literal multilingual title / dark

![Long literal multilingual title / dark](review/chromium-d5-long-dark-1440.png)

### Audio listening / light / Firefox

![Audio listening / light / Firefox](review/firefox-d5-audio-light-1440.png)

### Single column without utilities / dark

![Single column without utilities / dark](review/chromium-d5-no-tools-dark-1440.png)

### Enlarged RTL player menu / Firefox

![Enlarged RTL player menu / Firefox](review/firefox-d5-rtl-enlarged.png)

### Forced colors and keyboard focus

![Forced colors and keyboard focus](review/chromium-d5-forced-colors.png)

### Theater / light

![Theater / light](review/chromium-d5-theater-light-1440.png)

### Optional dock / light / Firefox

![Optional dock / light / Firefox](review/firefox-d5-docked-light-1440.png)

### Hidden title, cycle icon and explicit thumbnail reveal

![Hidden title, cycle icon and explicit thumbnail reveal](review/chromium-d5-title-hidden-light-1440.png)

### Decoded DASH / unified Settings / dark

![Decoded DASH / unified Settings / dark](review/chromium-d5-dash-settings-dark-1440.png)
